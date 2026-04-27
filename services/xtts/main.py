"""
NextEleven Voice Service v3.2
REAL Voice Cloning with XTTS (Coqui XTTS v2)

Research-backed clone pipeline: clean reference audio matters more than duration;
24 kHz mono WAV for XTTS; gentle preprocessing to avoid metallic timbre;
sentence-aware chunking for natural prosody.

CRITICAL: Voice cloning REQUIRES XTTS to be installed and loaded.
If XTTS is not available, cloned voice requests will FAIL with clear errors.
NO SILENT FALLBACKS - system fails loudly if cloning can't work.
"""

import sys
import os
import logging
import tempfile
import shutil
import json
import datetime
import hashlib
import subprocess
import re
from pathlib import Path
from typing import List, Optional

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

logger.info("=" * 60)
logger.info("  NextEleven Voice Service v3.2 — Voice Clone Edition")
logger.info("  REAL Voice Cloning with XTTS")
logger.info("  Enhanced Audio Preprocessing")
logger.info("=" * 60)

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import uvicorn

# edge-tts for standard voices
try:
    import edge_tts
    HAS_EDGE_TTS = True
    logger.info("✅ edge-tts available")
except ImportError:
    HAS_EDGE_TTS = False
    logger.warning("⚠️ edge-tts not available")

# XTTS for REAL voice cloning
HAS_XTTS = False
tts_model = None
DEVICE = "cpu"
XTTS_LOAD_ERROR = None

try:
    import torch
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"✅ PyTorch available, device: {DEVICE}")
    
    from TTS.api import TTS
    logger.info("🔄 Loading XTTS model (this may take a minute)...")
    logger.info("   This is REQUIRED for voice cloning to work!")
    
    tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(DEVICE)
    HAS_XTTS = True
    
    # XTTS v2 is multi-speaker; a startup synthesis test without speaker_wav
    # is invalid and would incorrectly disable cloning. Loading the model is
    # sufficient verification here.
    logger.info("✅ XTTS model loaded - REAL voice cloning enabled!")
    if DEVICE == "cuda":
        logger.info(f"   🚀 GPU inference: {torch.cuda.get_device_name(0)} (CUDA {getattr(torch.version, 'cuda', '?')})")
        
except ImportError as e:
    XTTS_LOAD_ERROR = f"TTS library not installed: {e}"
    logger.error(f"❌ XTTS not available: {e}")
    logger.error("   Install with: pip install TTS")
except Exception as e:
    XTTS_LOAD_ERROR = f"XTTS failed to load: {e}"
    logger.error(f"❌ XTTS failed to load: {e}")
    logger.error("   Voice cloning will NOT work without XTTS!")

app = FastAPI(title="NextEleven Voice Service", version="3.2.0")

# CORS: set CORS_ORIGINS in production (e.g. https://your-app.railway.app) to restrict origins
_cors_origins = os.getenv("CORS_ORIGINS", "*").strip()
_cors_origins_list = [o.strip() for o in _cors_origins.split(",")] if _cors_origins else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_default_local_voices_dir = Path(__file__).resolve().parent / "cloned_voices"
VOICES_DIR = Path(os.getenv("VOICES_DIR", str(_default_local_voices_dir)))
try:
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
except OSError as e:
    logger.warning(f"VOICES_DIR not writable at {VOICES_DIR}: {e}")
    VOICES_DIR = _default_local_voices_dir
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    logger.info(f"Using fallback writable VOICES_DIR: {VOICES_DIR}")

EDGE_VOICES = {
    "default_english": "en-US-GuyNeural",
    "female_english": "en-US-JennyNeural",
    "male_british": "en-GB-RyanNeural",
    "female_british": "en-GB-SoniaNeural",
    "default_spanish": "es-ES-AlvaroNeural",
    "default_french": "fr-FR-HenriNeural",
    "default_german": "de-DE-ConradNeural",
    "default_portuguese": "pt-BR-AntonioNeural",
}


class TTSRequest(BaseModel):
    text: str
    voice_id: str
    language: str = "en"
    speed: float = 1.0
    pitch: float = 0
    volume: float = 1.0
    reverb: float = 0
    echo: float = 0
    noise_reduction: bool = False
    special_effect: str = "none"
    # Optional preset for cloned voices (maps to sampling params below)
    clone_preset: Optional[str] = None  # natural | expressive | stable
    # Advanced XTTS parameters for fine-tuning
    temperature: float = 0.63  # Lower = more consistent, higher = more varied
    repetition_penalty: float = 1.68  # XTTS v2: slightly higher reduces mushy / overly loose speech
    top_k: int = 50  # Sampling diversity
    top_p: float = 0.9  # Nucleus sampling


def resolve_clone_sampling_params(
    preset: Optional[str],
    temperature: float,
    repetition_penalty: float,
    top_k: int,
    top_p: float,
) -> tuple:
    """Apply clone_preset overrides when provided (XTTS v2 quality tuning)."""
    p = (preset or "").strip().lower()
    if p == "expressive":
        return (0.72, 1.52, top_k, 0.93)
    if p == "stable":
        return (0.58, 1.82, top_k, 0.87)
    if p == "natural":
        return (temperature, repetition_penalty, top_k, top_p)
    if p:
        logger.warning("Unknown clone_preset=%r; using request sampling params", preset)
    return (temperature, repetition_penalty, top_k, top_p)


# Same text as apps/web/lib/clone-calibration.ts (keep in sync for UX + API).
VOICE_CLONE_CALIBRATION_SCRIPT = (
    "Hello — this is my voice calibration sample for NextEleven. "
    "I am reading numbers clearly: twenty-four, ninety-nine, and the year two thousand twenty-six. "
    "Here is a question with a pause — does this still sound natural? "
    "I can speak softly, or I can project with more energy! "
    "Thanks for listening."
)

