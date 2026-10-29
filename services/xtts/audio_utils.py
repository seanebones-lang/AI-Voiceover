"""
Audio DSP for the local voice service: stitching synthesized segments, loudness control,
pitch/tempo, effects, reference-clip cleanup, and encoding.

Everything works on mono float32 numpy arrays. ffmpeg is used through pipes (no temp files)
for the filters it does best (rubberband, atempo, afftdn, compressor, limiter).
"""

import io
import logging
import math
import shutil
import subprocess
from functools import lru_cache
from typing import Dict, List, Optional, Sequence

import numpy as np
import soundfile as sf

logger = logging.getLogger(__name__)

try:  # BS.1770 loudness; optional, falls back to RMS
    import pyloudnorm as pyln
except ImportError:  # pragma: no cover
    pyln = None


# ---------------------------------------------------------------- ffmpeg helpers

@lru_cache(maxsize=1)
def ffmpeg_filters() -> frozenset:
    if not shutil.which("ffmpeg"):
        return frozenset()
    try:
        out = subprocess.run(
            ["ffmpeg", "-hide_banner", "-filters"], capture_output=True, timeout=15
        ).stdout.decode(errors="ignore")
    except Exception:
        return frozenset()
    names = set()
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 2 and len(parts[0]) == 3:
            names.add(parts[1])
    return frozenset(names)


def has_filter(name: str) -> bool:
    return name in ffmpeg_filters()


def ffmpeg_filter(wav: np.ndarray, sr: int, chain: str, out_sr: Optional[int] = None) -> np.ndarray:
    """Run a mono float32 signal through an ffmpeg -af chain via pipes."""
    if not chain:
        return wav
    out_sr = out_sr or sr
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error",
        "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
        "-af", chain,
        "-f", "f32le", "-ar", str(out_sr), "-ac", "1", "pipe:1",
    ]
    proc = subprocess.run(cmd, input=np.ascontiguousarray(wav, dtype=np.float32).tobytes(), capture_output=True, timeout=300)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg filter failed ({chain}): {proc.stderr.decode(errors='ignore')[:300]}")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


def decode_audio(data_or_path, target_sr: int) -> np.ndarray:
    """Decode any ffmpeg-readable input (bytes or path) to mono float32 at target_sr."""
    src = "pipe:0" if isinstance(data_or_path, (bytes, bytearray)) else str(data_or_path)
    cmd = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-i", src,
        "-f", "f32le", "-ac", "1", "-ar", str(target_sr), "pipe:1",
    ]
    proc = subprocess.run(
        cmd,
        input=bytes(data_or_path) if src == "pipe:0" else None,
        capture_output=True,
        timeout=180,
    )
    if proc.returncode != 0:
        raise ValueError(proc.stderr.decode(errors="ignore")[:300] or "Audio could not be decoded")
    return np.frombuffer(proc.stdout, dtype=np.float32).copy()


# ---------------------------------------------------------------- analysis

