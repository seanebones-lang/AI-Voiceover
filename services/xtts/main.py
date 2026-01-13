"""
NextEleven Voice Service v2.2
REAL Voice Cloning + Working Speed/Pitch/Volume Controls
"""

import sys
import os
import traceback

import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger(__name__)

logger.info("=" * 60)
logger.info("  NextEleven Voice Service v2.2")
logger.info("  Speed/Pitch/Volume Controls ENABLED")
logger.info("=" * 60)

# Core imports
try:
from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import Response
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import tempfile
import shutil
from pathlib import Path
import json
    import datetime
    import hashlib
    import subprocess
    logger.info("✅ Core imports OK")
except ImportError as e:
    logger.error(f"❌ Core import failed: {e}")
    sys.exit(1)

# edge-tts
try:
    import edge_tts
    HAS_EDGE_TTS = True
    logger.info("✅ edge-tts available")
except ImportError:
    HAS_EDGE_TTS = False
    logger.error("❌ edge-tts not available!")

# Audio processing for volume/effects
try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False
    logger.warning("⚠️ numpy not available, volume control limited")

# Coqui TTS for voice cloning
HAS_XTTS = False
tts_model = None
DEVICE = "cpu"

try:
    import torch
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"✅ PyTorch available, device: {DEVICE}")
    
    from TTS.api import TTS
    try:
        logger.info("🔄 Loading XTTS model...")
        tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(DEVICE)
        HAS_XTTS = True
        logger.info("✅ XTTS loaded - REAL voice cloning enabled!")
    except Exception as e:
        logger.warning(f"⚠️ XTTS load failed: {e}")
except ImportError as e:
    logger.warning(f"⚠️ Coqui TTS not available: {e}")

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
    speed: float = 1.0    # 0.5 to 2.0
    pitch: float = 0      # -20 to +20 semitones
    volume: float = 1.0   # 0 to 1
    # Audio effects
    reverb: float = 0     # 0 to 1 (dry to wet)
    echo: float = 0       # 0 to 1 (amount)
    noise_reduction: bool = False


@app.on_event("startup")
async def startup_event():
    logger.info(f"🚀 Service ready | XTTS: {HAS_XTTS} | edge-tts: {HAS_EDGE_TTS}")


@app.get("/")
async def root():
    return {"service": "NextEleven Voice", "version": "2.2.0", "xtts": HAS_XTTS}


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "NextEleven Voice",
        "version": "2.2.0",
        "tts_engine": "xtts" if HAS_XTTS else "edge-tts",
        "voice_cloning": "real" if HAS_XTTS else "placeholder",
        "features": {
            "speed_control": True,
            "pitch_control": True,
            "volume_control": True,
        },
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
        except:
            pass
    return {"voices": voices}


@app.post("/tts")
async def generate_speech(request: TTSRequest):
    """Generate speech with speed, pitch, volume and audio effects"""
    text = request.text.strip()
    voice_id = request.voice_id
    language = request.language
    speed = max(0.5, min(2.0, request.speed))      # Clamp 0.5-2.0
    pitch = max(-20, min(20, request.pitch))       # Clamp -20 to +20
    volume = max(0.0, min(1.0, request.volume))    # Clamp 0-1
    reverb = max(0.0, min(1.0, request.reverb))    # Clamp 0-1
    echo = max(0.0, min(1.0, request.echo))        # Clamp 0-1
    noise_reduction = request.noise_reduction
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="Text too long")
    
    logger.info(f"🎤 TTS: voice={voice_id}, speed={speed}, pitch={pitch}, vol={volume}, reverb={reverb}, echo={echo}")
    
    # Route to appropriate handler
    effects = {"reverb": reverb, "echo": echo, "noise_reduction": noise_reduction}
    if voice_id.startswith("clone_"):
        return await generate_cloned_speech(text, voice_id, language, speed, pitch, volume, effects)
    else:
        return await generate_edge_speech(text, voice_id, speed, pitch, volume, effects)


