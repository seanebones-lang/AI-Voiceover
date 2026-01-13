"""
NextEleven Voice Service
REAL Voice Cloning using Coqui XTTS + edge-tts fallback
"""

import sys
import os
import traceback

# Set up logging FIRST
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

logger.info("=" * 60)
logger.info("  NextEleven Voice Service - REAL Voice Cloning")
logger.info("=" * 60)

# Core imports
try:
    from fastapi import FastAPI, File, UploadFile, HTTPException, Form
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import Response, FileResponse
    from pydantic import BaseModel
    from typing import List, Optional
    import uvicorn
    import tempfile
    import shutil
    from pathlib import Path
    import json
    import datetime
    import asyncio
    import hashlib
    logger.info("✅ Core imports OK")
except ImportError as e:
    logger.error(f"❌ Core import failed: {e}")
    sys.exit(1)

# edge-tts for standard voices
try:
    import edge_tts
    HAS_EDGE_TTS = True
    logger.info("✅ edge-tts available")
except ImportError:
    HAS_EDGE_TTS = False
    logger.warning("⚠️ edge-tts not available")

# Coqui TTS for voice cloning
HAS_XTTS = False
tts_model = None

try:
    import torch
    import torchaudio
    from TTS.api import TTS
    
    # Check for GPU
    device = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"✅ PyTorch available, device: {device}")
    
    # Try to load XTTS model (this can do voice cloning)
    try:
        logger.info("🔄 Loading XTTS model for voice cloning...")
        tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        HAS_XTTS = True
        logger.info("✅ XTTS model loaded - REAL voice cloning enabled!")
    except Exception as e:
        logger.warning(f"⚠️ Could not load XTTS: {e}")
        logger.info("   Voice cloning will use edge-tts fallback")
        
except ImportError as e:
    logger.warning(f"⚠️ Coqui TTS not available: {e}")
    logger.info("   Will use edge-tts only (no real voice cloning)")

# Initialize FastAPI
app = FastAPI(
    title="NextEleven Voice Service",
    version="2.1.0",
    description="Production TTS with REAL voice cloning via XTTS"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage
VOICES_DIR = Path(os.getenv("VOICES_DIR", "/app/cloned_voices"))
VOICES_DIR.mkdir(parents=True, exist_ok=True)

# Edge TTS voice mapping
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


@app.on_event("startup")
async def startup_event():
    logger.info("🚀 Service starting...")
    logger.info(f"   XTTS available: {HAS_XTTS}")
    logger.info(f"   edge-tts available: {HAS_EDGE_TTS}")
    logger.info(f"   Voices directory: {VOICES_DIR}")
    logger.info("✅ NextEleven Voice Service ready!")


@app.get("/")
async def root():
    return {
        "service": "NextEleven Voice",
        "version": "2.1.0",
        "xtts_enabled": HAS_XTTS,
        "edge_tts_enabled": HAS_EDGE_TTS
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "NextEleven Voice",
        "tts_engine": "xtts" if HAS_XTTS else "edge-tts",
        "voice_cloning": "real" if HAS_XTTS else "placeholder",
        "cloned_voices": len(list(VOICES_DIR.glob("*.json"))),
        "voices_dir": str(VOICES_DIR)
    }


@app.get("/voices")
async def list_cloned_voices():
    """List all cloned voices"""
    voices = []
    for voice_file in VOICES_DIR.glob("*.json"):
        try:
            with open(voice_file) as f:
                voice_data = json.load(f)
                voices.append({
                    "voice_id": voice_data.get("voice_id"),
                    "name": voice_data.get("name"),
                    "description": voice_data.get("description"),
                    "created_at": voice_data.get("created_at"),
                    "source": "cloned",
                    "real_clone": voice_data.get("real_clone", False)
                })
        except Exception as e:
            logger.error(f"Error reading {voice_file}: {e}")
    return {"voices": voices}


@app.post("/tts")
async def generate_speech(request: TTSRequest):
    """Generate speech - uses XTTS for cloned voices, edge-tts for standard"""
    text = request.text.strip()
    voice_id = request.voice_id
    language = request.language
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="Text must be 5000 characters or less")
    
    logger.info(f"🎤 TTS request: voice={voice_id}, lang={language}, text='{text[:50]}...'")
    
    # Check if this is a cloned voice
    if voice_id.startswith("clone_"):
        return await generate_cloned_voice_speech(text, voice_id, language)
    else:
        return await generate_edge_tts_speech(text, voice_id)


