"""
NextEleven Voice Service v4 — fully local text-to-speech and voice cloning.

Engines (no third-party APIs at runtime):
- Kokoro-82M for stock voices (fast on CPU, Apache-2.0 weights)
- Coqui XTTS v2 for cloned voices and the multilingual studio speakers

Model weights are read from the local cache (baked into the image by prefetch_models.py).
"""

import asyncio
import logging
import os
import sys
import threading
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Dict, List, Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
import uvicorn

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger("voice-service")

from pipeline import CLONE_PRESETS, RenderRequest, ServiceError, VoiceService  # noqa: E402

VERSION = "4.0.0"


def _flag(name: str, default: str = "1") -> bool:
    return os.getenv(name, default).strip().lower() not in ("0", "false", "no", "")


def _device() -> str:
    wanted = os.getenv("VOICE_DEVICE", "auto").lower()
    if wanted in ("cpu", "cuda"):
        return wanted
    try:
        import torch

        return "cuda" if torch.cuda.is_available() else "cpu"
    except ImportError:
        return "cpu"


_default_voices_dir = Path(__file__).resolve().parent / "cloned_voices"
VOICES_DIR = Path(os.getenv("VOICES_DIR", str(_default_voices_dir)))
try:
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
except OSError as e:
    logger.warning("VOICES_DIR not writable at %s: %s; using %s", VOICES_DIR, e, _default_voices_dir)
    VOICES_DIR = _default_voices_dir
    VOICES_DIR.mkdir(parents=True, exist_ok=True)

DEVICE = _device()
service = VoiceService(VOICES_DIR, DEVICE)

# Same text as apps/web/lib/clone-calibration.ts (keep in sync for UX + API).
VOICE_CLONE_CALIBRATION_SCRIPT = (
    "Hello — this is my voice calibration sample for NextEleven. "
    "I am reading numbers clearly: twenty-four, ninety-nine, and the year two thousand twenty-six. "
    "Here is a question with a pause — does this still sound natural? "
    "I can speak softly, or I can project with more energy! "
    "Thanks for listening."
)

VOICE_CLONE_ALT_SCRIPTS = [
    {
        "id": "neutral_narration",
        "label": "Neutral narration",
        "text": (
            "Good morning. Today we are reviewing the quarterly update with a calm, steady delivery. "
            "Please listen for clear consonants, natural pauses, and consistent pacing throughout the message."
        ),
    },
    {
        "id": "expressive_contrast",
        "label": "Expressive contrast",
        "text": (
            "I thought the launch would be simple — but it was not! We had one setback, then two fast wins. "
            "Can we adapt quickly, stay focused, and still sound confident under pressure?"
        ),
    },
    {
        "id": "numbers_questions_names",
        "label": "Numbers, names, and questions",
        "text": (
            "On March twenty-third, Ava transferred ninety-four files to Jordan in under twelve minutes. "
            "Did Liam confirm ticket four-zero-seven before the noon deadline? If not, who should escalate first?"
        ),
    },
]

QUALITY_GATE = {
    "enabled": True,
    "strict_reject_mode": _flag("XTTS_CLONE_STRICT_GATE", "1"),
    "minimum_duration_seconds": 4,
    "minimum_sample_rate_hz": 16000,
    "minimum_quality_score": 55,
}

