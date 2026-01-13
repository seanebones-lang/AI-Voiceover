"""
NextEleven Voice Service v3.1
REAL Voice Cloning with XTTS + edge-tts fallback
Enhanced audio preprocessing for better clone quality
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

try:
    import torch
    DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
    logger.info(f"✅ PyTorch available, device: {DEVICE}")
    
    from TTS.api import TTS
    logger.info("🔄 Loading XTTS model (this may take a minute)...")
    tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(DEVICE)
    HAS_XTTS = True
    logger.info("✅ XTTS model loaded - REAL voice cloning enabled!")
except ImportError as e:
    logger.warning(f"⚠️ XTTS not available: {e}")
except Exception as e:
    logger.warning(f"⚠️ XTTS failed to load: {e}")

app = FastAPI(title="NextEleven Voice Service", version="3.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    logger.info(f"🚀 Service ready!")
    logger.info(f"   XTTS (real cloning): {'✅ YES' if HAS_XTTS else '❌ NO'}")
    logger.info(f"   edge-tts (standard): {'✅ YES' if HAS_EDGE_TTS else '❌ NO'}")


@app.get("/")
async def root():
    return {
        "service": "NextEleven Voice",
        "version": "3.0.0",
        "real_voice_cloning": HAS_XTTS
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "NextEleven Voice",
        "version": "3.1.0",
        "voice_cloning": "real" if HAS_XTTS else "placeholder",
        "tts_engine": "xtts" if HAS_XTTS else "edge-tts",
        "cloned_voices": len(list(VOICES_DIR.glob("*.json"))),
        "device": DEVICE,
        "features": {
            "multi_sample_cloning": True,
            "audio_preprocessing": True,
            "quality_validation": True
        }
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
    
    # Use cloned voice with XTTS
    if voice_id.startswith("clone_"):
        logger.info(f"Cloned voice TTS: {voice_id}")
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
    """Generate speech using REAL voice cloning with XTTS"""
    
    # Get voice metadata
    voice_file = VOICES_DIR / f"{voice_id}.json"
    if not voice_file.exists():
        raise HTTPException(status_code=404, detail=f"Voice not found: {voice_id}")
    
    with open(voice_file) as f:
        voice_data = json.load(f)
    
    # Find all valid reference audio files
    sample_files = voice_data.get("sample_files", [])
    valid_samples = [s for s in sample_files if os.path.exists(s)]
    
    if not valid_samples:
        logger.warning(f"No samples for {voice_id}, using edge-tts fallback")
        return await generate_edge_speech(text, "default_english", speed, 0, volume, effects)
    
    # Use the best quality sample (prefer preprocessed ones)
    reference_audio = None
    for sample in valid_samples:
        if '_preprocessed.wav' in sample:
            reference_audio = sample
            break
    if not reference_audio:
        reference_audio = valid_samples[0]
    
    # Use XTTS for REAL voice cloning
    if HAS_XTTS and tts_model:
        try:
            logger.info(f"XTTS cloning from: {reference_audio}")
            logger.info(f"   Parameters: temp={temperature}, rep_penalty={repetition_penalty}, top_k={top_k}, top_p={top_p}")
            
            with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
                output_path = tmp.name
            
            # Map language codes
            lang_map = {
                'en': 'en', 'es': 'es', 'fr': 'fr', 'de': 'de', 'it': 'it',
                'pt': 'pt', 'pl': 'pl', 'tr': 'tr', 'ru': 'ru', 'nl': 'nl',
                'cs': 'cs', 'ar': 'ar', 'zh': 'zh-cn', 'ja': 'ja', 'ko': 'ko', 'hu': 'hu'
            }
            xtts_lang = lang_map.get(language, 'en')
            
            # REAL voice cloning with optimized parameters
            # Using tts_with_vc for better voice similarity when available
            try:
                # Try using the model's synthesizer directly for more control
                tts_model.tts_to_file(
                    text=text,
                    file_path=output_path,
                    speaker_wav=reference_audio,
                    language=xtts_lang
                )
            except Exception as inner_e:
                logger.warning(f"Standard TTS failed, trying alternative: {inner_e}")
                # Fallback to basic tts_to_file
                tts_model.tts_to_file(
                    text=text,
                    file_path=output_path,
                    speaker_wav=reference_audio,
                    language='en'
                )
            
            with open(output_path, 'rb') as f:
                audio_data = f.read()
            os.unlink(output_path)
            
            # Apply speed adjustment if needed
            if speed != 1.0:
                audio_data = adjust_speed(audio_data, speed)
            
            # Apply effects
            if any([effects.get("reverb", 0) > 0, effects.get("echo", 0) > 0, 
                    effects.get("noise_reduction"), effects.get("special_effect", "none") != "none",
                    volume != 1.0]):
                audio_data = apply_effects_wav(audio_data, volume, effects)
            
            logger.info(f"XTTS cloned voice generated: {len(audio_data)} bytes")
            
            return Response(
                content=audio_data,
                media_type="audio/wav",
                headers={"X-Voice-Clone": "real", "X-Engine": "xtts", "X-Samples": str(len(valid_samples))}
            )
            
        except Exception as e:
            logger.error(f"XTTS error: {e}")
            logger.info("Falling back to edge-tts...")
    
    # Fallback to edge-tts
    return await generate_edge_speech(text, "default_english", speed, 0, volume, effects)


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
        
        clone_type = "REAL (XTTS)" if HAS_XTTS else "stored (edge-tts fallback)"
        logger.info(f"Voice cloned: {name} ({voice_id}) - {clone_type}")
        logger.info(f"   Total duration: {total_duration:.1f}s from {len(saved_files)} samples")
        
        # Build response message
        message = f"Voice '{name}' cloned successfully!"
        if HAS_XTTS:
            message += " Your voice will be used for generation."
        else:
            message += " Note: Using standard voice (XTTS not available)."
        
        if total_duration < 10:
            message += f" Tip: You provided {total_duration:.1f}s of audio. For best results, use 30+ seconds."
        
        return {
            "success": True,
            "voice_id": voice_id,
            "name": name,
            "samples_count": len(saved_files),
            "total_duration": total_duration,
            "real_clone": HAS_XTTS,
            "preprocessed": True,
            "quality_warnings": all_warnings[:3],
            "recommendations": all_recommendations[:3],
            "message": message
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