CLONE_GUIDE = {
    "engine": "coqui_xtts_v2",
    "calibration_script": VOICE_CLONE_CALIBRATION_SCRIPT,
    "reference_audio": {
        "ideal_total_seconds": "30–120",
        "minimum_seconds": 6,
        "quality_over_duration": True,
        "tips": [
            "Record in a quiet room with one speaker only — background noise hurts cloning most.",
            "Use a consistent mic distance; avoid clipping (keep peaks below red on your meter).",
            "WAV or lossless source is best; we convert to 24 kHz mono for XTTS.",
            "Read varied sentences (statements, questions, numbers) so the model hears your range.",
            "For a warmer clone, upload 2–3 short takes with natural pauses rather than one compressed file.",
        ],
    },
    "generation": {
        "presets": {
            "natural": "Balanced warmth and consistency (default).",
            "expressive": "Slightly more variation in delivery — good for character reads.",
            "stable": "Tighter, more uniform output — good for long narration.",
        }
    },
}


@app.on_event("startup")
async def startup_event():
    logger.info("=" * 60)
    logger.info("🚀 NextEleven Voice Service Starting...")
    logger.info("=" * 60)
    
    # Verify XTTS status
    logger.info(f"📊 Service Status:")
    logger.info(f"   XTTS (real cloning): {'✅ YES - VOICE CLONING ENABLED' if HAS_XTTS else '❌ NO - VOICE CLONING DISABLED'}")
    logger.info(f"   edge-tts (standard): {'✅ YES' if HAS_EDGE_TTS else '❌ NO'}")
    logger.info(f"   Device: {DEVICE}")
    logger.info(f"   Voices directory: {VOICES_DIR}")
    logger.info(f"   Directory exists: {VOICES_DIR.exists()}")
    
    if not HAS_XTTS:
        logger.error("=" * 60)
        logger.error("⚠️  CRITICAL WARNING: XTTS NOT LOADED!")
        logger.error("   Voice cloning will NOT work without XTTS.")
        logger.error("   Cloned voices will FAIL with error messages.")
        if XTTS_LOAD_ERROR:
            logger.error(f"   Error: {XTTS_LOAD_ERROR}")
        logger.error("   REQUIRED: pip install TTS")
        logger.error("   Then restart the service.")
        logger.error("=" * 60)
    else:
        logger.info("=" * 60)
        logger.info("✅ Voice cloning is READY and WORKING!")
        logger.info("   Cloned voices will use XTTS for real voice cloning.")
        logger.info("=" * 60)
    
    # Verify voices directory is writable
    try:
        test_file = VOICES_DIR / ".test_write"
        test_file.touch()
        test_file.unlink()
        logger.info(f"✅ Voices directory is writable: {VOICES_DIR}")
    except Exception as e:
        logger.error(f"❌ Voices directory not writable: {VOICES_DIR} - {e}")
    
    logger.info("=" * 60)
    logger.info("🚀 Service ready!")
    logger.info("=" * 60)


@app.get("/")
async def root():
    return {
        "service": "NextEleven Voice",
        "version": "3.2.0",
        "real_voice_cloning": HAS_XTTS,
        "clone_guide": "/clone-guide",
    }


@app.get("/clone-guide")
async def clone_guide():
    """Research-backed tips for best XTTS v2 clone quality (API + docs consumers)."""
    return CLONE_GUIDE


@app.get("/health")
async def health_check():
    status = "healthy"
    if not HAS_XTTS:
        status = "degraded"
    
    # Verify XTTS is actually functional
    xtts_functional = False
    if HAS_XTTS and tts_model:
        try:
            # Quick health check - verify model is accessible
            if hasattr(tts_model, 'synthesizer') or hasattr(tts_model, 'tts'):
                xtts_functional = True
        except:
            pass
    
    cuda_available = False
    cuda_device = None
    cuda_version = None
    try:
        import torch as _torch
        cuda_available = bool(_torch.cuda.is_available())
        if cuda_available:
            cuda_device = _torch.cuda.get_device_name(0)
            cuda_version = getattr(_torch.version, "cuda", None)
    except Exception:
        pass

    health_data = {
        "status": status,
        "service": "NextEleven Voice",
        "version": "3.2.0",
        "voice_cloning": "real" if HAS_XTTS and xtts_functional else "unavailable",
        "tts_engine": "xtts" if HAS_XTTS else "edge-tts",
        "xtts_loaded": HAS_XTTS,
        "xtts_functional": xtts_functional,
        "xtts_model_available": tts_model is not None,
        "cloned_voices": len(list(VOICES_DIR.glob("*.json"))),
        "device": DEVICE,
        "cuda_available": cuda_available,
        "cuda_device": cuda_device,
        "cuda_version": cuda_version,
        "voices_directory": str(VOICES_DIR),
        "voices_directory_writable": os.access(VOICES_DIR, os.W_OK),
        "voices_directory_persistent": str(VOICES_DIR) != str(_default_local_voices_dir),
        "cors_origins": _cors_origins_list,
        "features": {
            "multi_sample_cloning": True,
            "audio_preprocessing": True,
            "quality_validation": True,
            "real_voice_cloning": HAS_XTTS and xtts_functional,
            "clone_guide_endpoint": "/clone-guide",
            "clone_presets": ["natural", "expressive", "stable"],
            "gpu_dockerfile": "services/xtts/Dockerfile.gpu",
        }
    }
    
    # Add warnings if XTTS not available
    if not HAS_XTTS:
        health_data["warnings"] = [
            "XTTS not loaded - voice cloning will not work",
            "Cloned voices will fail with error messages",
            "Install TTS library: pip install TTS",
            "Then restart the service"
        ]
        if XTTS_LOAD_ERROR:
            health_data["xtts_load_error"] = XTTS_LOAD_ERROR
    elif not xtts_functional:
        health_data["warnings"] = [
            "XTTS loaded but not functional",
            "Voice cloning may not work correctly"
        ]
    
    return health_data