CLONE_GUIDE = {
    "engine": "coqui_xtts_v2",
    "calibration_script": VOICE_CLONE_CALIBRATION_SCRIPT,
    "alternate_scripts": VOICE_CLONE_ALT_SCRIPTS,
    "reference_audio": {
        "ideal_total_seconds": "30–120",
        "minimum_seconds": 6,
        "recommended_sample_count": "2-4",
        "recommended_seconds_per_sample": "15-45",
        "quality_over_duration": True,
        "tips": [
            "Record in a quiet room with one speaker only — background noise hurts cloning most.",
            "Use a consistent mic distance; avoid clipping (keep peaks below red on your meter).",
            "WAV or lossless source is best; uploads are cleaned (rumble, dead air, long pauses) automatically.",
            "Read varied sentences (statements, questions, numbers) so the model hears your range.",
            "For stronger identity lock, upload 2-4 short clean takes rather than one long compressed file.",
            "Avoid music beds, hard noise gates, and heavy podcast compression on reference audio.",
        ],
    },
    "generation": {
        "presets": {
            "natural": "Balanced warmth and consistency (default).",
            "expressive": "More variation in delivery — good for character reads.",
            "stable": "Tighter, more uniform output — good for long narration or noisy references.",
        }
    },
    "quality_gate": QUALITY_GATE,
}


def _start_loaders() -> None:
    if _flag("KOKORO_PRELOAD_ON_STARTUP", "1"):
        def kokoro_boot():
            service.kokoro.load()
            if service.kokoro.ready:
                service.kokoro.warm({v["voice"] for v in service.stock.values() if v["engine"] == "kokoro"})
        threading.Thread(target=kokoro_boot, daemon=True, name="kokoro-loader").start()
    if _flag("XTTS_PRELOAD_ON_STARTUP", "1"):
        threading.Thread(target=service.xtts.load, daemon=True, name="xtts-loader").start()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("NextEleven Voice Service %s starting (device=%s, voices=%s)", VERSION, DEVICE, VOICES_DIR)
    _start_loaders()
    yield


app = FastAPI(title="NextEleven Voice Service", version=VERSION, lifespan=lifespan)

_cors_origins = os.getenv("CORS_ORIGINS", "*").strip()
_cors_origins_list = [o.strip() for o in _cors_origins.split(",")] if _cors_origins else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins_list,
    allow_credentials=_cors_origins_list != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def _raise(e: ServiceError):
    raise HTTPException(status_code=e.status, detail=e.detail)


def _ensure_loading(engine) -> None:
    if not engine.ready and not engine.loading:
        threading.Thread(target=engine.load, daemon=True).start()


@app.get("/")
async def root():
    return {
        "service": "NextEleven Voice",
        "version": VERSION,
        "engines": ["kokoro", "xtts"],
        "real_voice_cloning": service.xtts.ready,
        "clone_guide": "/clone-guide",
    }


@app.get("/clone-guide")
async def clone_guide():
    return CLONE_GUIDE


def _engine_status(engine) -> Dict:
    return {"ready": engine.ready, "loading": engine.loading, "error": engine.load_error}


@app.get("/health")
async def health_check():
    cuda_available, cuda_device, cuda_version = False, None, None
    try:
        import torch

        cuda_available = bool(torch.cuda.is_available())
        if cuda_available:
            cuda_device = torch.cuda.get_device_name(0)
            cuda_version = getattr(torch.version, "cuda", None)
    except Exception:
        pass
    xtts, kokoro = service.xtts, service.kokoro
    warnings: List[str] = []
    if xtts.loading:
        warnings.append("XTTS model is still loading; cloned and studio voices will be available shortly")
    elif not xtts.ready:
        warnings.append(f"XTTS unavailable: {xtts.load_error or 'not loaded'}")
    if kokoro.loading:
        warnings.append("Stock voice engine is still loading")
    elif not kokoro.ready:
        warnings.append(f"Kokoro unavailable: {kokoro.load_error or 'not loaded'}")
    return {
        "status": "healthy" if (xtts.ready and kokoro.ready) else "degraded",
        "service": "NextEleven Voice",
        "version": VERSION,
        "voice_cloning": "real" if xtts.ready else "unavailable",
        "tts_engine": "local",
        "stock_tts_ready": kokoro.ready,
        "xtts_loaded": xtts.ready,
        "xtts_functional": xtts.ready,
        "xtts_model_available": xtts.ready,
        "xtts_loading": xtts.loading,
        "engines": {"kokoro": _engine_status(kokoro), "xtts": _engine_status(xtts)},
        "external_apis": [],
        "cloned_voices": len(list(VOICES_DIR.glob("*.json"))),
        "stock_voices": len(service.stock),
        "device": DEVICE,
        "cuda_available": cuda_available,
        "cuda_device": cuda_device,
        "cuda_version": cuda_version,
        "voices_directory": str(VOICES_DIR),
        "voices_directory_writable": os.access(VOICES_DIR, os.W_OK),
        "voices_directory_persistent": bool(os.getenv("VOICES_DIR") or os.getenv("RAILWAY_VOLUME_MOUNT_PATH")),
        "cors_origins": _cors_origins_list,
        "features": {
            "multi_sample_cloning": True,
            "audio_preprocessing": True,
            "quality_validation": True,
            "quality_gate": QUALITY_GATE,
            "real_voice_cloning": xtts.ready,
            "clone_guide_endpoint": "/clone-guide",
            "clone_presets": list(CLONE_PRESETS.keys()),
            "output_formats": ["wav", "mp3"],
            "pause_markers": True,
            "inline_phonemes": True,
            "gpu_dockerfile": "services/xtts/Dockerfile.gpu",
        },
        **({"warnings": warnings} if warnings else {}),
    }


