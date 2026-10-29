"""
Request → audio. Routes each voice to its local engine, prepares text, renders segments,
stitches them, applies prosody/effects, and encodes. Also owns cloned-voice storage.
"""

import datetime
import hashlib
import json
import logging
import os
import re
import shutil
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

import audio_utils as au
import text_utils as tu
from normalize_en import normalize_english
from kokoro_engine import KokoroEngine, PHONEME_MARKUP_LANGS
from xtts_engine import XttsEngine, LANGUAGES as XTTS_LANGUAGES

logger = logging.getLogger(__name__)

SAMPLE_RATE = 24000
STOCK_VOICES_PATH = Path(__file__).resolve().parent / "stock_voices.json"
REF_SR = 24000

# Sampling presets for XTTS (temperature, repetition_penalty, top_k, top_p).
CLONE_PRESETS: Dict[str, Tuple[float, float, int, float]] = {
    "natural": (0.70, 4.0, 50, 0.85),
    "expressive": (0.80, 3.0, 60, 0.90),
    "stable": (0.60, 5.0, 40, 0.80),
}
DEFAULT_PRESET = "natural"


class ServiceError(Exception):
    def __init__(self, status: int, detail: str):
        super().__init__(detail)
        self.status = status
        self.detail = detail


@dataclass
class RenderRequest:
    text: str
    voice_id: str
    language: str = "en"
    speed: float = 1.0
    pitch: float = 0.0
    volume: float = 1.0
    effects: Dict = field(default_factory=dict)
    pronunciation_overrides: Optional[Dict[str, str]] = None
    clone_preset: Optional[str] = None
    temperature: Optional[float] = None
    repetition_penalty: Optional[float] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    output_format: str = "wav"
    normalize: bool = True


@dataclass
class RenderResult:
    audio: bytes
    media_type: str
    headers: Dict[str, str]


def load_stock_voices() -> Dict[str, dict]:
    with open(STOCK_VOICES_PATH, encoding="utf-8") as f:
        data = json.load(f)
    return {v["voice_id"]: v for v in data["voices"]}


def _clamp(x, lo, hi):
    return max(lo, min(hi, x))