@app.get("/voices")
async def list_cloned_voices():
    voices = []
    for voice_file in VOICES_DIR.glob("*.json"):
        try:
            with open(voice_file) as f:
                data = json.load(f)
                voices.append({
                    "voice_id": data.get("voice_id"),
                    "name": data.get("name"),
                    "description": data.get("description"),
                    "created_at": data.get("created_at"),
                    "source": "cloned",
                    "real_clone": data.get("real_clone", HAS_XTTS)
                })
        except Exception as e:
            logger.error(f"Error reading {voice_file}: {e}")
    return {"voices": voices}


@app.post("/tts")
async def generate_speech(request: TTSRequest):
    text = request.text.strip()
    voice_id = request.voice_id
    language = request.language
    speed = max(0.5, min(2.0, request.speed))
    pitch = max(-20, min(20, request.pitch))
    volume = max(0.0, min(1.0, request.volume))

    temperature, repetition_penalty, top_k, top_p = resolve_clone_sampling_params(
        request.clone_preset if voice_id.startswith("clone_") else None,
        request.temperature,
        request.repetition_penalty,
        request.top_k,
        request.top_p,
    )
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="Text too long")
    
    effects = {
        "reverb": request.reverb,
        "echo": request.echo,
        "noise_reduction": request.noise_reduction,
        "special_effect": request.special_effect
    }
    
    # Use cloned voice with XTTS - CRITICAL: Must use XTTS for cloned voices
    if voice_id.startswith("clone_"):
        logger.info(f"🎭 Cloned voice TTS requested: {voice_id}")
        if not HAS_XTTS:
            logger.error(f"❌ XTTS not available but cloned voice requested: {voice_id}")
            raise HTTPException(
                status_code=503,
                detail="Voice cloning requires XTTS model to be loaded. Please check service configuration."
            )
        return await generate_cloned_speech(
            text, voice_id, language, speed, pitch, volume, effects,
            temperature=temperature,
            repetition_penalty=repetition_penalty,
            top_k=top_k,
            top_p=top_p,
        )
    else:
        logger.info(f"Standard TTS: {voice_id}")
        return await generate_edge_speech(text, voice_id, speed, pitch, volume, effects)


def split_text_for_xtts(text: str, max_chunk_chars: int = 200) -> List[str]:
    """
    Split long text into XTTS-friendly chunks while preserving sentence boundaries.
    Also splits on semicolons and long clause breaks for more natural per-chunk prosody.
    Falls back to word-based chunking for very long sentences.
    """
    normalized = " ".join(text.split())
    if len(normalized) <= max_chunk_chars:
        return [normalized]

    chunks: List[str] = []
    paragraphs = [p.strip() for p in re.split(r"\n+", normalized) if p.strip()]
    if not paragraphs:
        return [normalized]

    def push_sentence(sentence: str, current_parts: List[str]) -> List[str]:
        current = " ".join(current_parts).strip()
        if current:
            chunks.append(current)
        return [sentence]

    def split_clauses(s: str) -> List[str]:
        """Break very long segments on ; : — for smoother XTTS chunks."""
        if len(s) <= max_chunk_chars:
            return [s]
        parts = re.split(r"(?<=[;:])\s+|(?<=—)\s+", s)
        out: List[str] = []
        for p in parts:
            p = p.strip()
            if p:
                out.append(p)
        return out if len(out) > 1 else [s]

    for paragraph in paragraphs:
        raw_sents = [s.strip() for s in re.split(r"(?<=[.!?])\s+", paragraph) if s.strip()]
        sentences: List[str] = []
        for rs in raw_sents:
            sentences.extend(split_clauses(rs))
        if not sentences:
            continue
        current_parts: List[str] = []
        for sentence in sentences:
            if len(sentence) > max_chunk_chars:
                if current_parts:
                    chunks.append(" ".join(current_parts).strip())
                    current_parts = []
                words = sentence.split()
                word_parts: List[str] = []
                for word in words:
                    candidate = " ".join([*word_parts, word]).strip()
                    if len(candidate) <= max_chunk_chars:
                        word_parts.append(word)
                    else:
                        if word_parts:
                            chunks.append(" ".join(word_parts).strip())
                        word_parts = [word]
                if word_parts:
                    chunks.append(" ".join(word_parts).strip())
                continue

            candidate = " ".join([*current_parts, sentence]).strip()
            if not current_parts or len(candidate) <= max_chunk_chars:
                current_parts.append(sentence)
            else:
                current_parts = push_sentence(sentence, current_parts)

        if current_parts:
            chunks.append(" ".join(current_parts).strip())

    chunks = [c for c in chunks if c]
    return chunks or [normalized]