@app.get("/voices")
async def list_voices():
    return {"voices": service.cloned_voice_list(), "stock_voices": service.stock_voice_list()}


@app.get("/stock-voices")
async def list_stock_voices():
    return {"voices": service.stock_voice_list()}


@app.get("/voices/{voice_id}")
async def get_voice(voice_id: str):
    try:
        return service.read_meta(voice_id)
    except ServiceError as e:
        _raise(e)


class TuningUpdate(BaseModel):
    clone_preset: Optional[str] = None
    temperature: Optional[float] = None
    repetition_penalty: Optional[float] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    reset: bool = False


@app.put("/voices/{voice_id}/tuning")
async def update_voice_tuning(voice_id: str, body: TuningUpdate):
    try:
        tuning = None if body.reset else body.model_dump(exclude={"reset"}, exclude_none=True)
        return {"voice_id": voice_id, "default_tuning": service.update_tuning(voice_id, tuning)}
    except ServiceError as e:
        _raise(e)


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
    mastering_enabled: bool = False
    mastering_profile: str = "none"  # none | podcast | broadcast | cinematic
    pronunciation_overrides: Optional[Dict[str, str]] = None
    # Accepted for compatibility; prosody is applied by the web API before forwarding.
    auto_expressive: bool = False
    expressive_intensity: str = "subtle"
    clone_preset: Optional[str] = None  # natural | expressive | stable
    # Explicit XTTS sampling overrides; omit to use the preset / the voice's saved tuning.
    temperature: Optional[float] = None
    repetition_penalty: Optional[float] = None
    top_k: Optional[int] = None
    top_p: Optional[float] = None
    output_format: str = Field("wav", pattern="^(wav|mp3)$")
    normalize: bool = True


MAX_TEXT_CHARS = int(os.getenv("VOICE_MAX_TEXT_CHARS", "5000"))