async def generate_cloned_voice_speech(text: str, voice_id: str, language: str):
    """Generate speech using cloned voice via XTTS"""
    
    # Get voice metadata
    voice_file = VOICES_DIR / f"{voice_id}.json"
    if not voice_file.exists():
        raise HTTPException(status_code=404, detail=f"Voice not found: {voice_id}")
    
    with open(voice_file) as f:
        voice_data = json.load(f)
    
    sample_files = voice_data.get("sample_files", [])
    if not sample_files:
        raise HTTPException(status_code=400, detail="No audio samples for this voice")
    
    # Find a valid sample file
    reference_audio = None
    for sample in sample_files:
        if os.path.exists(sample):
            reference_audio = sample
            break
    
    if not reference_audio:
        raise HTTPException(status_code=400, detail="Voice sample files not found")
    
    # Use XTTS if available for REAL voice cloning
    if HAS_XTTS and tts_model:
        try:
            logger.info(f"🎙️ Using XTTS for REAL voice cloning from: {reference_audio}")
            
            # Create temp output file
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
                output_path = tmp.name
            
            # Generate with voice cloning
            tts_model.tts_to_file(
                text=text,
                file_path=output_path,
                speaker_wav=reference_audio,
                language=language
            )
            
            # Read and return
            with open(output_path, 'rb') as f:
                audio_data = f.read()
            
            os.unlink(output_path)
            
            logger.info(f"✅ XTTS voice clone generated: {len(audio_data)} bytes")
            
            return Response(
                content=audio_data,
                media_type="audio/wav",
                headers={"X-Voice-Clone": "real", "X-Engine": "xtts"}
            )
            
        except Exception as e:
            logger.error(f"❌ XTTS error: {e}")
            logger.info("   Falling back to edge-tts")
    
    # Fallback to edge-tts with default voice
    logger.info(f"📢 Using edge-tts fallback for cloned voice: {voice_id}")
    return await generate_edge_tts_speech(text, "default_english")


async def generate_edge_tts_speech(text: str, voice_id: str):
    """Generate speech using edge-tts"""
    
    if not HAS_EDGE_TTS:
        raise HTTPException(status_code=500, detail="No TTS engine available")
    
    edge_voice = EDGE_VOICES.get(voice_id, "en-US-GuyNeural")
    
    logger.info(f"🔊 Using edge-tts voice: {edge_voice}")
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp:
            output_path = tmp.name
        
        communicate = edge_tts.Communicate(text, edge_voice)
        await communicate.save(output_path)
        
        with open(output_path, 'rb') as f:
            audio_data = f.read()
        
        os.unlink(output_path)
        
        logger.info(f"✅ edge-tts generated: {len(audio_data)} bytes")
        
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={"X-Voice-Clone": "false", "X-Engine": "edge-tts"}
        )
        
    except Exception as e:
        logger.error(f"❌ edge-tts error: {e}")
        raise HTTPException(status_code=500, detail=f"TTS failed: {str(e)}")


