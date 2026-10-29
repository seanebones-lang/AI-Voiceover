import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import audio_utils as au  # noqa: E402

SR = 24000


def tone(seconds, freq=220.0, amp=0.3):
    t = np.arange(int(SR * seconds)) / SR
    return (amp * np.sin(2 * np.pi * freq * t)).astype(np.float32)


def silence(seconds):
    return np.zeros(int(SR * seconds), dtype=np.float32)


def test_trim_silence_keeps_speech_and_small_padding():
    wav = np.concatenate([silence(0.5), tone(1.0), silence(0.7)])
    out = au.trim_silence(wav, SR, pad_ms=40)
    assert 1.0 <= len(out) / SR <= 1.1


def test_remove_tail_artifacts_drops_isolated_blip_after_long_gap():
    wav = np.concatenate([tone(1.0), silence(0.6), tone(0.1), silence(0.1)])
    out = au.remove_tail_artifacts(wav, SR)
    assert len(out) / SR < 1.2


def test_remove_tail_artifacts_keeps_real_last_word():
    wav = np.concatenate([tone(1.0), silence(0.3), tone(0.5)])
    assert len(au.remove_tail_artifacts(wav, SR)) == len(wav)


def test_compress_pauses_shortens_only_long_gaps():
    wav = np.concatenate([tone(0.5), silence(1.5), tone(0.5), silence(0.3), tone(0.5)])
    out = au.compress_pauses(wav, SR, max_pause_s=0.6, keep_s=0.3)
    assert abs(len(out) / SR - (1.5 + 0.3 + 0.3)) < 0.06


def test_match_levels_pulls_segments_toward_median():
    chunks = [tone(1.0, amp=0.05), tone(1.0, amp=0.3), tone(1.0, amp=0.32)]
    out = au.match_levels(chunks, SR, max_adjust_db=20)
    levels = [au.active_rms_db(c, SR) for c in out]
    assert max(levels) - min(levels) < 1.0


def test_join_segments_inserts_requested_pauses():
    out = au.join_segments([tone(0.5), tone(0.5)], [0.25, 0.0], SR)
    assert abs(len(out) / SR - 1.25) < 0.001


def test_loudness_normalize_hits_target_without_exceeding_peak():
    pyln = pytest.importorskip("pyloudnorm")
    out = au.loudness_normalize(tone(3.0, amp=0.02), SR, target_lufs=-19.0, peak_db=-1.0)
    assert abs(pyln.Meter(SR).integrated_loudness(out.astype(np.float64)) + 19.0) < 0.5
    assert np.max(np.abs(out)) <= 10 ** (-1.0 / 20) + 1e-4


def test_encode_wav_roundtrip():
    data, media = au.encode(tone(0.2), SR, "wav")
    assert media == "audio/wav" and data[:4] == b"RIFF"


@pytest.mark.skipif(not au.ffmpeg_filters(), reason="ffmpeg not installed")
def test_pitch_shift_preserves_duration_and_special_effects_run():
    wav = tone(1.0)
    shifted = au.shift_pitch(wav, SR, 3.0)
    assert abs(len(shifted) - len(wav)) < SR * 0.05
    for effect in ("robot", "radio", "telephone", "megaphone", "underwater", "cave", "whisper", "deep", "chipmunk"):
        out = au.apply_special_effect(wav, SR, effect)
        assert len(out) > 0 and np.isfinite(out).all(), effect


@pytest.mark.skipif(not au.ffmpeg_filters(), reason="ffmpeg not installed")
def test_deep_lowers_pitch():
    wav = tone(1.0, freq=300.0)
    out = au.apply_special_effect(wav, SR, "deep")
    spectrum = np.abs(np.fft.rfft(out[: SR // 2]))
    peak_hz = np.argmax(spectrum) * SR / (SR // 2)
    assert peak_hz < 280