def frame_db(wav: np.ndarray, sr: int, frame_ms: float = 10.0) -> np.ndarray:
    hop = max(1, int(sr * frame_ms / 1000))
    n = len(wav) // hop
    if n == 0:
        return np.array([-120.0])
    frames = wav[: n * hop].reshape(n, hop)
    rms = np.sqrt(np.mean(frames.astype(np.float64) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms + 1e-9)


def voiced_mask(wav: np.ndarray, sr: int, top_db: float = 40.0, frame_ms: float = 10.0) -> np.ndarray:
    db = frame_db(wav, sr, frame_ms)
    ref = np.percentile(db, 99) if len(db) > 10 else db.max()
    return db > (ref - top_db)


def active_rms_db(wav: np.ndarray, sr: int) -> float:
    db = frame_db(wav, sr)
    mask = db > (db.max() - 35)
    if not mask.any():
        return float(db.max())
    lin = 10 ** (db[mask] / 20)
    return float(20 * np.log10(np.sqrt(np.mean(lin ** 2)) + 1e-9))


def estimate_snr_db(wav: np.ndarray, sr: int) -> float:
    """Speech-vs-floor estimate: loud frames (95th pct) against quiet frames (10th pct)."""
    db = frame_db(wav, sr, 20.0)
    if len(db) < 10:
        return 0.0
    return float(np.percentile(db, 95) - np.percentile(db, 10))


def analyze_reference(wav: np.ndarray, sr: int) -> Dict[str, float]:
    duration = len(wav) / sr if sr else 0.0
    peak = float(np.max(np.abs(wav))) if len(wav) else 0.0
    mask = voiced_mask(wav, sr, top_db=35.0)
    return {
        "duration": round(duration, 2),
        "speech_seconds": round(float(mask.sum()) * 0.01, 2),
        "speech_ratio": round(float(mask.mean()) if len(mask) else 0.0, 3),
        "peak_db": round(20 * math.log10(peak + 1e-9), 2),
        "clipped_ratio": round(float(np.mean(np.abs(wav) >= 0.999)) if len(wav) else 0.0, 5),
        "active_rms_db": round(active_rms_db(wav, sr), 2),
        "snr_db": round(estimate_snr_db(wav, sr), 1),
    }


# ---------------------------------------------------------------- editing

def fade(wav: np.ndarray, sr: int, fade_in_ms: float = 6.0, fade_out_ms: float = 12.0) -> np.ndarray:
    out = wav.copy()
    fi = min(len(out), int(sr * fade_in_ms / 1000))
    fo = min(len(out), int(sr * fade_out_ms / 1000))
    if fi > 1:
        out[:fi] *= np.linspace(0.0, 1.0, fi, dtype=np.float32)
    if fo > 1:
        out[-fo:] *= np.linspace(1.0, 0.0, fo, dtype=np.float32)
    return out


def trim_silence(wav: np.ndarray, sr: int, top_db: float = 40.0, pad_ms: float = 40.0) -> np.ndarray:
    if len(wav) == 0:
        return wav
    mask = voiced_mask(wav, sr, top_db)
    idx = np.flatnonzero(mask)
    if len(idx) == 0:
        return wav[:0]
    hop = int(sr * 0.01)
    pad = int(sr * pad_ms / 1000)
    start = max(0, idx[0] * hop - pad)
    end = min(len(wav), (idx[-1] + 1) * hop + pad)
    return wav[start:end]


def _voiced_runs(mask: np.ndarray) -> List[List[int]]:
    runs: List[List[int]] = []
    start = None
    for i, v in enumerate(mask):
        if v and start is None:
            start = i
        elif not v and start is not None:
            runs.append([start, i])
            start = None
    if start is not None:
        runs.append([start, len(mask)])
    return runs


def remove_tail_artifacts(
    wav: np.ndarray, sr: int, max_island_s: float = 0.25, min_gap_s: float = 0.35
) -> np.ndarray:
    """
    Drop short isolated noises after the last word (XTTS sometimes appends a breath,
    click or half-syllable after a long silence at the end of a segment).
    """
    mask = voiced_mask(wav, sr, top_db=40.0)
    runs = _voiced_runs(mask)
    hop = int(sr * 0.01)
    for _ in range(2):
        if len(runs) < 2:
            break
        last, prev = runs[-1], runs[-2]
        island = (last[1] - last[0]) * 0.01
        gap = (last[0] - prev[1]) * 0.01
        if island <= max_island_s and gap >= min_gap_s:
            wav = wav[: prev[1] * hop + int(sr * 0.05)]
            runs.pop()
        else:
            break
    return wav


def compress_pauses(wav: np.ndarray, sr: int, max_pause_s: float = 0.6, keep_s: float = 0.3) -> np.ndarray:
    """Shorten internal silences longer than max_pause_s down to keep_s (references and outputs)."""
    mask = voiced_mask(wav, sr, top_db=40.0)
    hop = int(sr * 0.01)
    runs = _voiced_runs(mask)
    if len(runs) < 2:
        return wav
    pieces = []
    keep = int(keep_s * sr)
    cursor = 0
    for a, b in zip(runs[:-1], runs[1:]):
        gap_start, gap_end = a[1] * hop, b[0] * hop
        if (gap_end - gap_start) / sr > max_pause_s:
            pieces.append(wav[cursor : gap_start + keep // 2])
            cursor = gap_end - keep // 2
    pieces.append(wav[cursor:])
    return np.concatenate(pieces) if pieces else wav


def match_levels(chunks: Sequence[np.ndarray], sr: int, max_adjust_db: float = 4.0) -> List[np.ndarray]:
    """Pull each segment's speech level toward the median so loudness doesn't jump at seams."""
    levels = [active_rms_db(c, sr) if len(c) > sr * 0.15 else None for c in chunks]
    valid = [l for l in levels if l is not None]
    if len(valid) < 2:
        return list(chunks)
    target = float(np.median(valid))
    out = []
    for c, lvl in zip(chunks, levels):
        if lvl is None:
            out.append(c)
            continue
        gain_db = float(np.clip(target - lvl, -max_adjust_db, max_adjust_db))
        out.append(c * (10 ** (gain_db / 20)))
    return out


def join_segments(chunks: Sequence[np.ndarray], pauses: Sequence[float], sr: int) -> np.ndarray:
    parts: List[np.ndarray] = []
    for c, p in zip(chunks, pauses):
        if len(c):
            parts.append(fade(c.astype(np.float32), sr))
        if p > 0:
            parts.append(np.zeros(int(sr * p), dtype=np.float32))
    return np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)


def loudness_normalize(wav: np.ndarray, sr: int, target_lufs: float = -19.0, peak_db: float = -1.0) -> np.ndarray:
    """Integrated-loudness normalization with a peak ceiling (no pumping, no limiter artefacts)."""
    if len(wav) == 0:
        return wav
    gain_db = None
    if pyln is not None and len(wav) > sr * 0.5:
        try:
            loud = pyln.Meter(sr).integrated_loudness(wav.astype(np.float64))
            if np.isfinite(loud):
                gain_db = target_lufs - loud
        except Exception:
            gain_db = None
    if gain_db is None:
        gain_db = (target_lufs + 3.0) - active_rms_db(wav, sr)
    peak = float(np.max(np.abs(wav))) + 1e-9
    max_gain_db = peak_db - 20 * math.log10(peak)
    gain_db = min(gain_db, max_gain_db)
    return (wav * (10 ** (gain_db / 20))).astype(np.float32)


def peak_normalize(wav: np.ndarray, peak_db: float = -3.0) -> np.ndarray:
    peak = float(np.max(np.abs(wav))) if len(wav) else 0.0
    if peak <= 0:
        return wav
    return (wav * (10 ** (peak_db / 20) / peak)).astype(np.float32)


# ---------------------------------------------------------------- pitch / tempo

def _atempo_chain(factor: float) -> str:
    parts = []
    f = factor
    while f > 2.0:
        parts.append("atempo=2.0")
        f /= 2.0
    while f < 0.5:
        parts.append("atempo=0.5")
        f /= 0.5
    parts.append(f"atempo={f:.5f}")
    return ",".join(parts)


def change_tempo(wav: np.ndarray, sr: int, factor: float) -> np.ndarray:
    if abs(factor - 1.0) < 0.01:
        return wav
    if has_filter("rubberband"):
        return ffmpeg_filter(wav, sr, f"rubberband=tempo={factor:.5f}:transients=mixed:detector=soft")
    return ffmpeg_filter(wav, sr, _atempo_chain(factor))


def shift_pitch(wav: np.ndarray, sr: int, semitones: float, preserve_formants: bool = True) -> np.ndarray:
    """Pitch shift without changing duration. Rubberband keeps formants so voices don't sound chipmunked."""
    if abs(semitones) < 0.05:
        return wav
    ratio = 2 ** (semitones / 12.0)
    if has_filter("rubberband"):
        formant = ":formant=preserved" if preserve_formants else ""
        return ffmpeg_filter(wav, sr, f"rubberband=pitch={ratio:.6f}{formant}:pitchq=quality")
    return ffmpeg_filter(wav, sr, f"asetrate={sr}*{ratio:.6f},aresample={sr},{_atempo_chain(1.0 / ratio)}")


# ---------------------------------------------------------------- effects

def _room_ir(sr: int, amount: float, seed: int = 7) -> np.ndarray:
    """Synthetic room impulse response: early reflections + exponentially decaying diffuse tail."""
    rng = np.random.default_rng(seed)
    rt60 = 0.25 + 1.55 * amount
    n = int(sr * min(2.2, rt60 * 1.1))
    t = np.arange(n) / sr
    tail = rng.standard_normal(n) * np.exp(-6.91 * t / rt60)
    # darker tail as it decays (air absorption): one-pole lowpass with decreasing cutoff
    tail = np.convolve(tail, np.ones(4) / 4, mode="same")
    ir = np.zeros(n)
    predelay = int(sr * (0.008 + 0.012 * amount))
    ir[predelay:] = tail[: n - predelay] * 0.35
    for ms, g in ((11, 0.6), (17, 0.45), (23, 0.38), (31, 0.3), (43, 0.22)):
        k = int(sr * (ms / 1000) * (0.8 + amount))
        if k < n:
            ir[k] += g * (1 if rng.random() > 0.5 else -1)
    ir[0] = 0.0
    ir /= np.sqrt(np.sum(ir ** 2)) + 1e-9
    return ir.astype(np.float32)


def apply_reverb(wav: np.ndarray, sr: int, amount: float) -> np.ndarray:
    if amount <= 0 or len(wav) == 0:
        return wav
    from scipy.signal import fftconvolve

    amount = float(np.clip(amount, 0.0, 1.0))
    ir = _room_ir(sr, amount)
    wet = fftconvolve(wav, ir)[: len(wav) + len(ir) // 2]
    dry = np.concatenate([wav, np.zeros(len(wet) - len(wav), dtype=np.float32)])
    wet_gain = 0.12 + 0.38 * amount
    wet *= (np.sqrt(np.mean(dry ** 2)) + 1e-9) / (np.sqrt(np.mean(wet ** 2)) + 1e-9)
    out = dry * (1 - wet_gain * 0.5) + wet * wet_gain
    return trim_silence(out.astype(np.float32), sr, top_db=55.0, pad_ms=60.0)


SPECIAL_EFFECT_CHAINS = {
    "robot": "afftfilt=real='hypot(re,im)*sin(0)':imag='hypot(re,im)*cos(0)':win_size=512:overlap=0.75,highpass=f=120,lowpass=f=6000",
    "radio": "highpass=f=300,lowpass=f=3400,acompressor=threshold=-20dB:ratio=6:attack=5:release=60,volume=1.4",
    "telephone": "highpass=f=400,lowpass=f=3200,acompressor=threshold=-18dB:ratio=4,volume=1.3",
    "megaphone": "highpass=f=600,lowpass=f=4500,acompressor=threshold=-24dB:ratio=10:attack=2:release=40,volume=1.6",
    "underwater": "lowpass=f=700,vibrato=f=5:d=0.35,aecho=0.6:0.5:60:0.3",
    "cave": "aecho=0.8:0.85:120|260:0.45|0.28",
}


def apply_special_effect(wav: np.ndarray, sr: int, effect: str) -> np.ndarray:
    effect = (effect or "none").lower()
    if effect in ("", "none"):
        return wav
    if effect == "deep":
        return shift_pitch(wav, sr, -4.0, preserve_formants=False)
    if effect == "chipmunk":
        return shift_pitch(wav, sr, 6.0, preserve_formants=False)
    if effect == "whisper":
        # Breathier, thinner, quieter. Keeps intelligibility (true whisper needs voicing removal).
        return ffmpeg_filter(wav, sr, "highpass=f=450,treble=g=4:f=4000,acompressor=threshold=-30dB:ratio=3,volume=0.75")
    if effect == "robot" and not has_filter("afftfilt"):
        return ffmpeg_filter(wav, sr, "tremolo=f=40:d=0.7,highpass=f=200,lowpass=f=4000")
    chain = SPECIAL_EFFECT_CHAINS.get(effect)
    if not chain:
        logger.warning("Unknown special_effect=%r ignored", effect)
        return wav
    return ffmpeg_filter(wav, sr, chain)


MASTERING_PROFILES = {
    # (filter chain before loudness, target LUFS, true-peak ceiling dB)
    "podcast": ("highpass=f=70,equalizer=f=200:t=q:w=1:g=-1.5,equalizer=f=3500:t=q:w=1.2:g=2,"
                "acompressor=threshold=-22dB:ratio=3:attack=8:release=120:makeup=2", -16.0, -1.5),
    "broadcast": ("highpass=f=80,equalizer=f=3000:t=q:w=1:g=1.5,"
                  "acompressor=threshold=-24dB:ratio=4:attack=5:release=90:makeup=3", -14.0, -1.0),
    "cinematic": ("highpass=f=50,equalizer=f=120:t=q:w=1:g=1.5,lowpass=f=15000,"
                  "acompressor=threshold=-26dB:ratio=2:attack=15:release=200:makeup=1.5", -18.0, -2.0),
}


def apply_mastering(wav: np.ndarray, sr: int, profile: str) -> np.ndarray:
    spec = MASTERING_PROFILES.get((profile or "none").lower())
    if not spec:
        return wav
    chain, lufs, ceiling = spec
    if has_filter("deesser"):
        chain = f"{chain},deesser=i=0.4"
    out = ffmpeg_filter(wav, sr, chain)
    out = loudness_normalize(out, sr, target_lufs=lufs, peak_db=0.0)
    limit = 10 ** (ceiling / 20)
    return ffmpeg_filter(out, sr, f"alimiter=limit={limit:.4f}:attack=3:release=50:level=disabled")


def apply_effects(wav: np.ndarray, sr: int, effects: Dict) -> np.ndarray:
    out = wav
    if effects.get("noise_reduction"):
        out = ffmpeg_filter(out, sr, "highpass=f=70,afftdn=nr=12:nf=-40:tn=1" if has_filter("afftdn") else "highpass=f=80")
    out = apply_special_effect(out, sr, effects.get("special_effect", "none"))
    echo = float(effects.get("echo", 0) or 0)
    if echo > 0:
        delay = int(180 + echo * 320)
        decay = 0.25 + 0.3 * echo
        out = ffmpeg_filter(out, sr, f"apad=pad_dur={delay * 3 / 1000:.2f},aecho=0.9:0.9:{delay}|{delay * 2}:{decay:.2f}|{decay * 0.5:.2f}")
        out = trim_silence(out, sr, top_db=55.0, pad_ms=60.0)
    reverb = float(effects.get("reverb", 0) or 0)
    if reverb > 0:
        out = apply_reverb(out, sr, reverb)
    if effects.get("mastering_enabled") and (effects.get("mastering_profile") or "none") != "none":
        out = apply_mastering(out, sr, effects["mastering_profile"])
    return out


# ---------------------------------------------------------------- encoding

def encode(wav: np.ndarray, sr: int, fmt: str = "wav") -> tuple:
    """Return (bytes, media_type)."""
    wav = np.clip(np.nan_to_num(wav), -1.0, 1.0).astype(np.float32)
    fmt = (fmt or "wav").lower()
    if fmt == "mp3":
        cmd = [
            "ffmpeg", "-hide_banner", "-loglevel", "error",
            "-f", "f32le", "-ar", str(sr), "-ac", "1", "-i", "pipe:0",
            # CBR without a Xing header: exact duration in every player, and parts from
            # long-form jobs can be concatenated byte-for-byte.
            "-codec:a", "libmp3lame", "-b:a", "128k", "-write_xing", "0", "-f", "mp3", "pipe:1",
        ]
        proc = subprocess.run(cmd, input=wav.tobytes(), capture_output=True, timeout=120)
        if proc.returncode == 0 and proc.stdout:
            return proc.stdout, "audio/mpeg"
        logger.warning("MP3 encode failed, returning WAV: %s", proc.stderr.decode(errors="ignore")[:200])
    buf = io.BytesIO()
    sf.write(buf, wav, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue(), "audio/wav"
