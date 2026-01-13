"""
NextEleven Voice Service v2.2
Voice synthesis with edge-tts + effects
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

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

logger.info("=" * 50)
logger.info("  NextEleven Voice Service v2.2")
logger.info("=" * 50)

# FastAPI imports
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel
import uvicorn

# edge-tts
try:
    import edge_tts
    HAS_EDGE_TTS = True
    logger.info("✅ edge-tts available")
except ImportError:
    HAS_EDGE_TTS = False
    logger.error("❌ edge-tts not available")

# Initialize FastAPI
app = FastAPI(title="NextEleven Voice Service", version="2.2.0")

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

# Edge TTS voices
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


@app.on_event("startup")
async def startup_event():
    logger.info(f"🚀 Service ready | edge-tts: {HAS_EDGE_TTS}")


@app.get("/")
async def root():
    return {"service": "NextEleven Voice", "version": "2.2.0"}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "NextEleven Voice",
        "version": "2.2.0",
        "tts_engine": "edge-tts",
        "cloned_voices": len(list(VOICES_DIR.glob("*.json")))
    }


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
                    "source": "cloned"
                })
        except Exception as e:
            logger.error(f"Error reading {voice_file}: {e}")
    return {"voices": voices}


@app.post("/tts")
async def generate_speech(request: TTSRequest):
    """Generate speech with effects"""
    text = request.text.strip()
    voice_id = request.voice_id
    speed = max(0.5, min(2.0, request.speed))
    pitch = max(-20, min(20, request.pitch))
    volume = max(0.0, min(1.0, request.volume))
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="Text too long")
    
    logger.info(f"🎤 TTS: voice={voice_id}, speed={speed}, pitch={pitch}")
    
    effects = {
        "reverb": request.reverb,
        "echo": request.echo,
        "noise_reduction": request.noise_reduction,
        "special_effect": request.special_effect
    }
    
    return await generate_edge_speech(text, voice_id, speed, pitch, volume, effects)


async def generate_edge_speech(text: str, voice_id: str, speed: float, pitch: float, volume: float, effects: dict):
    """Generate speech with edge-tts"""
    if not HAS_EDGE_TTS:
        raise HTTPException(status_code=500, detail="TTS not available")
    
    edge_voice = EDGE_VOICES.get(voice_id, "en-US-GuyNeural")
    
    # Speed and pitch for edge-tts
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
        
        # Apply effects if any
        has_effects = (
            effects.get("reverb", 0) > 0 or
            effects.get("echo", 0) > 0 or
            effects.get("noise_reduction") or
            effects.get("special_effect", "none") != "none" or
            volume != 1.0
        )
        
        if has_effects:
            audio_data = apply_effects(audio_data, volume, effects)
        
        logger.info(f"✅ Generated: {len(audio_data)} bytes")
        
        return Response(content=audio_data, media_type="audio/mpeg")
        
    except Exception as e:
        logger.error(f"❌ TTS error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def apply_effects(audio_data: bytes, volume: float, effects: dict) -> bytes:
    """Apply audio effects using ffmpeg"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_in:
            tmp_in.write(audio_data)
            input_path = tmp_in.name
        
        output_path = input_path.replace('.mp3', '_fx.mp3')
        filters = []
        
        # Special effect
        special = effects.get("special_effect", "none")
        if special == "robot":
            filters.extend(['tremolo=f=40:d=0.7', 'highpass=f=200', 'lowpass=f=4000'])
        elif special == "radio":
            filters.extend(['highpass=f=300', 'lowpass=f=3000'])
        elif special == "whisper":
            filters.extend(['highpass=f=500', 'lowpass=f=8000', 'volume=0.7'])
        elif special == "deep":
            filters.append('asetrate=44100*0.7,aresample=44100')
        elif special == "chipmunk":
            filters.append('asetrate=44100*1.5,aresample=44100')
        elif special == "cave":
            filters.append('aecho=0.8:0.9:100:0.5')
        elif special == "telephone":
            filters.extend(['highpass=f=400', 'lowpass=f=3400'])
        elif special == "underwater":
            filters.extend(['lowpass=f=800', 'vibrato=f=6:d=0.5'])
        elif special == "megaphone":
            filters.extend(['highpass=f=500', 'lowpass=f=4000', 'volume=1.5'])
        
        # Reverb
        if effects.get("reverb", 0) > 0:
            delay = int(50 + effects["reverb"] * 100)
            filters.append(f'aecho=0.8:0.9:{delay}:0.4')
        
        # Echo
        if effects.get("echo", 0) > 0:
            delay = int(200 + effects["echo"] * 400)
            filters.append(f'aecho=0.8:0.7:{delay}:0.3')
        
        # Noise reduction
        if effects.get("noise_reduction"):
            filters.extend(['highpass=f=80', 'lowpass=f=12000'])
        
        # Volume
        if volume != 1.0:
            filters.append(f'volume={volume}')
        
        if filters:
            filter_str = ','.join(filters)
            cmd = ['ffmpeg', '-y', '-i', input_path, '-af', filter_str, '-q:a', '2', output_path]
            subprocess.run(cmd, capture_output=True, check=True)
        else:
            shutil.copy(input_path, output_path)
        
        with open(output_path, 'rb') as f:
            result = f.read()
        
        os.unlink(input_path)
        os.unlink(output_path)
        return result
        
    except Exception as e:
        logger.warning(f"Effects failed: {e}")
        return audio_data


@app.post("/clone")
async def clone_voice(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    """Clone a voice from audio samples"""
    logger.info(f"🎙️ Clone: name={name}, files={len(files)}")
    
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
    try:
        for i, file in enumerate(files):
            content = await file.read()
            if len(content) < 1000:
                raise HTTPException(status_code=400, detail=f"File too small")
            
            suffix = Path(file.filename or f"audio_{i}").suffix or '.wav'
            file_path = voice_dir / f"sample_{i}{suffix}"
            
            with open(file_path, 'wb') as f:
                f.write(content)
            saved_files.append(str(file_path))
        
        metadata = {
            "voice_id": voice_id,
            "name": name,
            "description": description,
            "sample_files": saved_files,
            "created_at": datetime.datetime.now().isoformat()
        }
        
        with open(VOICES_DIR / f"{voice_id}.json", 'w') as f:
            json.dump(metadata, f, indent=2)
        
        logger.info(f"✅ Cloned: {name} ({voice_id})")
        
        return {"success": True, "voice_id": voice_id, "name": name}
        
    except HTTPException:
        shutil.rmtree(voice_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(voice_dir, ignore_errors=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    voice_file = VOICES_DIR / f"{voice_id}.json"
    voice_dir = VOICES_DIR / voice_id
    
    if not voice_file.exists():
        raise HTTPException(status_code=404, detail="Voice not found")
    
    shutil.rmtree(voice_dir, ignore_errors=True)
    voice_file.unlink(missing_ok=True)
    return {"success": True}


if __name__ == "__main__":
    port = int(os.getenv("XTTS_PORT", "8081"))
    logger.info(f"🌐 Starting on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