async def generate_edge_speech(text: str, voice_id: str, speed: float, pitch: float, volume: float, effects: dict):
    """Generate speech with edge-tts including speed/pitch/volume and effects"""
    
    if not HAS_EDGE_TTS:
        raise HTTPException(status_code=500, detail="TTS engine unavailable")
    
    edge_voice = EDGE_VOICES.get(voice_id, "en-US-GuyNeural")
    
    # Convert speed to rate string: 1.0 = +0%, 0.5 = -50%, 2.0 = +100%
    rate_percent = int((speed - 1.0) * 100)
    rate_str = f"+{rate_percent}%" if rate_percent >= 0 else f"{rate_percent}%"
    
    # Convert pitch to Hz string: edge-tts uses Hz, roughly 1 semitone = 6%
    pitch_hz = int(pitch * 10)  # Rough conversion
    pitch_str = f"+{pitch_hz}Hz" if pitch_hz >= 0 else f"{pitch_hz}Hz"
    
    logger.info(f"   edge-tts: voice={edge_voice}, rate={rate_str}, pitch={pitch_str}")
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp:
            output_path = tmp.name
        
        # Create communicate with rate and pitch
        communicate = edge_tts.Communicate(text, edge_voice, rate=rate_str, pitch=pitch_str)
        await communicate.save(output_path)
        
        # Read audio
        with open(output_path, 'rb') as f:
            audio_data = f.read()
        os.unlink(output_path)
        
        # Apply volume
        if volume != 1.0:
            audio_data = apply_volume_mp3(audio_data, volume)
        
        # Apply effects
        if effects.get("reverb", 0) > 0 or effects.get("echo", 0) > 0 or effects.get("noise_reduction"):
            audio_data = apply_audio_effects_mp3(audio_data, effects)
        
        logger.info(f"✅ Generated: {len(audio_data)} bytes")
        
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={"X-Engine": "edge-tts", "X-Speed": str(speed), "X-Pitch": str(pitch)}
        )
        
    except Exception as e:
        logger.error(f"❌ edge-tts error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


async def generate_cloned_speech(text: str, voice_id: str, language: str, speed: float, pitch: float, volume: float, effects: dict):
    """Generate speech using cloned voice"""
    
    # Get voice metadata
    voice_file = VOICES_DIR / f"{voice_id}.json"
    if not voice_file.exists():
        raise HTTPException(status_code=404, detail=f"Voice not found: {voice_id}")
    
    with open(voice_file) as f:
        voice_data = json.load(f)
    
    sample_files = voice_data.get("sample_files", [])
    reference_audio = None
    for sample in sample_files:
        if os.path.exists(sample):
            reference_audio = sample
            break
    
    if not reference_audio:
        # Fallback to edge-tts if no samples
        logger.warning(f"No samples for {voice_id}, using edge-tts fallback")
        return await generate_edge_speech(text, "default_english", speed, pitch, volume, effects)
    
    # Use XTTS if available
    if HAS_XTTS and tts_model:
        try:
            logger.info(f"🎙️ XTTS cloning from: {reference_audio}")
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
                output_path = tmp.name
            
            # Generate with XTTS
            tts_model.tts_to_file(
                text=text,
                file_path=output_path,
                speaker_wav=reference_audio,
                language=language,
                speed=speed  # XTTS supports speed directly
            )
            
            # Read audio
            with open(output_path, 'rb') as f:
                audio_data = f.read()
            os.unlink(output_path)
            
            # Apply pitch and volume post-processing
            if pitch != 0 or volume != 1.0:
                audio_data = apply_audio_effects_wav(audio_data, pitch, volume)
            
            # Apply effects
            if effects.get("reverb", 0) > 0 or effects.get("echo", 0) > 0 or effects.get("noise_reduction"):
                audio_data = apply_audio_effects_wav_full(audio_data, effects)
            
            logger.info(f"✅ XTTS generated: {len(audio_data)} bytes")
            
            return Response(
                content=audio_data,
                media_type="audio/wav",
                headers={"X-Engine": "xtts", "X-Clone": "real"}
            )
            
        except Exception as e:
            logger.error(f"❌ XTTS error: {e}, falling back to edge-tts")
    
    # Fallback to edge-tts
    return await generate_edge_speech(text, "default_english", speed, pitch, volume, effects)


def apply_volume_mp3(audio_data: bytes, volume: float) -> bytes:
    """Apply volume adjustment to MP3 using ffmpeg"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_in:
            tmp_in.write(audio_data)
            input_path = tmp_in.name
        
        output_path = input_path.replace('.mp3', '_vol.mp3')
        
        # Use ffmpeg to adjust volume
        cmd = [
            'ffmpeg', '-y', '-i', input_path,
            '-filter:a', f'volume={volume}',
            '-q:a', '2', output_path
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        
        with open(output_path, 'rb') as f:
            result = f.read()
        
        os.unlink(input_path)
                os.unlink(output_path)
        
        return result
    except Exception as e:
        logger.warning(f"Volume adjust failed: {e}")
        return audio_data


def apply_audio_effects_wav(audio_data: bytes, pitch: float, volume: float) -> bytes:
    """Apply pitch and volume to WAV using ffmpeg"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_in:
            tmp_in.write(audio_data)
            input_path = tmp_in.name
        
        output_path = input_path.replace('.wav', '_fx.wav')
        
        # Build filter chain
        filters = []
        if volume != 1.0:
            filters.append(f'volume={volume}')
        if pitch != 0:
            # Pitch shift using rubberband or asetrate
            # Semitones to rate: 2^(semitones/12)
            rate_mult = 2 ** (pitch / 12)
            filters.append(f'asetrate=44100*{rate_mult},aresample=44100')
        
        if filters:
            filter_str = ','.join(filters)
            cmd = ['ffmpeg', '-y', '-i', input_path, '-filter:a', filter_str, output_path]
        else:
            cmd = ['ffmpeg', '-y', '-i', input_path, '-c', 'copy', output_path]
        
        subprocess.run(cmd, capture_output=True, check=True)
        
        with open(output_path, 'rb') as f:
            result = f.read()
        
        os.unlink(input_path)
        os.unlink(output_path)
        
        return result
    except Exception as e:
        logger.warning(f"Audio effects failed: {e}")
        return audio_data


def apply_audio_effects_mp3(audio_data: bytes, effects: dict) -> bytes:
    """Apply audio effects to MP3 using ffmpeg"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.mp3') as tmp_in:
            tmp_in.write(audio_data)
            input_path = tmp_in.name
        
        output_path = input_path.replace('.mp3', '_fx.mp3')
        filters = []
        
        # Reverb using aecho (simulated reverb)
        reverb = effects.get("reverb", 0)
        if reverb > 0:
            # aecho: in_gain|out_gain|delays|decays
            delay = int(50 + reverb * 100)  # 50-150ms
            decay = 0.3 + reverb * 0.4  # 0.3-0.7
            filters.append(f'aecho=0.8:0.9:{delay}:{decay}')
        
        # Echo
        echo = effects.get("echo", 0)
        if echo > 0:
            delay = int(200 + echo * 400)  # 200-600ms
            decay = 0.3 + echo * 0.3  # 0.3-0.6
            filters.append(f'aecho=0.8:0.7:{delay}:{decay}')
        
        # Noise reduction (highpass + lowpass)
        if effects.get("noise_reduction"):
            filters.append('highpass=f=80')
            filters.append('lowpass=f=12000')
            filters.append('afftdn=nf=-20')  # FFT-based denoise
        
        if filters:
            filter_str = ','.join(filters)
            cmd = ['ffmpeg', '-y', '-i', input_path, '-filter:a', filter_str, '-q:a', '2', output_path]
            result = subprocess.run(cmd, capture_output=True)
            
            if result.returncode != 0:
                # Try simpler filter if afftdn fails
                filters = [f for f in filters if 'afftdn' not in f]
                if filters:
                    filter_str = ','.join(filters)
                    cmd = ['ffmpeg', '-y', '-i', input_path, '-filter:a', filter_str, '-q:a', '2', output_path]
                    subprocess.run(cmd, capture_output=True, check=True)
                else:
                    shutil.copy(input_path, output_path)
        else:
            shutil.copy(input_path, output_path)
        
        with open(output_path, 'rb') as f:
            result_data = f.read()
        
        os.unlink(input_path)
        os.unlink(output_path)
        
        return result_data
    except Exception as e:
        logger.warning(f"MP3 effects failed: {e}")
        return audio_data


def apply_audio_effects_wav_full(audio_data: bytes, effects: dict) -> bytes:
    """Apply audio effects to WAV using ffmpeg"""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp_in:
            tmp_in.write(audio_data)
            input_path = tmp_in.name
        
        output_path = input_path.replace('.wav', '_fx.wav')
        filters = []
        
        # Reverb
        reverb = effects.get("reverb", 0)
        if reverb > 0:
            delay = int(50 + reverb * 100)
            decay = 0.3 + reverb * 0.4
            filters.append(f'aecho=0.8:0.9:{delay}:{decay}')
        
        # Echo
        echo = effects.get("echo", 0)
        if echo > 0:
            delay = int(200 + echo * 400)
            decay = 0.3 + echo * 0.3
            filters.append(f'aecho=0.8:0.7:{delay}:{decay}')
        
        # Noise reduction
        if effects.get("noise_reduction"):
            filters.append('highpass=f=80')
            filters.append('lowpass=f=12000')
        
        if filters:
            filter_str = ','.join(filters)
            cmd = ['ffmpeg', '-y', '-i', input_path, '-filter:a', filter_str, output_path]
            subprocess.run(cmd, capture_output=True, check=True)
        else:
            shutil.copy(input_path, output_path)
        
        with open(output_path, 'rb') as f:
            result_data = f.read()
        
        os.unlink(input_path)
        os.unlink(output_path)
        
        return result_data
    except Exception as e:
        logger.warning(f"WAV effects failed: {e}")
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
        
        # Create voice ID
    safe_name = ''.join(c for c in name.lower().replace(' ', '_') if c.isalnum() or c == '_')
    voice_id = f"clone_{safe_name}_{hashlib.md5(name.encode()).hexdigest()[:6]}"
    
        voice_dir = VOICES_DIR / voice_id
        voice_dir.mkdir(parents=True, exist_ok=True)
        
        saved_files = []
        try:
            for i, file in enumerate(files):
            filename = file.filename or f"audio_{i}"
                content_type = file.content_type or ""
            
            valid_ext = ('.wav', '.mp3', '.ogg', '.flac', '.m4a', '.webm', '.opus')
            if not (content_type.startswith('audio/') or filename.lower().endswith(valid_ext)):
                raise HTTPException(status_code=400, detail=f"Invalid file: {filename}")
            
            content = await file.read()
            if len(content) < 1000:
                raise HTTPException(status_code=400, detail=f"File too small: {filename}")
            
            suffix = Path(filename).suffix or '.wav'
                file_path = voice_dir / f"sample_{i}{suffix}"
                
                with open(file_path, 'wb') as f:
                f.write(content)
            
            # Convert to WAV for XTTS compatibility
            wav_path = await convert_to_wav(str(file_path))
            saved_files.append(wav_path or str(file_path))
            
            logger.info(f"   Saved: {file_path} ({len(content)} bytes)")
        
        # Save metadata
        metadata = {
                "voice_id": voice_id,
                "name": name,
                "description": description,
                "sample_files": saved_files,
            "created_at": datetime.datetime.now().isoformat(),
            "real_clone": HAS_XTTS
            }
            
            with open(VOICES_DIR / f"{voice_id}.json", 'w') as f:
            json.dump(metadata, f, indent=2)
            
        logger.info(f"✅ Cloned: {name} ({voice_id})")
            
            return {
                "success": True,
                "voice_id": voice_id,
                "name": name,
                "samples_count": len(saved_files),
            "real_clone": HAS_XTTS,
            "message": f"Voice '{name}' cloned!"
            }
            
        except HTTPException:
            shutil.rmtree(voice_dir, ignore_errors=True)
            raise
        except Exception as e:
            shutil.rmtree(voice_dir, ignore_errors=True)
        logger.error(f"❌ Clone error: {e}")
            raise HTTPException(status_code=500, detail=str(e))
                    

async def convert_to_wav(input_path: str) -> Optional[str]:
    """Convert audio to WAV format"""
    try:
        wav_path = input_path.rsplit('.', 1)[0] + '.wav'
        cmd = ['ffmpeg', '-y', '-i', input_path, '-ar', '22050', '-ac', '1', wav_path]
        result = subprocess.run(cmd, capture_output=True)
        if result.returncode == 0:
            return wav_path
    except:
        pass
    return None


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