@app.post("/tts")
async def generate_speech(request: TTSRequest):
    text = (request.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    if len(text) > MAX_TEXT_CHARS:
        raise HTTPException(status_code=400, detail="Text too long")
    if request.voice_id.startswith("clone_") or service.stock.get(request.voice_id, {}).get("engine") == "xtts":
        _ensure_loading(service.xtts)
    else:
        _ensure_loading(service.kokoro)
    req = RenderRequest(
        text=text,
        voice_id=request.voice_id,
        language=request.language,
        speed=request.speed,
        pitch=request.pitch,
        volume=request.volume,
        effects={
            "reverb": request.reverb,
            "echo": request.echo,
            "noise_reduction": request.noise_reduction,
            "special_effect": request.special_effect,
            "mastering_enabled": request.mastering_enabled,
            "mastering_profile": request.mastering_profile,
        },
        pronunciation_overrides=request.pronunciation_overrides,
        clone_preset=request.clone_preset,
        temperature=request.temperature,
        repetition_penalty=request.repetition_penalty,
        top_k=request.top_k,
        top_p=request.top_p,
        output_format=request.output_format,
        normalize=request.normalize,
    )
    try:
        result = await run_in_threadpool(service.render, req)
    except ServiceError as e:
        _raise(e)
    except Exception as e:
        logger.exception("Synthesis failed for %s", request.voice_id)
        raise HTTPException(status_code=500, detail=f"Synthesis failed: {e}")
    return Response(content=result.audio, media_type=result.media_type, headers=result.headers)


@app.post("/clone")
async def clone_voice(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    files: List[UploadFile] = File(...),
):
    if not files:
        raise HTTPException(status_code=400, detail="Audio file required")
    if len(files) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 files")
    if not name.strip():
        raise HTTPException(status_code=400, detail="Name required")
    uploads = [(f.filename or f"audio_{i}", await f.read()) for i, f in enumerate(files)]
    _ensure_loading(service.xtts)
    try:
        out = await run_in_threadpool(service.create_clone, name.strip(), description, uploads, QUALITY_GATE)
    except ServiceError as e:
        _raise(e)
    meta, reports = out["meta"], out["reports"]
    warnings = meta["quality_warnings"]
    message = f"Voice '{name}' cloned successfully!"
    if meta["reference_seconds"] < 10:
        message += f" Tip: only {meta['reference_seconds']:.0f}s of speech was usable. For best results, use 30+ seconds."
    if not service.xtts.ready:
        message += " The cloning engine is still loading; the voice will be usable in a minute."
    return {
        "success": True,
        "voice_id": meta["voice_id"],
        "name": meta["name"],
        "calibration_script": VOICE_CLONE_CALIBRATION_SCRIPT,
        "samples_count": sum(1 for r in meta["references"] if r["use"]),
        "total_duration": meta["total_duration"],
        "reference_seconds": meta["reference_seconds"],
        "quality_tier": meta["quality_tier"],
        "quality_score": meta["quality_score"],
        "quality_reports": reports,
        "default_tuning": meta["default_tuning"],
        "calibration_profile": {
            "recommended_mode": "identity_safe" if meta["default_tuning"]["clone_preset"] == "stable" else "balanced",
            "sample_coverage": "broad" if meta["reference_seconds"] >= 30 and len(reports) >= 2 else "limited",
            "confidence": round(min(0.98, max(0.4, meta["quality_score"] / 100)), 2),
        },
        "real_clone": True,
        "xtts_available": service.xtts.ready,
        "preprocessed": True,
        "quality_warnings": warnings[:3],
        "recommendations": sorted({r for rep in reports for r in rep["recommendations"]})[:3],
        "quality_gate": {
            "enabled": True,
            "strict_reject_mode": QUALITY_GATE["strict_reject_mode"],
            "failed_samples": meta["quality_gate_failed_samples"],
            "passed": meta["quality_gate_failed_samples"] == 0,
        },
        "clone_tips": CLONE_GUIDE["reference_audio"]["tips"][:5],
        "clone_presets": list(CLONE_PRESETS.keys()),
        "sample_files_count": len(meta["references"]),
        "sample_files": [r["file"] for r in meta["references"][:3]],
        "message": message,
        "warnings": [] if service.xtts.ready else ["Cloning engine still loading"],
    }


@app.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    try:
        service.delete_clone(voice_id)
    except ServiceError as e:
        _raise(e)
    logger.info("Deleted voice %s", voice_id)
    return {"success": True}


if __name__ == "__main__":
    port = int(os.getenv("PORT", os.getenv("XTTS_PORT", "8081")))
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