@app.post("/clone")
async def clone_voice(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    """Clone a voice from audio samples"""
    
    logger.info(f"🎙️ Clone request: name={name}, files={len(files)}")
    
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="At least one audio file required")
    
    if len(files) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 files allowed")
    
    if not name or len(name.strip()) == 0:
        raise HTTPException(status_code=400, detail="Voice name is required")
    
    # Create voice ID
    safe_name = name.lower().replace(' ', '_').replace('-', '_')
    safe_name = ''.join(c for c in safe_name if c.isalnum() or c == '_')
    voice_id = f"clone_{safe_name}_{hashlib.md5(name.encode()).hexdigest()[:6]}"
    
    voice_dir = VOICES_DIR / voice_id
    voice_dir.mkdir(parents=True, exist_ok=True)
    
    saved_files = []
    try:
        for i, file in enumerate(files):
            filename = file.filename or f"audio_{i}"
            content_type = file.content_type or ""
            
            # Validate
            valid_extensions = ('.wav', '.mp3', '.ogg', '.flac', '.m4a', '.webm', '.opus')
            if not (content_type.startswith('audio/') or filename.lower().endswith(valid_extensions)):
                raise HTTPException(status_code=400, detail=f"Invalid file type: {filename}")
            
            # Save file
            suffix = Path(filename).suffix or '.wav'
            file_path = voice_dir / f"sample_{i}{suffix}"
            
            content = await file.read()
            if len(content) < 1000:
                raise HTTPException(status_code=400, detail=f"File too small: {filename}")
            
            with open(file_path, 'wb') as f:
                f.write(content)
            
            saved_files.append(str(file_path))
            logger.info(f"   Saved: {file_path} ({len(content)} bytes)")
        
        # Convert to WAV if needed for XTTS compatibility
        wav_files = []
        for sample in saved_files:
            wav_path = await convert_to_wav(sample)
            if wav_path:
                wav_files.append(wav_path)
        
        # Save metadata
        voice_metadata = {
            "voice_id": voice_id,
            "name": name,
            "description": description,
            "sample_files": wav_files if wav_files else saved_files,
            "original_files": saved_files,
            "created_at": datetime.datetime.now().isoformat(),
            "real_clone": HAS_XTTS
        }
        
        with open(VOICES_DIR / f"{voice_id}.json", 'w') as f:
            json.dump(voice_metadata, f, indent=2)
        
        clone_type = "REAL (XTTS)" if HAS_XTTS else "placeholder (edge-tts fallback)"
        logger.info(f"✅ Voice cloned: {name} ({voice_id}) - {clone_type}")
        
        return {
            "success": True,
            "voice_id": voice_id,
            "name": name,
            "description": description,
            "samples_count": len(saved_files),
            "real_clone": HAS_XTTS,
            "message": f"Voice '{name}' cloned successfully! {'Real voice cloning enabled.' if HAS_XTTS else 'Using edge-tts fallback.'}"
        }
        
    except HTTPException:
        shutil.rmtree(voice_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(voice_dir, ignore_errors=True)
        logger.error(f"❌ Clone error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def convert_to_wav(input_path: str) -> Optional[str]:
    """Convert audio file to WAV format for XTTS compatibility"""
    try:
        import soundfile as sf
        import librosa
        
        # Load audio
        y, sr = librosa.load(input_path, sr=22050, mono=True)
        
        # Save as WAV
        wav_path = input_path.rsplit('.', 1)[0] + '_converted.wav'
        sf.write(wav_path, y, sr)
        
        logger.info(f"   Converted to WAV: {wav_path}")
        return wav_path
        
    except Exception as e:
        logger.warning(f"   Could not convert {input_path}: {e}")
        return None


@app.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    """Delete a cloned voice"""
    voice_file = VOICES_DIR / f"{voice_id}.json"
    voice_dir = VOICES_DIR / voice_id
    
    if not voice_file.exists():
        raise HTTPException(status_code=404, detail=f"Voice not found: {voice_id}")
    
    shutil.rmtree(voice_dir, ignore_errors=True)
    voice_file.unlink(missing_ok=True)
    
    logger.info(f"🗑️ Deleted voice: {voice_id}")
    return {"success": True, "message": f"Voice '{voice_id}' deleted"}


@app.get("/capabilities")
async def get_capabilities():
    """Get service capabilities"""
    return {
        "tts_engines": {
            "xtts": HAS_XTTS,
            "edge_tts": HAS_EDGE_TTS
        },
        "voice_cloning": {
            "available": True,
            "real_cloning": HAS_XTTS,
            "method": "XTTS zero-shot cloning" if HAS_XTTS else "edge-tts with stored samples"
        },
        "languages": ["en", "es", "fr", "de", "pt", "it", "pl", "tr", "ru", "nl", "cs", "ar", "zh-cn", "ja", "ko"],
        "max_text_length": 5000,
        "supported_audio_formats": ["wav", "mp3", "ogg", "flac", "m4a", "webm"]
    }


if __name__ == "__main__":
    port = int(os.getenv("XTTS_PORT", "8081"))
    logger.info(f"🌐 Starting on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