class VoiceService:
    def __init__(self, voices_dir: Path, device: str = "cpu"):
        self.voices_dir = voices_dir
        self.kokoro = KokoroEngine(device)
        self.xtts = XttsEngine(device)
        self.stock = load_stock_voices()

    # ------------------------------------------------------------ catalog

    def stock_voice_list(self) -> List[dict]:
        out = []
        for v in self.stock.values():
            engine = self.kokoro if v["engine"] == "kokoro" else self.xtts
            out.append({
                "voice_id": v["voice_id"],
                "name": v["name"],
                "language": v["language"],
                "gender": v.get("gender"),
                "description": v.get("description"),
                "engine": v["engine"],
                "source": "local",
                "category": "studio" if v["voice_id"].startswith("studio_") else "standard",
                "available": engine.ready,
            })
        return out

    def voice_meta_path(self, voice_id: str) -> Path:
        if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", voice_id or ""):
            raise ServiceError(400, "Invalid voice_id")
        return self.voices_dir / f"{voice_id}.json"

    def read_meta(self, voice_id: str) -> dict:
        path = self.voice_meta_path(voice_id)
        if not path.exists():
            raise ServiceError(404, f"Voice not found: {voice_id}")
        with open(path, encoding="utf-8") as f:
            return json.load(f)

    def write_meta(self, meta: dict) -> None:
        path = self.voice_meta_path(meta["voice_id"])
        tmp = path.with_suffix(".json.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(meta, f, indent=2)
        os.replace(tmp, path)

    def cloned_voice_list(self) -> List[dict]:
        voices = []
        for p in sorted(self.voices_dir.glob("*.json")):
            try:
                with open(p, encoding="utf-8") as f:
                    d = json.load(f)
                voices.append({
                    "voice_id": d.get("voice_id"),
                    "name": d.get("name"),
                    "description": d.get("description"),
                    "created_at": d.get("created_at"),
                    "source": "cloned",
                    "real_clone": True,
                    "quality_score": d.get("quality_score"),
                    "quality_tier": d.get("quality_tier"),
                    "reference_seconds": d.get("reference_seconds", d.get("total_duration")),
                    "default_tuning": d.get("default_tuning"),
                })
            except Exception as e:
                logger.error("Error reading %s: %s", p, e)
        return voices

    # ------------------------------------------------------------ references

    def _resolve_sample(self, voice_id: str, sample_path: str) -> Optional[str]:
        voice_dir = self.voices_dir / voice_id
        for cand in (Path(sample_path), self.voices_dir / sample_path, voice_dir / sample_path, voice_dir / os.path.basename(sample_path)):
            try:
                if cand.exists() and cand.is_file():
                    return str(cand)
            except OSError:
                continue
        return None

    def reference_paths(self, meta: dict) -> List[str]:
        """Cleaned reference takes for a cloned voice; migrates legacy voices on first use."""
        voice_id = meta["voice_id"]
        voice_dir = self.voices_dir / voice_id
        refs = meta.get("references")
        if refs:
            paths = [str(voice_dir / r["file"]) for r in refs if r.get("use", True)]
            paths = [p for p in paths if os.path.exists(p)]
            if paths:
                return paths

        # Legacy layout: sample_{i}.<ext>, sample_{i}_converted.wav, sample_{i}_converted_preprocessed.wav.
        by_take: Dict[str, str] = {}
        for raw in meta.get("sample_files", []):
            resolved = self._resolve_sample(voice_id, raw)
            if not resolved:
                continue
            m = re.match(r"(sample_\d+)", os.path.basename(resolved))
            take = m.group(1) if m else os.path.basename(resolved)
            rank = 0 if resolved.endswith("_converted.wav") else (1 if "_preprocessed" not in resolved else 2)
            if take not in by_take or rank < by_take[take][0]:
                by_take[take] = (rank, resolved)
        if not by_take:
            raise ServiceError(404, f"No reference audio found for {voice_id}")
        voice_dir.mkdir(parents=True, exist_ok=True)
        new_refs = []
        for i, (take, (_, src)) in enumerate(sorted(by_take.items())):
            try:
                wav = au.decode_audio(src, REF_SR)
            except ValueError as e:
                logger.warning("Skipping unreadable legacy sample %s: %s", src, e)
                continue
            cleaned = clean_reference(wav, REF_SR)
            name = f"ref_{i}.wav"
            au.sf.write(str(voice_dir / name), cleaned, REF_SR, subtype="PCM_16")
            new_refs.append({"file": name, "source": os.path.basename(src), "use": True,
                             "analysis": au.analyze_reference(cleaned, REF_SR)})
        if not new_refs:
            raise ServiceError(404, f"No readable reference audio for {voice_id}")
        meta["references"] = new_refs
        meta["reference_seconds"] = round(sum(r["analysis"]["duration"] for r in new_refs), 1)
        self.write_meta(meta)
        logger.info("Migrated legacy voice %s to %d cleaned references", voice_id, len(new_refs))
        return [str(voice_dir / r["file"]) for r in new_refs]

    def clone_latents(self, voice_id: str):
        meta = self.read_meta(voice_id)
        refs = self.reference_paths(meta)
        return meta, self.xtts.voice_latents(voice_id, refs, cache_dir=str(self.voices_dir / voice_id))

    # ------------------------------------------------------------ sampling

    def sampling_params(self, req: RenderRequest, meta: Optional[dict]) -> Tuple[float, float, int, float, str]:
        """Explicit request values > requested preset > voice's saved tuning > natural preset."""
        defaults = (meta or {}).get("default_tuning") if isinstance((meta or {}).get("default_tuning"), dict) else {}
        preset = (req.clone_preset or "").strip().lower()
        if preset == "auto":
            preset = ""
        saved_preset = (defaults or {}).get("clone_preset")
        name = preset or (saved_preset if saved_preset in CLONE_PRESETS else DEFAULT_PRESET)
        if preset and preset not in CLONE_PRESETS:
            logger.warning("Unknown clone_preset=%r; using %s", preset, DEFAULT_PRESET)
            name = DEFAULT_PRESET
        t, rp, k, p = CLONE_PRESETS[name]
        # Saved per-voice overrides only apply when the request didn't ask for a preset.
        if not preset and defaults and defaults.get("custom"):
            t = float(defaults.get("temperature", t))
            rp = float(defaults.get("repetition_penalty", rp))
            k = int(defaults.get("top_k", k))
            p = float(defaults.get("top_p", p))
        if req.temperature is not None:
            t = req.temperature
        if req.repetition_penalty is not None:
            rp = req.repetition_penalty
        if req.top_k is not None:
            k = req.top_k
        if req.top_p is not None:
            p = req.top_p
        return _clamp(t, 0.1, 1.5), _clamp(rp, 1.0, 20.0), int(_clamp(k, 1, 200)), _clamp(p, 0.1, 1.0), name

    # ------------------------------------------------------------ render

    def render(self, req: RenderRequest) -> RenderResult:
        voice_id = req.voice_id
        lang = (req.language or "en").split("-")[0].lower()
        speed = _clamp(float(req.speed or 1.0), 0.5, 2.0)
        pitch = _clamp(float(req.pitch or 0.0), -20.0, 20.0)
        volume = _clamp(float(req.volume if req.volume is not None else 1.0), 0.0, 1.0)

        text = tu.apply_lexicon(req.text or "", req.pronunciation_overrides)
        headers: Dict[str, str] = {"X-Voice-ID": voice_id}

        if voice_id.startswith("clone_"):
            engine_name = "xtts"
            if not self.xtts.ready:
                raise ServiceError(503, "XTTS model is loading. Please retry in 20-60 seconds." if self.xtts.loading
                                   else (self.xtts.load_error or "Voice cloning engine is not available"))
            meta, latents = self.clone_latents(voice_id)
            t, rp, k, p, preset = self.sampling_params(req, meta)
            headers.update({"X-Voice-Clone": "real", "X-Clone-Preset": preset, "X-Samples": str(len(meta.get("references", [])))})
            kokoro_voice = None
        else:
            spec = self.stock.get(voice_id)
            if not spec:
                raise ServiceError(404, f"Unknown voice: {voice_id}")
            engine_name = spec["engine"]
            if spec["language"] != "multilingual":
                lang = spec["language"]
            if engine_name == "kokoro":
                if not self.kokoro.ready:
                    raise ServiceError(503, "Stock voice engine is loading. Please retry shortly." if self.kokoro.loading
                                       else (self.kokoro.load_error or "Stock voice engine is not available"))
                kokoro_voice = spec["voice"]
                latents = None
            else:
                if not self.xtts.ready:
                    raise ServiceError(503, "XTTS model is loading. Please retry in 20-60 seconds." if self.xtts.loading
                                       else (self.xtts.load_error or "Studio voice engine is not available"))
                latents = self.xtts.studio_latents(spec["voice"])
                t, rp, k, p, _ = self.sampling_params(req, None)
                kokoro_voice = None
        headers["X-Engine"] = engine_name

        if engine_name == "xtts" and lang not in XTTS_LANGUAGES:
            raise ServiceError(400, f"Language '{lang}' is not supported for this voice")
        if lang == "en":
            text = normalize_english(text)

        if engine_name == "kokoro":
            lang_code = KokoroEngine.lang_code_for(kokoro_voice)
            text = tu.render_ipa_markup(text, supports_phonemes=lang_code in PHONEME_MARKUP_LANGS)
            text = tu.clean_text(text, for_xtts=False)
            segments = tu.chunk_text(text, lang, max_chars=400, pack=True)
        else:
            text = tu.render_ipa_markup(text, supports_phonemes=False)
            text = tu.clean_text(text, for_xtts=True)
            override = int(os.getenv("XTTS_CLONE_CHUNK_CHARS", "0") or 0) or None
            segments = tu.chunk_text(text, lang, max_chars=tu.xtts_chunk_limit(lang, override),
                                     min_chars=12 if lang not in tu.CJK_LANGS else 4, pack=True)
        segments = [s for s in segments if s.text.strip() or s.pause_after > 0]
        if not any(s.text.strip() for s in segments):
            raise ServiceError(400, "Text has nothing speakable after cleanup")

        chunks: List[np.ndarray] = []
        pauses: List[float] = []
        residual = 1.0
        for seg in segments:
            if not seg.text.strip():
                chunks.append(np.zeros(0, dtype=np.float32))
                pauses.append(seg.pause_after)
                continue
            if engine_name == "kokoro":
                wav = self.kokoro.synthesize(seg.text, kokoro_voice, speed=speed)
            else:
                wav, residual = self.xtts.synthesize(seg.text, lang, latents, t, rp, k, p, speed=speed)
                wav = au.remove_tail_artifacts(wav, SAMPLE_RATE)
                wav = au.compress_pauses(wav, SAMPLE_RATE, max_pause_s=0.9, keep_s=0.45)
            chunks.append(au.trim_silence(wav, SAMPLE_RATE, top_db=42.0, pad_ms=35.0))
            pauses.append(seg.pause_after / speed)
        headers["X-Text-Chunks"] = str(sum(1 for s in segments if s.text.strip()))

        if engine_name == "xtts":
            chunks = au.match_levels(chunks, SAMPLE_RATE)
        audio = au.join_segments(chunks, pauses, SAMPLE_RATE)
        lead = np.zeros(int(SAMPLE_RATE * 0.05), dtype=np.float32)
        audio = np.concatenate([lead, audio, np.zeros(int(SAMPLE_RATE * 0.12), dtype=np.float32)])

        if abs(residual - 1.0) > 0.01:
            audio = au.change_tempo(audio, SAMPLE_RATE, residual)
        if abs(pitch) >= 0.05:
            audio = au.shift_pitch(audio, SAMPLE_RATE, pitch)
        effects = req.effects or {}
        if any([
            float(effects.get("reverb", 0) or 0) > 0,
            float(effects.get("echo", 0) or 0) > 0,
            effects.get("noise_reduction"),
            (effects.get("special_effect") or "none") != "none",
            effects.get("mastering_enabled") and (effects.get("mastering_profile") or "none") != "none",
        ]):
            audio = au.apply_effects(audio, SAMPLE_RATE, effects)
        mastered = effects.get("mastering_enabled") and (effects.get("mastering_profile") or "none") != "none"
        if req.normalize and not mastered:
            audio = au.loudness_normalize(audio, SAMPLE_RATE)
        if volume != 1.0:
            audio = audio * volume

        data, media_type = au.encode(audio, SAMPLE_RATE, req.output_format)
        headers["X-Audio-Duration"] = f"{len(audio) / SAMPLE_RATE:.2f}"
        return RenderResult(data, media_type, headers)

    # ------------------------------------------------------------ cloning

    def create_clone(self, name: str, description: Optional[str], uploads: List[Tuple[str, bytes]],
                     quality_gate: dict) -> dict:
        safe = "".join(c for c in name.lower().replace(" ", "_") if c.isalnum() or c == "_")[:48] or "voice"
        voice_id = f"clone_{safe}_{hashlib.md5(name.encode()).hexdigest()[:6]}"
        if self.voice_meta_path(voice_id).exists():
            raise ServiceError(409, f'A cloned voice for "{name.strip()}" already exists. Delete it first or choose a different name.')
        voice_dir = self.voices_dir / voice_id
        voice_dir.mkdir(parents=True, exist_ok=True)
        try:
            refs, reports = [], []
            for i, (filename, content) in enumerate(uploads):
                if len(content) < 1000:
                    raise ServiceError(400, f"Audio file {filename} is too small (need at least 1KB)")
                suffix = (Path(filename or "").suffix or ".wav").lower()[:6]
                upload_name = f"upload_{i}{suffix}"
                (voice_dir / upload_name).write_bytes(content)
                try:
                    raw = au.decode_audio(content, REF_SR)
                except ValueError as e:
                    raise ServiceError(400, f"Invalid audio file {filename}: {e}")
                source_sr = probe_sample_rate(str(voice_dir / upload_name))
                report = assess_reference(raw, REF_SR, source_sr, quality_gate)
                report["source_file"] = filename
                reports.append(report)
                if quality_gate.get("strict_reject_mode") and not report["gate_passed"]:
                    reasons = "; ".join(report["gate_fail_reasons"][:2]) or "Audio quality gate failed"
                    raise ServiceError(400, f"Audio quality gate failed for {filename}: {reasons}")
                cleaned = clean_reference(raw, REF_SR, denoise=report["analysis"]["snr_db"] < 25)
                if len(cleaned) < REF_SR * 1.0:
                    raise ServiceError(400, f"Audio file {filename} has less than one second of speech")
                ref_name = f"ref_{i}.wav"
                au.sf.write(str(voice_dir / ref_name), cleaned, REF_SR, subtype="PCM_16")
                refs.append({"file": ref_name, "source": upload_name, "use": True,
                             "quality_score": report["quality_score"],
                             "analysis": au.analyze_reference(cleaned, REF_SR)})

            # Drop clearly bad takes when good ones exist (one noisy take drags the voice down).
            good = [r for r in refs if r["quality_score"] >= 55]
            if good and len(good) < len(refs):
                for r in refs:
                    r["use"] = r in good

            avg = sum(r["quality_score"] for r in reports) / max(1, len(reports))
            speech_s = sum(r["analysis"]["duration"] for r in refs if r["use"])
            gate_failed = sum(1 for r in reports if not r["gate_passed"])
            tier = "excellent" if speech_s >= 60 else "good" if speech_s >= 25 else "basic" if speech_s >= 10 else "minimal"
            preset = "stable" if (avg < 65 or gate_failed) else DEFAULT_PRESET
            meta = {
                "voice_id": voice_id,
                "name": name,
                "description": description,
                "engine": "xtts",
                "created_at": datetime.datetime.now().isoformat(),
                "references": refs,
                "sample_files": [r["source"] for r in refs],
                "reference_seconds": round(speech_s, 1),
                "total_duration": round(sum(r["analysis"]["duration"] for r in reports), 1),
                "quality_score": round(avg, 1),
                "quality_tier": tier,
                "quality_warnings": sorted({w for r in reports for w in r["warnings"]}),
                "quality_gate_failed_samples": gate_failed,
                "default_tuning": {"clone_preset": preset},
                "real_clone": True,
            }
            self.write_meta(meta)
        except Exception:
            shutil.rmtree(voice_dir, ignore_errors=True)
            self.voice_meta_path(voice_id).unlink(missing_ok=True)
            raise

        # Warm the latent cache now so the first generation is fast (best effort).
        if self.xtts.ready:
            try:
                self.clone_latents(voice_id)
            except Exception as e:
                logger.warning("Could not precompute latents for %s: %s", voice_id, e)
        return {"meta": meta, "reports": reports}

    def delete_clone(self, voice_id: str) -> None:
        path = self.voice_meta_path(voice_id)
        if not voice_id.startswith("clone_") or not path.exists():
            raise ServiceError(404, "Voice not found")
        shutil.rmtree(self.voices_dir / voice_id, ignore_errors=True)
        path.unlink(missing_ok=True)
        self.xtts.forget(voice_id)

    def update_tuning(self, voice_id: str, tuning: Optional[dict]) -> dict:
        meta = self.read_meta(voice_id)
        if tuning is None:
            meta["default_tuning"] = {"clone_preset": DEFAULT_PRESET}
        else:
            preset = tuning.get("clone_preset")
            if preset and preset not in CLONE_PRESETS:
                raise ServiceError(400, f"Unknown clone_preset: {preset}")
            clean = {"clone_preset": preset or DEFAULT_PRESET}
            for key, lo, hi, cast in (("temperature", 0.1, 1.5, float), ("repetition_penalty", 1.0, 20.0, float),
                                      ("top_k", 1, 200, int), ("top_p", 0.1, 1.0, float)):
                if tuning.get(key) is not None:
                    clean[key] = cast(_clamp(cast(tuning[key]), lo, hi))
                    clean["custom"] = True
            meta["default_tuning"] = clean
        self.write_meta(meta)
        return meta["default_tuning"]


# ---------------------------------------------------------------- reference helpers

def clean_reference(wav: np.ndarray, sr: int, denoise: bool = False) -> np.ndarray:
    """
    Gentle cleanup that helps XTTS capture identity: remove rumble/DC, optionally denoise,
    trim dead air at the ends, shorten long internal pauses, and peak-normalize.
    No loudness compression or low-pass (those make clones sound dull or metallic).
    """
    chain = "highpass=f=60"
    if denoise and au.has_filter("afftdn"):
        chain += ",afftdn=nr=10:nf=-45:tn=1"
    try:
        wav = au.ffmpeg_filter(wav, sr, chain)
    except RuntimeError as e:
        logger.warning("Reference filter failed, using unfiltered audio: %s", e)
    wav = au.trim_silence(wav, sr, top_db=40.0, pad_ms=120.0)
    wav = au.compress_pauses(wav, sr, max_pause_s=0.5, keep_s=0.25)
    return au.peak_normalize(wav, -3.0)


def probe_sample_rate(path: str) -> int:
    import subprocess

    try:
        r = subprocess.run(
            ["ffprobe", "-v", "quiet", "-select_streams", "a:0", "-show_entries", "stream=sample_rate",
             "-of", "default=nw=1:nk=1", path],
            capture_output=True, timeout=20,
        )
        return int(r.stdout.decode().strip() or 0)
    except Exception:
        return 0


def assess_reference(wav: np.ndarray, sr: int, source_sr: int, gate: dict) -> dict:
    a = au.analyze_reference(wav, sr)
    warnings, recs = [], []
    speech = a["speech_seconds"]
    if speech < 6:
        warnings.append(f"Only {speech:.0f}s of speech detected; 15-45s per take works best.")
    if a["duration"] > 300:
        warnings.append("Take is longer than 5 minutes; only the first 30 seconds are used.")
    if a["clipped_ratio"] > 0.001:
        warnings.append("Clipping detected; lower input gain and re-record for a cleaner clone.")
    if a["active_rms_db"] < -32:
        warnings.append("Recording is quiet; move closer to the mic.")
    if a["snr_db"] < 25:
        warnings.append("Background noise is noticeable; a quieter room will improve the clone.")
    if a["speech_ratio"] < 0.55:
        warnings.append("Lots of silence in the take; dead air is trimmed automatically.")
    if source_sr and source_sr < 22050:
        warnings.append(f"Low sample rate ({source_sr} Hz); record at 44.1 or 48 kHz if you can.")

    duration_score = min(100.0, speech / 20.0 * 100.0)
    snr_score = float(np.clip((a["snr_db"] - 10) / 30 * 100, 0, 100))
    clip_score = 100.0 if a["clipped_ratio"] <= 0.0005 else max(30.0, 100 - a["clipped_ratio"] * 20000)
    level_score = 100.0 if a["active_rms_db"] >= -30 else max(40.0, 100 + (a["active_rms_db"] + 30) * 5)
    sr_score = 100.0 if (source_sr or 24000) >= 22050 else (80.0 if source_sr >= 16000 else 50.0)
    score = duration_score * 0.3 + snr_score * 0.3 + clip_score * 0.15 + level_score * 0.1 + sr_score * 0.15

    reasons = []
    if speech < float(gate.get("minimum_duration_seconds", 4)):
        reasons.append(f"Less speech than the minimum ({speech:.1f}s < {gate.get('minimum_duration_seconds', 4)}s)")
    if source_sr and source_sr < int(gate.get("minimum_sample_rate_hz", 16000)):
        reasons.append(f"Sample rate below minimum ({source_sr} < {gate.get('minimum_sample_rate_hz', 16000)})")
    if score < float(gate.get("minimum_quality_score", 55)):
        reasons.append(f"Quality score below minimum ({score:.0f} < {gate.get('minimum_quality_score', 55)})")
    if warnings:
        recs.append("Record 2-4 clean takes of 15-45 seconds each in a quiet room.")
    return {
        "valid": True,
        "duration": a["duration"],
        "sample_rate": source_sr,
        "analysis": a,
        "quality_score": round(score, 1),
        "quality_breakdown": {
            "speech_duration": round(duration_score, 1),
            "noise": round(snr_score, 1),
            "clipping": round(clip_score, 1),
            "level": round(level_score, 1),
            "sample_rate": round(sr_score, 1),
        },
        "gate_passed": not reasons,
        "gate_fail_reasons": reasons,
        "warnings": warnings,
        "recommendations": recs,
    }