def concat_wav_files_to_bytes(wav_paths: List[str]) -> bytes:
    """Concatenate WAV chunk files using ffmpeg concat demuxer and return bytes."""
    if not wav_paths:
        raise ValueError("No WAV files to concatenate")
    if len(wav_paths) == 1:
        with open(wav_paths[0], "rb") as f:
            return f.read()

    list_path = None
    output_path = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", delete=False, suffix=".txt") as list_file:
            list_path = list_file.name
            for p in wav_paths:
                escaped = p.replace("'", "'\\''")
                list_file.write(f"file '{escaped}'\n")

        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp_out:
            output_path = tmp_out.name

        cmd = [
            "ffmpeg",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_path,
            "-c",
            "copy",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        with open(output_path, "rb") as f:
            return f.read()
    finally:
        if list_path and os.path.exists(list_path):
            os.unlink(list_path)
        if output_path and os.path.exists(output_path):
            os.unlink(output_path)


async def generate_cloned_speech(text: str, voice_id: str, language: str, speed: float, pitch: float, volume: float, effects: dict, 
                                  temperature: float = 0.65, repetition_penalty: float = 1.6, top_k: int = 50, top_p: float = 0.9):
    """Generate speech using REAL voice cloning with XTTS - MUST use cloned voice or fail"""
    
    # CRITICAL: XTTS must be available for voice cloning
    if not HAS_XTTS or not tts_model:
        error_msg = "XTTS model not available. Voice cloning requires XTTS to be loaded. Please check service logs."
        logger.error(error_msg)
        raise HTTPException(status_code=503, detail=error_msg)
    
    # Get voice metadata
    voice_file = VOICES_DIR / f"{voice_id}.json"
    if not voice_file.exists():
        raise HTTPException(status_code=404, detail=f"Voice not found: {voice_id}")
    
    with open(voice_file) as f:
        voice_data = json.load(f)
    
    # Find all valid reference audio files - resolve paths correctly
    sample_files = voice_data.get("sample_files", [])
    valid_samples = []
    
    for sample_path in sample_files:
        # Try absolute path first
        if os.path.exists(sample_path):
            valid_samples.append(sample_path)
        # Try relative to VOICES_DIR
        elif os.path.exists(VOICES_DIR / sample_path):
            valid_samples.append(str(VOICES_DIR / sample_path))
        # Try relative to voice directory
        else:
            voice_dir = VOICES_DIR / voice_id
            if os.path.exists(voice_dir / sample_path):
                valid_samples.append(str(voice_dir / sample_path))
            # Try just the filename in voice directory
            elif os.path.exists(voice_dir / os.path.basename(sample_path)):
                valid_samples.append(str(voice_dir / os.path.basename(sample_path)))
    
    if not valid_samples:
        error_msg = f"No valid reference audio files found for {voice_id}. Files listed: {sample_files}"
        logger.error(error_msg)
        raise HTTPException(status_code=404, detail=error_msg)
    
    logger.info(f"Found {len(valid_samples)} valid reference samples for {voice_id}")
    for i, sample in enumerate(valid_samples):
        logger.info(f"  Sample {i+1}: {sample} (exists: {os.path.exists(sample)})")
    
    # XTTS accepts a list of reference WAV files. Prefer lightly converted WAVs
    # over heavily preprocessed files; over-filtering can make clones metallic.
    wav_samples = [s for s in valid_samples if s.lower().endswith('.wav')]
    natural_wavs = [s for s in wav_samples if '_preprocessed.wav' not in s]
    preprocessed_wavs = [s for s in wav_samples if '_preprocessed.wav' in s]
    other_audio = [s for s in valid_samples if s not in wav_samples]
    def _ref_duration_seconds(path: str) -> float:
        try:
            cmd = [
                "ffprobe",
                "-v",
                "quiet",
                "-show_entries",
                "format=duration",
                "-of",
                "json",
                path,
            ]
            r = subprocess.run(cmd, capture_output=True, timeout=15)
            if r.returncode == 0:
                info = json.loads(r.stdout.decode())
                return float(info.get("format", {}).get("duration") or 0)
        except Exception:
            pass
        return 0.0

    def _ref_sort_key(path: str) -> tuple:
        """Longer refs first; tie-break toward lightly processed (non-_preprocessed) WAVs."""
        dur = _ref_duration_seconds(path)
        pre = 1 if "_preprocessed.wav" in path else 0
        return (-dur, pre)

    candidates = [*natural_wavs, *preprocessed_wavs, *other_audio]
    candidates = sorted(candidates, key=_ref_sort_key)
    reference_audios = candidates[:3]
    primary_reference = reference_audios[0]
    speaker_wav_reference = reference_audios if len(reference_audios) > 1 else primary_reference
    
    try:
        logger.info(f"🎭 XTTS REAL VOICE CLONING for {voice_id}")
        logger.info(f"   Primary reference: {primary_reference}")
        logger.info(f"   Reference samples used: {len(reference_audios)}")
        for sample in reference_audios:
            logger.info(f"     - {os.path.basename(sample)}")
        logger.info(f"   Text length: {len(text)} chars")
        
        # CRITICAL: Verify reference file exists and is valid
        if not os.path.exists(primary_reference):
            error_msg = f"Reference audio file not found: {primary_reference}"
            logger.error(f"❌ {error_msg}")
            logger.error(f"   Voice ID: {voice_id}")
            logger.error(f"   All sample files from metadata: {sample_files}")
            logger.error(f"   Valid samples found: {valid_samples}")
            raise FileNotFoundError(error_msg)
        
        # Verify file is readable
        if not os.access(primary_reference, os.R_OK):
            error_msg = f"Reference audio file not readable: {primary_reference}"
            logger.error(f"❌ {error_msg}")
            raise PermissionError(error_msg)
        
        file_size = os.path.getsize(primary_reference)
        if file_size < 1000:  # Less than 1KB is suspicious
            error_msg = f"Reference audio file too small: {file_size} bytes (minimum 1KB)"
            logger.error(f"❌ {error_msg}")
            raise ValueError(error_msg)
        
        # Verify it's actually an audio file (basic check)
        if not primary_reference.lower().endswith(('.wav', '.mp3', '.flac', '.ogg', '.m4a')):
            logger.warning(f"⚠️ Reference file may not be audio: {primary_reference}")
        
        logger.info(f"   Reference file: {os.path.basename(primary_reference)}")
        logger.info(f"   Reference file size: {file_size} bytes ({file_size / 1024:.1f} KB)")
        logger.info(f"   Reference file path: {primary_reference}")
        
        # Map language codes
        lang_map = {
            'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it',
            'pt': 'pt', 'pl': 'pl', 'tr': 'tr', 'ru': 'ru', 'nl': 'nl',
            'cs': 'cs', 'ar': 'ar', 'zh': 'zh-cn', 'ja': 'ja', 'ko': 'ko', 'hu': 'hu'
        }
        xtts_lang = lang_map.get(language, 'en')
        chunk_limit = int(os.getenv("XTTS_CLONE_CHUNK_CHARS", "240"))
        text_chunks = split_text_for_xtts(text, max_chunk_chars=chunk_limit)
        logger.info(f"   Generating with XTTS (language: {xtts_lang}, chunks: {len(text_chunks)})...")

        chunk_paths: List[str] = []
        try:
            for idx, chunk in enumerate(text_chunks):
                with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                    chunk_path = tmp.name

                logger.info(f"   Chunk {idx + 1}/{len(text_chunks)} ({len(chunk)} chars)")
                tts_model.tts_to_file(
                    text=chunk,
                    file_path=chunk_path,
                    speaker_wav=speaker_wav_reference,  # CRITICAL: this parameter clones the voice
                    language=xtts_lang,
                    split_sentences=False,
                    temperature=temperature,
                    repetition_penalty=repetition_penalty,
                    top_k=top_k,
                    top_p=top_p
                )

                if not os.path.exists(chunk_path):
                    raise ValueError(f"XTTS output file was not created: {chunk_path}")

                output_size = os.path.getsize(chunk_path)
                if output_size < 1000:
                    raise ValueError(f"XTTS generated invalid chunk (too small: {output_size} bytes)")

                chunk_paths.append(chunk_path)

            audio_data = concat_wav_files_to_bytes(chunk_paths)
        except Exception as inner_e:
            logger.error(f"❌ XTTS generation failed: {inner_e}")
            logger.error(f"   Reference file: {primary_reference}")
            logger.error(f"   Reference exists: {os.path.exists(primary_reference)}")
            if os.path.exists(primary_reference):
                logger.error(f"   Reference size: {os.path.getsize(primary_reference)} bytes")
            raise HTTPException(
                status_code=500,
                detail=f"XTTS voice cloning failed: {str(inner_e)}. Reference: {primary_reference}"
            )
        finally:
            for p in chunk_paths:
                if os.path.exists(p):
                    os.unlink(p)

        if len(audio_data) < 1000:
            raise ValueError("Generated audio is too small, XTTS may have failed")

        logger.info(f"✅ XTTS successfully generated cloned voice audio")
        logger.info(f"   Output size: {len(audio_data)} bytes ({len(audio_data) / 1024:.1f} KB)")
        logger.info(f"   Voice ID: {voice_id}")
        logger.info(f"   Reference used: {os.path.basename(primary_reference)}")
        logger.info(f"   Reference count: {len(reference_audios)}")
        logger.info(f"   Chunks merged: {len(text_chunks)}")
        
        # Apply speed adjustment if needed
        if speed != 1.0:
            audio_data = adjust_speed(audio_data, speed)

        # Apply pitch shift for cloned voices.
        # XTTS itself does not expose a direct pitch parameter in this path.
        if pitch != 0:
            audio_data = adjust_pitch(audio_data, pitch)
        
        # Apply effects
        if any([effects.get("reverb", 0) > 0, effects.get("echo", 0) > 0, 
                effects.get("noise_reduction"), effects.get("special_effect", "none") != "none",
                volume != 1.0]):
            audio_data = apply_effects_wav(audio_data, volume, effects)
        
        # Return with headers indicating REAL voice cloning was used
        return Response(
            content=audio_data,
            media_type="audio/wav",
            headers={
                "X-Voice-Clone": "real",
                "X-Engine": "xtts",
                "X-Samples": str(len(reference_audios)),
                "X-Reference": os.path.basename(primary_reference),
                "X-Voice-ID": voice_id,
                "X-Text-Chunks": str(len(text_chunks))
            }
        )
        
    except HTTPException:
        # Re-raise HTTP exceptions
        raise
    except Exception as e:
        error_msg = f"Voice cloning failed: {str(e)}"
        logger.error(f"❌ {error_msg}")
        logger.error(f"   Voice ID: {voice_id}")
        logger.error(f"   Reference files: {valid_samples}")
        # DO NOT fall back to edge-tts - fail loudly so user knows cloning didn't work
        raise HTTPException(
            status_code=500,
            detail=f"Voice cloning failed. XTTS could not generate speech from cloned voice. Error: {str(e)}"
        )


async def generate_edge_speech(text: str, voice_id: str, speed: float, pitch: float, volume: float, effects: dict):
    """Generate speech with edge-tts (standard voices)"""
    if not HAS_EDGE_TTS:
        raise HTTPException(status_code=500, detail="No TTS engine available")
    
    edge_voice = EDGE_VOICES.get(voice_id, "en-US-GuyNeural")
    
    rate_percent = int((speed - 1.0) * 100)
    rate_str = f"+{rate_percent}%" if rate_percent >= 0 else f"{rate_percent}%"
    pitch_hz = int(pitch * 10)
    pitch_str = f"+{pitch_hz}Hz" if pitch_hz >= 0 else f"{pitch_hz}Hz"
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp:
            output_path = tmp.name
        
        communicate = edge_tts.Communicate(text, edge_voice, rate=rate_str, pitch=pitch_str)
        await communicate.save(output_path)
        
        with open(output_path, 'rb') as f:
            audio_data = f.read()
        os.unlink(output_path)
        
        # Apply effects
        if any([effects.get("reverb", 0) > 0, effects.get("echo", 0) > 0,
                effects.get("noise_reduction"), effects.get("special_effect", "none") != "none",
                volume != 1.0]):
            audio_data = apply_effects_mp3(audio_data, volume, effects)
        
        return Response(content=audio_data, media_type="audio/mpeg")
        
    except Exception as e:
        logger.error(f"❌ edge-tts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def adjust_speed(audio_data: bytes, speed: float) -> bytes:
    """Adjust audio speed using ffmpeg"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_in:
            tmp_in.write(audio_data)
            input_path = tmp_in.name
        
        output_path = input_path.replace('.wav', '_speed.wav')
        
        # atempo only accepts 0.5-2.0
        cmd = ['ffmpeg', '-y', '-i', input_path, '-af', f'atempo={speed}', output_path]
        subprocess.run(cmd, capture_output=True, check=True)
        
        with open(output_path, 'rb') as f:
            result = f.read()
        
        os.unlink(input_path)
        os.unlink(output_path)
        return result
    except:
        return audio_data


def adjust_pitch(audio_data: bytes, semitones: float) -> bytes:
    """Adjust pitch in semitones while preserving clip length."""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_in:
            tmp_in.write(audio_data)
            input_path = tmp_in.name

        output_path = input_path.replace('.wav', '_pitch.wav')
        pitch_factor = 2 ** (semitones / 12.0)
        atempo_factor = 1.0 / pitch_factor

        cmd = [
            'ffmpeg',
            '-y',
            '-i',
            input_path,
            '-af',
            f'asetrate=24000*{pitch_factor:.6f},aresample=24000,atempo={atempo_factor:.6f}',
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, check=True)

        with open(output_path, 'rb') as f:
            result = f.read()

        os.unlink(input_path)
        os.unlink(output_path)
        return result
    except Exception as e:
        logger.warning(f"Pitch adjustment failed: {e}")
        return audio_data


def apply_effects_wav(audio_data: bytes, volume: float, effects: dict) -> bytes:
    """Apply effects to WAV audio"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_in:
            tmp_in.write(audio_data)
            input_path = tmp_in.name
        
        output_path = input_path.replace('.wav', '_fx.wav')
        filters = []
        
        # Special effects
        special = effects.get("special_effect", "none")
        if special == "robot":
            filters.extend(['tremolo=f=40:d=0.7', 'highpass=f=200', 'lowpass=f=4000'])
        elif special == "radio":
            filters.extend(['highpass=f=300', 'lowpass=f=3000'])
        elif special == "whisper":
            filters.extend(['highpass=f=500', 'volume=0.7'])
        elif special == "deep":
            filters.append('asetrate=44100*0.75,aresample=44100')
        elif special == "chipmunk":
            filters.append('asetrate=44100*1.4,aresample=44100')
        elif special == "cave":
            filters.append('aecho=0.8:0.9:100:0.5')
        elif special == "telephone":
            filters.extend(['highpass=f=400', 'lowpass=f=3400'])
        elif special == "underwater":
            filters.extend(['lowpass=f=800', 'vibrato=f=6:d=0.5'])
        elif special == "megaphone":
            filters.extend(['highpass=f=500', 'lowpass=f=4000', 'volume=1.5'])
        
        if effects.get("reverb", 0) > 0:
            delay = int(50 + effects["reverb"] * 100)
            filters.append(f'aecho=0.8:0.9:{delay}:0.4')
        
        if effects.get("echo", 0) > 0:
            delay = int(200 + effects["echo"] * 400)
            filters.append(f'aecho=0.8:0.7:{delay}:0.3')
        
        if effects.get("noise_reduction"):
            filters.extend(['highpass=f=80', 'lowpass=f=12000'])
        
        if volume != 1.0:
            filters.append(f'volume={volume}')
        
        if filters:
            cmd = ['ffmpeg', '-y', '-i', input_path, '-af', ','.join(filters), output_path]
            subprocess.run(cmd, capture_output=True, check=True)
        else:
            shutil.copy(input_path, output_path)
        
        with open(output_path, 'rb') as f:
            result = f.read()
        
        os.unlink(input_path)
        os.unlink(output_path)
        return result
    except Exception as e:
        logger.warning(f"WAV effects failed: {e}")
        return audio_data


def apply_effects_mp3(audio_data: bytes, volume: float, effects: dict) -> bytes:
    """Apply effects to MP3 audio"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_in:
            tmp_in.write(audio_data)
            input_path = tmp_in.name
        
        output_path = input_path.replace('.mp3', '_fx.mp3')
        filters = []
        
        special = effects.get("special_effect", "none")
        if special == "robot":
            filters.extend(['tremolo=f=40:d=0.7', 'highpass=f=200', 'lowpass=f=4000'])
        elif special == "radio":
            filters.extend(['highpass=f=300', 'lowpass=f=3000'])
        elif special == "whisper":
            filters.extend(['highpass=f=500', 'volume=0.7'])
        elif special == "deep":
            filters.append('asetrate=44100*0.75,aresample=44100')
        elif special == "chipmunk":
            filters.append('asetrate=44100*1.4,aresample=44100')
        elif special == "cave":
            filters.append('aecho=0.8:0.9:100:0.5')
        elif special == "telephone":
            filters.extend(['highpass=f=400', 'lowpass=f=3400'])
        elif special == "underwater":
            filters.extend(['lowpass=f=800', 'vibrato=f=6:d=0.5'])
        elif special == "megaphone":
            filters.extend(['highpass=f=500', 'lowpass=f=4000', 'volume=1.5'])
        
        if effects.get("reverb", 0) > 0:
            delay = int(50 + effects["reverb"] * 100)
            filters.append(f'aecho=0.8:0.9:{delay}:0.4')
        
        if effects.get("echo", 0) > 0:
            delay = int(200 + effects["echo"] * 400)
            filters.append(f'aecho=0.8:0.7:{delay}:0.3')
        
        if effects.get("noise_reduction"):
            filters.extend(['highpass=f=80', 'lowpass=f=12000'])
        
        if volume != 1.0:
            filters.append(f'volume={volume}')
        
        if filters:
            cmd = ['ffmpeg', '-y', '-i', input_path, '-af', ','.join(filters), '-q:a', '2', output_path]
            subprocess.run(cmd, capture_output=True, check=True)
        else:
            shutil.copy(input_path, output_path)
        
        with open(output_path, 'rb') as f:
            result = f.read()
        
        os.unlink(input_path)
        os.unlink(output_path)
        return result
    except Exception as e:
        logger.warning(f"MP3 effects failed: {e}")
        return audio_data


@app.post("/clone")
async def clone_voice(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    """Clone a voice - stores and preprocesses samples for XTTS"""
    logger.info(f"Clone request: {name} ({len(files)} files)")
    
    if not files:
        raise HTTPException(status_code=400, detail="Audio file required")
    if len(files) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 files")
    if not name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    
    safe_name = ''.join(c for c in name.lower().replace(' ', '_') if c.isalnum() or c == '_')
    voice_id = f"clone_{safe_name}_{hashlib.md5(name.encode()).hexdigest()[:6]}"

    if (VOICES_DIR / f"{voice_id}.json").exists():
        raise HTTPException(
            status_code=409,
            detail=f'A cloned voice for "{name.strip()}" already exists. Delete it first or choose a different name.',
        )

    voice_dir = VOICES_DIR / voice_id
    voice_dir.mkdir(parents=True, exist_ok=True)
    
    saved_files = []
    quality_reports = []
    total_duration = 0
    
    try:
        for i, file in enumerate(files):
            content = await file.read()
            if len(content) < 1000:
                raise HTTPException(status_code=400, detail="Audio file too small (need at least 1KB)")
            
            suffix = Path(file.filename or f"audio_{i}").suffix or '.wav'
            file_path = voice_dir / f"sample_{i}{suffix}"
            
            with open(file_path, 'wb') as f:
                f.write(content)
            
            logger.info(f"   Saved: {file_path.name} ({len(content)} bytes)")
            
            # Validate audio quality
            quality = validate_audio_quality(str(file_path))
            if not quality.get("valid", False):
                error = quality.get("error") or "Audio file could not be decoded"
                raise HTTPException(status_code=400, detail=f"Invalid audio file {file.filename}: {error}")

            quality_reports.append(quality)
            total_duration += quality.get('duration', 0)
            
            # Convert to WAV for XTTS compatibility
            wav_path = convert_to_wav(str(file_path))
            if not wav_path:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid audio file {file.filename}: could not convert to WAV for voice cloning"
                )

            # Keep the lightly converted WAV as the primary reference. The
            # preprocessed copy is useful as backup, but using only filtered
            # references can make cloned speech sound metallic.
            saved_files.append(wav_path)

            # Preprocess a backup for noisy recordings.
            preprocessed_path = preprocess_audio_for_cloning(wav_path)
            if preprocessed_path and preprocessed_path != wav_path:
                saved_files.append(preprocessed_path)
        
        # Aggregate quality warnings
        all_warnings = []
        all_recommendations = []
        for report in quality_reports:
            all_warnings.extend(report.get('warnings', []))
            all_recommendations.extend(report.get('recommendations', []))
        
        # Deduplicate
        all_warnings = list(set(all_warnings))
        all_recommendations = list(set(all_recommendations))
        
        quality_tier = (
            "excellent" if total_duration >= 60
            else "good" if total_duration >= 30
            else "basic" if total_duration >= 10
            else "minimal"
        )
        metadata = {
            "voice_id": voice_id,
            "name": name,
            "description": description,
            "sample_files": saved_files,
            "created_at": datetime.datetime.now().isoformat(),
            "real_clone": HAS_XTTS,
            "total_duration": total_duration,
            "quality_tier": quality_tier,
            "quality_warnings": all_warnings,
            "preprocessed": any("_preprocessed.wav" in f for f in saved_files)
        }
        
        with open(VOICES_DIR / f"{voice_id}.json", 'w') as f:
            json.dump(metadata, f, indent=2)
        
        clone_type = "REAL (XTTS)" if HAS_XTTS else "STORED ONLY (XTTS not available - cloning will fail)"
        logger.info(f"Voice cloned: {name} ({voice_id}) - {clone_type}")
        logger.info(f"   Total duration: {total_duration:.1f}s from {len(saved_files)} samples")
        logger.info(f"   Sample files stored: {len(saved_files)}")
        for i, sample in enumerate(saved_files):
            exists = os.path.exists(sample)
            size = os.path.getsize(sample) if exists else 0
            logger.info(f"   Sample {i+1}: {os.path.basename(sample)} ({size} bytes, exists: {exists})")
        
        # Build response message
        message = f"Voice '{name}' cloned successfully!"
        if HAS_XTTS:
            message += " Your voice will be used for REAL voice cloning."
        else:
            message += " ⚠️ WARNING: XTTS not available. Voice cloning will FAIL when generating speech."
            message += " Please ensure XTTS is installed and loaded."
        
        if total_duration < 10:
            message += f" Tip: You provided {total_duration:.1f}s of audio. For best results, use 30+ seconds."
        
        return {
            "success": True,
            "voice_id": voice_id,
            "name": name,
            "calibration_script": VOICE_CLONE_CALIBRATION_SCRIPT,
            "samples_count": len(saved_files),
            "total_duration": total_duration,
            "quality_tier": quality_tier,
            "real_clone": HAS_XTTS,
            "xtts_available": HAS_XTTS,
            "preprocessed": True,
            "quality_warnings": all_warnings[:3],
            "recommendations": all_recommendations[:3],
            "clone_tips": CLONE_GUIDE["reference_audio"]["tips"][:5],
            "clone_presets": list(CLONE_GUIDE["generation"]["presets"].keys()),
            "sample_files_count": len(saved_files),
            "sample_files": [os.path.basename(f) for f in saved_files[:3]],  # Show first 3
            "message": message,
            "warnings": [] if HAS_XTTS else [
                "XTTS not available - voice cloning will fail when generating speech",
                "Install TTS: pip install TTS",
                "Restart service after installation"
            ]
        }
        
    except HTTPException:
        shutil.rmtree(voice_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(voice_dir, ignore_errors=True)
        logger.error(f"Clone error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
                    

def convert_to_wav(input_path: str) -> Optional[str]:
    """Convert audio to mono PCM WAV at 24 kHz (XTTS v2 native rate)."""
    try:
        wav_path = input_path.rsplit('.', 1)[0] + '_converted.wav'
        cmd = ['ffmpeg', '-y', '-i', input_path, '-ar', '24000', '-ac', '1', '-acodec', 'pcm_s16le', wav_path]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode == 0 and os.path.exists(wav_path):
            logger.info(f"   Converted to WAV: {wav_path}")
            return wav_path
        stderr = result.stderr.decode(errors="ignore")[:300]
        logger.warning(f"WAV conversion failed for {input_path}: {stderr}")
    except Exception as e:
        logger.warning(f"WAV conversion failed: {e}")
    return None


def preprocess_audio_for_cloning(input_path: str) -> Optional[str]:
    """
    Gentle preprocessing for noisy uploads: trim silence, light dynamics, band-limit.
    Heavy loudnorm/low-pass can make clones sound metallic; defaults stay subtle.
    """
    try:
        output_path = input_path.rsplit('.', 1)[0] + '_preprocessed.wav'
        
        # Build ffmpeg filter chain for preprocessing
        filters = [
            # Softer loudness target than broadcast -16 LUFS to preserve micro-dynamics
            'loudnorm=I=-18:TP=-2:LRA=11',
            # Remove silence from start and end
            'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB:detection=peak',
            'areverse',
            'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB:detection=peak',
            'areverse',
            # High-pass filter to remove low rumble
            'highpass=f=70',
            # Wider low-pass preserves air; harsh 8k low-pass can dull clones
            'lowpass=f=12000',
        ]
        
        cmd = [
            'ffmpeg', '-y', '-i', input_path,
            '-af', ','.join(filters),
            '-ar', '24000',
            '-ac', '1',      # Mono
            '-acodec', 'pcm_s16le',
            output_path
        ]
        
        result = subprocess.run(cmd, capture_output=True, timeout=60)
        
        if result.returncode == 0 and os.path.exists(output_path):
            # Verify the output has reasonable size (at least 10KB)
            if os.path.getsize(output_path) > 10000:
                logger.info(f"   Preprocessed audio: {output_path}")
                return output_path
            else:
                logger.warning(f"   Preprocessed audio too small, using original")
                os.unlink(output_path)
        else:
            logger.warning(f"   Preprocessing failed: {result.stderr.decode()[:200]}")
            
    except subprocess.TimeoutExpired:
        logger.warning("Audio preprocessing timed out")
    except Exception as e:
        logger.warning(f"Audio preprocessing failed: {e}")
    
    return None


def _volume_detect_hints(file_path: str) -> List[str]:
    """Lightweight level check via ffmpeg volumedetect (stderr)."""
    hints: List[str] = []
    try:
        cmd = [
            "ffmpeg", "-nostats", "-i", file_path,
            "-af", "volumedetect", "-f", "null", "-",
        ]
        r = subprocess.run(cmd, capture_output=True, timeout=25)
        err = r.stderr.decode(errors="ignore")
        mv = re.search(r"max_volume:\s*([-\d.]+)\s*dB", err)
        if mv and float(mv.group(1)) >= -0.75:
            hints.append(
                "Levels are very hot (near clipping); lower input gain and re-record for a cleaner clone."
            )
        mean_m = re.search(r"mean_volume:\s*([-\d.]+)\s*dB", err)
        if mean_m and float(mean_m.group(1)) < -32:
            hints.append(
                "Recording is quite quiet; move closer to the mic or normalize slightly before upload."
            )
    except Exception:
        pass
    return hints


def validate_audio_quality(file_path: str) -> dict:
    """
    Validate audio quality for voice cloning.
    Returns quality metrics and recommendations.
    """
    result = {
        "valid": True,
        "duration": 0,
        "sample_rate": 0,
        "warnings": [],
        "recommendations": []
    }
    
    try:
        # Get audio info using ffprobe
        cmd = [
            'ffprobe', '-v', 'quiet', '-print_format', 'json',
            '-show_format', '-show_streams', file_path
        ]
        probe = subprocess.run(cmd, capture_output=True, timeout=30)
        
        if probe.returncode == 0:
            info = json.loads(probe.stdout.decode())
            
            # Get duration
            duration = float(info.get('format', {}).get('duration', 0))
            result['duration'] = duration
            
            # Get sample rate
            for stream in info.get('streams', []):
                if stream.get('codec_type') == 'audio':
                    result['sample_rate'] = int(stream.get('sample_rate', 0))
                    break
            
            # Quality checks
            if duration < 3:
                result['warnings'].append("Audio is very short (< 3 seconds)")
                result['recommendations'].append("Use at least 10-30 seconds of clear speech")
            elif duration < 10:
                result['warnings'].append("Audio is short (< 10 seconds)")
                result['recommendations'].append("Longer samples (30+ seconds) produce better clones")
            
            if result['sample_rate'] < 16000:
                result['warnings'].append(f"Low sample rate ({result['sample_rate']} Hz)")
                result['recommendations'].append("Use higher quality recordings (44.1kHz or 48kHz)")
            
            if duration > 300:
                result['warnings'].append("Audio is very long (> 5 minutes)")
                result['recommendations'].append("Use 30-60 seconds of your best quality speech")

            for h in _volume_detect_hints(file_path):
                result['warnings'].append(h)
        else:
            result['valid'] = False
            result['error'] = probe.stderr.decode(errors="ignore")[:300] or "Audio format not recognized"
                
    except Exception as e:
        logger.warning(f"Audio validation failed: {e}")
        result['valid'] = False
        result['error'] = str(e)
        result['warnings'].append(f"Could not validate audio: {str(e)}")
    
    return result


@app.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    voice_file = VOICES_DIR / f"{voice_id}.json"
    voice_dir = VOICES_DIR / voice_id
    
    if not voice_file.exists():
        raise HTTPException(status_code=404, detail="Voice not found")
    
    shutil.rmtree(voice_dir, ignore_errors=True)
    voice_file.unlink(missing_ok=True)
    logger.info(f"🗑️ Deleted voice: {voice_id}")
    return {"success": True}


if __name__ == "__main__":
    port = int(os.getenv("XTTS_PORT", "8081"))
    logger.info(f"🌐 Starting on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
