import io
import json
import os
import shutil
import sys

import numpy as np
import pytest
import soundfile as sf

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import audio_utils as au  # noqa: E402
from pipeline import CLONE_PRESETS, RenderRequest, ServiceError, VoiceService  # noqa: E402

pytestmark = pytest.mark.skipif(not shutil.which("ffmpeg"), reason="ffmpeg not installed")

GATE = {"strict_reject_mode": True, "minimum_duration_seconds": 4, "minimum_sample_rate_hz": 16000,
        "minimum_quality_score": 55}


def speechlike(seconds, sr=44100, seed=0):
    """Amplitude-modulated harmonic signal with pauses: enough structure for the analyzers."""
    rng = np.random.default_rng(seed)
    t = np.arange(int(sr * seconds)) / sr
    f0 = 140 + 20 * np.sin(2 * np.pi * 0.7 * t)
    voiced = sum(np.sin(2 * np.pi * k * np.cumsum(f0) / sr) / k for k in range(1, 6))
    envelope = (np.sin(2 * np.pi * 2.5 * t) > -0.3).astype(float)
    sig = 0.25 * voiced * envelope + 0.0005 * rng.standard_normal(len(t))
    lead = np.zeros(int(sr * 1.5))
    return np.concatenate([lead, sig, lead]).astype(np.float32), sr


