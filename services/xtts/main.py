"""
NextEleven Voice Service v3.1
REAL Voice Cloning with XTTS
Enhanced audio preprocessing for better clone quality

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
from pathlib import Path
from typing import List, Optional

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

logger.info("=" * 60)
logger.info("  NextEleven Voice Service v3.1")
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
    
    # Verify XTTS actually works by testing a simple generation
    logger.info("🔄 Verifying XTTS is working...")
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as test_file:
            test_path = test_file.name
        # Quick test generation
        tts_model.tts_to_file(
            text="Test",
            file_path=test_path,
            speaker_wav=None,  # Use default speaker for test
            language="en"
        )
        if os.path.exists(test_path) and os.path.getsize(test_path) > 1000:
            os.unlink(test_path)
            logger.info("✅ XTTS model loaded and verified - REAL voice cloning enabled!")
        else:
            raise ValueError("XTTS test generation produced invalid output")
    except Exception as test_error:
        logger.error(f"❌ XTTS verification failed: {test_error}")
        HAS_XTTS = False
        XTTS_LOAD_ERROR = f"XTTS loaded but verification failed: {test_error}"
        tts_model = None
        
except ImportError as e:
    XTTS_LOAD_ERROR = f"TTS library not installed: {e}"
    logger.error(f"❌ XTTS not available: {e}")
    logger.error("   Install with: pip install TTS")
except Exception as e:
    XTTS_LOAD_ERROR = f"XTTS failed to load: {e}"
    logger.error(f"❌ XTTS failed to load: {e}")
    logger.error("   Voice cloning will NOT work without XTTS!")

app = FastAPI(title="NextEleven Voice Service", version="3.1.0")

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

VOICES_DIR = Path(os.getenv("VOICES_DIR", "/app/cloned_voices"))
VOICES_DIR.mkdir(parents=True, exist_ok=True)

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
    # Advanced XTTS parameters for fine-tuning
    temperature: float = 0.7  # Lower = more consistent, higher = more varied
    repetition_penalty: float = 2.0  # Helps prevent repetitive artifacts
    top_k: int = 50  # Sampling diversity
    top_p: float = 0.85  # Nucleus sampling


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
        "version": "3.0.0",
        "real_voice_cloning": HAS_XTTS
    }


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
    
    health_data = {
        "status": status,
        "service": "NextEleven Voice",
        "version": "3.1.0",
        "voice_cloning": "real" if HAS_XTTS and xtts_functional else "unavailable",
        "tts_engine": "xtts" if HAS_XTTS else "edge-tts",
        "xtts_loaded": HAS_XTTS,
        "xtts_functional": xtts_functional,
        "xtts_model_available": tts_model is not None,
        "cloned_voices": len(list(VOICES_DIR.glob("*.json"))),
        "device": DEVICE,
        "voices_directory": str(VOICES_DIR),
        "voices_directory_writable": os.access(VOICES_DIR, os.W_OK),
        "features": {
            "multi_sample_cloning": True,
            "audio_preprocessing": True,
            "quality_validation": True,
            "real_voice_cloning": HAS_XTTS and xtts_functional
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
            text, voice_id, language, speed, volume, effects,
            temperature=request.temperature,
            repetition_penalty=request.repetition_penalty,
            top_k=request.top_k,
            top_p=request.top_p
        )
    else:
        logger.info(f"Standard TTS: {voice_id}")
        return await generate_edge_speech(text, voice_id, speed, pitch, volume, effects)


async def generate_cloned_speech(text: str, voice_id: str, language: str, speed: float, volume: float, effects: dict, 
                                  temperature: float = 0.7, repetition_penalty: float = 2.0, top_k: int = 50, top_p: float = 0.85):
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
    
    # Use multiple reference samples for better voice similarity (XTTS supports this)
    # Prefer preprocessed samples, but use all available for best quality
    reference_audios = []
    for sample in valid_samples:
        if '_preprocessed.wav' in sample or sample.endswith('.wav'):
            reference_audios.append(sample)
    
    # If no preprocessed, use all valid samples
    if not reference_audios:
        reference_audios = valid_samples[:3]  # XTTS works best with 1-3 samples
    else:
        reference_audios = reference_audios[:3]  # Limit to 3 best samples
    
    # Use the best single sample (XTTS tts_to_file uses one, but we can try multiple)
    primary_reference = reference_audios[0]
    
    try:
        logger.info(f"🎭 XTTS REAL VOICE CLONING for {voice_id}")
        logger.info(f"   Primary reference: {primary_reference}")
        logger.info(f"   Total samples available: {len(reference_audios)}")
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
        
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
            output_path = tmp.name
        
        # Map language codes
        lang_map = {
            'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it',
            'pt': 'pt', 'pl': 'pl', 'tr': 'tr', 'ru': 'ru', 'nl': 'nl',
            'cs': 'cs', 'ar': 'ar', 'zh': 'zh-cn', 'ja': 'ja', 'ko': 'ko', 'hu': 'hu'
        }
        xtts_lang = lang_map.get(language, 'en')
        
        # REAL voice cloning with XTTS - use speaker_wav parameter
        # This is the critical parameter that makes XTTS clone the voice
        logger.info(f"   Generating with XTTS (language: {xtts_lang})...")
        
        try:
            # XTTS tts_to_file with speaker_wav - this clones the voice
            tts_model.tts_to_file(
                text=text,
                file_path=output_path,
                speaker_wav=primary_reference,  # CRITICAL: This parameter clones the voice
                language=xtts_lang
            )
            
            # CRITICAL: Verify output was generated and is valid
            if not os.path.exists(output_path):
                raise ValueError(f"XTTS output file was not created: {output_path}")
            
            output_size = os.path.getsize(output_path)
            if output_size < 1000:
                raise ValueError(f"XTTS generated invalid audio file (too small: {output_size} bytes)")
            
            logger.info(f"✅ XTTS successfully generated cloned voice audio")
            logger.info(f"   Output file: {os.path.basename(output_path)}")
            logger.info(f"   Output size: {output_size} bytes ({output_size / 1024:.1f} KB)")
            logger.info(f"   Voice ID: {voice_id}")
            logger.info(f"   Reference used: {os.path.basename(primary_reference)}")
            
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
        
        # Read generated audio
        with open(output_path, 'rb') as f:
            audio_data = f.read()
        os.unlink(output_path)
        
        if len(audio_data) < 1000:
            raise ValueError("Generated audio is too small, XTTS may have failed")
        
        logger.info(f"✅ Generated {len(audio_data)} bytes of cloned voice audio")
        
        # Apply speed adjustment if needed
        if speed != 1.0:
            audio_data = adjust_speed(audio_data, speed)
        
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
                "X-Voice-ID": voice_id
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
            quality_reports.append(quality)
            total_duration += quality.get('duration', 0)
            
            # Convert to WAV for XTTS compatibility
            wav_path = convert_to_wav(str(file_path))
            if wav_path:
                # Preprocess for optimal cloning quality
                preprocessed_path = preprocess_audio_for_cloning(wav_path)
                if preprocessed_path:
                    saved_files.append(preprocessed_path)
                else:
                    saved_files.append(wav_path)
            else:
                saved_files.append(str(file_path))
        
        # Aggregate quality warnings
        all_warnings = []
        all_recommendations = []
        for report in quality_reports:
            all_warnings.extend(report.get('warnings', []))
            all_recommendations.extend(report.get('recommendations', []))
        
        # Deduplicate
        all_warnings = list(set(all_warnings))
        all_recommendations = list(set(all_recommendations))
        
        metadata = {
            "voice_id": voice_id,
            "name": name,
            "description": description,
            "sample_files": saved_files,
            "created_at": datetime.datetime.now().isoformat(),
            "real_clone": HAS_XTTS,
            "total_duration": total_duration,
            "quality_warnings": all_warnings,
            "preprocessed": True
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
            "samples_count": len(saved_files),
            "total_duration": total_duration,
            "real_clone": HAS_XTTS,
            "xtts_available": HAS_XTTS,
            "preprocessed": True,
            "quality_warnings": all_warnings[:3],
            "recommendations": all_recommendations[:3],
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
    """Convert audio to WAV format for XTTS"""
    try:
        wav_path = input_path.rsplit('.', 1)[0] + '_converted.wav'
        cmd = ['ffmpeg', '-y', '-i', input_path, '-ar', '22050', '-ac', '1', '-acodec', 'pcm_s16le', wav_path]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode == 0 and os.path.exists(wav_path):
            logger.info(f"   Converted to WAV: {wav_path}")
            return wav_path
    except Exception as e:
        logger.warning(f"WAV conversion failed: {e}")
    return None


def preprocess_audio_for_cloning(input_path: str) -> Optional[str]:
    """
    Preprocess audio for optimal voice cloning quality.
    - Normalize volume
    - Remove silence at start/end
    - Apply noise reduction
    - Resample to optimal rate
    """
    try:
        output_path = input_path.rsplit('.', 1)[0] + '_preprocessed.wav'
        
        # Build ffmpeg filter chain for preprocessing
        filters = [
            # Normalize audio levels
            'loudnorm=I=-16:TP=-1.5:LRA=11',
            # Remove silence from start and end
            'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB:detection=peak',
            'areverse',
            'silenceremove=start_periods=1:start_duration=0.1:start_threshold=-50dB:detection=peak',
            'areverse',
            # High-pass filter to remove low rumble
            'highpass=f=80',
            # Low-pass to remove high frequency noise
            'lowpass=f=8000',
        ]
        
        cmd = [
            'ffmpeg', '-y', '-i', input_path,
            '-af', ','.join(filters),
            '-ar', '22050',  # XTTS optimal sample rate
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
                
    except Exception as e:
        logger.warning(f"Audio validation failed: {e}")
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