def wav_bytes(seconds, seed=0):
    sig, sr = speechlike(seconds, seed=seed)
    buf = io.BytesIO()
    sf.write(buf, sig, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


@pytest.fixture
def service(tmp_path):
    return VoiceService(tmp_path)


def test_create_clone_writes_cleaned_references_and_metadata(service, tmp_path):
    out = service.create_clone("My Voice", "test", [("a.wav", wav_bytes(12)), ("b.wav", wav_bytes(10, seed=1))], GATE)
    meta = out["meta"]
    assert meta["voice_id"].startswith("clone_my_voice_")
    assert len(meta["references"]) == 2
    for ref in meta["references"]:
        path = tmp_path / meta["voice_id"] / ref["file"]
        data, sr = sf.read(str(path))
        assert sr == 24000
        # dead air at both ends is trimmed: uploads were 1.5 s silence + speech + 1.5 s silence
        source_seconds = 12 if ref["source"] == "upload_0.wav" else 10
        assert source_seconds - 1.0 < len(data) / sr < source_seconds + 0.6
    assert meta["default_tuning"]["clone_preset"] in CLONE_PRESETS
    listed = service.cloned_voice_list()
    assert [v["voice_id"] for v in listed] == [meta["voice_id"]]

    with pytest.raises(ServiceError) as dup:
        service.create_clone("My Voice", None, [("a.wav", wav_bytes(12))], GATE)
    assert dup.value.status == 409


def test_quality_gate_rejects_too_little_speech(service, tmp_path):
    with pytest.raises(ServiceError) as err:
        service.create_clone("Tiny", None, [("t.wav", wav_bytes(1.5))], GATE)
    assert err.value.status == 400
    assert not any(tmp_path.iterdir())  # nothing left behind


def test_legacy_voice_is_migrated_to_one_clean_reference_per_take(service, tmp_path):
    vid = "clone_old_abc123"
    vdir = tmp_path / vid
    vdir.mkdir()
    sig, sr = speechlike(8)
    for i in range(2):
        sf.write(str(vdir / f"sample_{i}.mp3.wav"), sig, sr)  # stand-in for the original upload
        resampled = au.decode_audio(str(vdir / f"sample_{i}.mp3.wav"), 24000)
        sf.write(str(vdir / f"sample_{i}_converted.wav"), resampled, 24000)
        sf.write(str(vdir / f"sample_{i}_converted_preprocessed.wav"), resampled, 24000)
    legacy = {
        "voice_id": vid,
        "name": "Old",
        "sample_files": [str(vdir / f) for f in sorted(os.listdir(vdir)) if "_converted" in f],
        "default_tuning": {"clone_preset": "natural", "temperature": 0.63, "repetition_penalty": 1.68},
    }
    (tmp_path / f"{vid}.json").write_text(json.dumps(legacy))

    refs = service.reference_paths(service.read_meta(vid))
    assert sorted(os.path.basename(r) for r in refs) == ["ref_0.wav", "ref_1.wav"]
    migrated = service.read_meta(vid)
    assert all(r["source"].endswith("_converted.wav") for r in migrated["references"])
    # second call reuses the migrated references
    assert service.reference_paths(migrated) == refs


def test_sampling_precedence(service):
    legacy_meta = {"default_tuning": {"clone_preset": "natural", "temperature": 0.63, "repetition_penalty": 1.68}}
    # Legacy raw values without the "custom" flag are ignored in favour of the tuned preset.
    t, rp, k, p, name = service.sampling_params(RenderRequest(text="x", voice_id="clone_x"), legacy_meta)
    assert (t, rp, k, p, name) == (*CLONE_PRESETS["natural"], "natural")
    custom = {"default_tuning": {"clone_preset": "stable", "temperature": 0.5, "custom": True}}
    t, *_ , name = service.sampling_params(RenderRequest(text="x", voice_id="clone_x"), custom)
    assert (t, name) == (0.5, "stable")
    req = RenderRequest(text="x", voice_id="clone_x", clone_preset="expressive", temperature=0.9)
    t, rp, *_ , name = service.sampling_params(req, custom)
    assert (t, rp, name) == (0.9, CLONE_PRESETS["expressive"][1], "expressive")


def test_update_tuning_validates_and_resets(service):
    service.create_clone("Tune Me", None, [("a.wav", wav_bytes(10))], GATE)
    vid = service.cloned_voice_list()[0]["voice_id"]
    saved = service.update_tuning(vid, {"clone_preset": "stable", "temperature": 9})
    assert saved == {"clone_preset": "stable", "temperature": 1.5, "custom": True}
    with pytest.raises(ServiceError):
        service.update_tuning(vid, {"clone_preset": "loud"})
    assert service.update_tuning(vid, None) == {"clone_preset": "natural"}


def test_render_reports_unknown_voice_and_unloaded_engines(service):
    with pytest.raises(ServiceError) as unknown:
        service.render(RenderRequest(text="hello", voice_id="nope"))
    assert unknown.value.status == 404
    with pytest.raises(ServiceError) as loading:
        service.render(RenderRequest(text="hello", voice_id="female_english"))
    assert loading.value.status == 503
    with pytest.raises(ServiceError) as bad_id:
        service.render(RenderRequest(text="hello", voice_id="clone_../../etc"))
    assert bad_id.value.status in (400, 503)


def test_delete_clone(service, tmp_path):
    service.create_clone("Bye", None, [("a.wav", wav_bytes(10))], GATE)
    vid = service.cloned_voice_list()[0]["voice_id"]
    service.delete_clone(vid)
    assert service.cloned_voice_list() == []
    assert not (tmp_path / vid).exists()
    with pytest.raises(ServiceError):
        service.delete_clone(vid)


def test_add_samples_appends_takes_and_enforces_cap(service, tmp_path):
    service.create_clone("Grow", None, [("a.wav", wav_bytes(10))], GATE)
    vid = service.cloned_voice_list()[0]["voice_id"]
    before = service.read_meta(vid)["reference_seconds"]
    out = service.add_samples(vid, [("b.wav", wav_bytes(12, seed=3))], GATE)
    meta = out["meta"]
    assert [r["file"] for r in meta["references"]] == ["ref_0.wav", "ref_1.wav"]
    assert meta["reference_seconds"] > before
    assert (tmp_path / vid / "ref_1.wav").exists()
    with pytest.raises(ServiceError) as cap:
        service.add_samples(vid, [("x.wav", wav_bytes(5))] * 7, GATE)
    assert cap.value.status == 400
    with pytest.raises(ServiceError):
        service.add_samples(vid, [("tiny.wav", wav_bytes(1.5))], GATE)
    assert not (tmp_path / vid / "ref_2.wav").exists()
    assert len(service.read_meta(vid)["references"]) == 2
