"""
Voice Cloning Sidecar Service
FastAPI service for handling voice cloning with Coqui TTS
Supports XTTS-v2 (GPU) and YourTTS (CPU-friendly)
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import tempfile
import shutil
from pathlib import Path
import logging
import json

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Voice Cloning Service", version="2.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model cache
tts_model = None
model_type = None  # 'xtts' or 'yourtts'

# Storage for cloned voices
VOICES_DIR = Path("/app/cloned_voices")
VOICES_DIR.mkdir(parents=True, exist_ok=True)


class TTSRequest(BaseModel):
    text: str
    voice_id: str
    language: str = "en"


def get_model_type():
    """Determine which model to use based on available resources"""
    import torch
    if torch.cuda.is_available():
        return "xtts"  # Use XTTS-v2 with GPU
    else:
        return "yourtts"  # Use YourTTS for CPU (faster)


async def load_tts_model():
    """Load TTS model (lazy loading)"""
    global tts_model, model_type
    
    if tts_model is not None:
        return
    
    try:
        from TTS.api import TTS
        import torch
        
        model_type = get_model_type()
        device = "cuda" if torch.cuda.is_available() else "cpu"
        
        if model_type == "xtts":
            logger.info("Loading XTTS-v2 model (GPU detected)...")
            tts_model = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device)
        else:
            logger.info("Loading YourTTS model (CPU mode)...")
            # YourTTS is faster on CPU and still supports voice cloning
            tts_model = TTS("tts_models/multilingual/multi-dataset/your_tts").to(device)
        
        logger.info(f"✓ {model_type.upper()} model loaded on {device}")
        
    except Exception as e:
        logger.error(f"Failed to load TTS model: {e}")
        raise


@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    logger.info("Voice Cloning service started")
    VOICES_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    import torch
    return {
        "status": "healthy",
        "model_loaded": tts_model is not None,
        "model_type": model_type,
        "gpu_available": torch.cuda.is_available(),
        "cloned_voices": len(list(VOICES_DIR.glob("*.json")))
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
                    "source": "cloned"
                })
        except Exception as e:
            logger.error(f"Error reading voice file {voice_file}: {e}")
    
    return {"voices": voices}


@app.post("/clone")
async def clone_voice(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    """
    Clone a voice from reference audio files
    
    - Upload 1-5 audio files (WAV, MP3, etc.)
    - At least 6 seconds of clear speech recommended
    - Returns a voice_id to use for TTS
    """
    try:
        await load_tts_model()
        
        if not files or len(files) == 0:
            raise HTTPException(status_code=400, detail="At least one audio file required")
        
        if len(files) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 files allowed")
        
        # Create voice ID
        voice_id = f"clone_{name.lower().replace(' ', '_').replace('-', '_')}"
        voice_dir = VOICES_DIR / voice_id
        voice_dir.mkdir(parents=True, exist_ok=True)
        
        # Save uploaded files
        saved_files = []
        try:
            for i, file in enumerate(files):
                # Validate file type
                content_type = file.content_type or ""
                if not (content_type.startswith('audio/') or file.filename.endswith(('.wav', '.mp3', '.ogg', '.flac', '.m4a'))):
                    raise HTTPException(status_code=400, detail=f"Invalid file type: {file.filename}")
                
                # Save file
                suffix = Path(file.filename).suffix or '.wav'
                file_path = voice_dir / f"sample_{i}{suffix}"
                
                with open(file_path, 'wb') as f:
                    shutil.copyfileobj(file.file, f)
                saved_files.append(str(file_path))
            
            # Save voice metadata
            import datetime
            voice_metadata = {
                "voice_id": voice_id,
                "name": name,
                "description": description,
                "sample_files": saved_files,
                "created_at": datetime.datetime.now().isoformat(),
                "model_type": model_type
            }
            
            with open(VOICES_DIR / f"{voice_id}.json", 'w') as f:
                json.dump(voice_metadata, f, indent=2)
            
            logger.info(f"✓ Voice cloned: {name} ({voice_id}) with {len(saved_files)} samples")
            
            return {
                "success": True,
                "voice_id": voice_id,
                "name": name,
                "description": description,
                "samples_count": len(saved_files),
                "message": f"Voice '{name}' cloned successfully! Use voice_id '{voice_id}' for TTS."
            }
            
        except HTTPException:
            # Cleanup on error
            shutil.rmtree(voice_dir, ignore_errors=True)
            raise
        except Exception as e:
            shutil.rmtree(voice_dir, ignore_errors=True)
            raise HTTPException(status_code=500, detail=str(e))
                    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice cloning error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clone voice: {str(e)}")


@app.post("/tts")
async def generate_speech(request: TTSRequest):
    """
    Generate speech using a cloned voice OR a built-in voice
    
    - voice_id: The ID returned from /clone OR a built-in voice ID
    - text: Text to speak
    - language: Language code (en, es, fr, de, etc.)
    """
    try:
        await load_tts_model()
        
        # Check if this is a cloned voice
        voice_file = VOICES_DIR / f"{request.voice_id}.json"
        speaker_wav = None
        
        if voice_file.exists():
            # Use cloned voice
            with open(voice_file) as f:
                voice_data = json.load(f)
            
            sample_files = voice_data.get("sample_files", [])
            if sample_files:
                speaker_wav = sample_files[0]
                if not os.path.exists(speaker_wav):
                    speaker_wav = None
        
        # Determine language from voice_id if it's a default voice
        language = request.language
        if request.voice_id.startswith("default_"):
            lang_map = {
                "default_english": "en",
                "default_spanish": "es",
                "default_french": "fr",
                "default_german": "de",
                "default_portuguese": "pt"
            }
            language = lang_map.get(request.voice_id, "en")
        
        logger.info(f"Generating speech with voice '{request.voice_id}' (lang={language}): {request.text[:50]}...")
        
        # Create temp file for output
        output_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
        output_path = output_file.name
        output_file.close()
        
        try:
            # Try with speaker_wav if available, otherwise use default voice
            if speaker_wav:
                logger.info(f"Using cloned voice from: {speaker_wav}")
                tts_model.tts_to_file(
                    text=request.text,
                    speaker_wav=speaker_wav,
                    language=language,
                    file_path=output_path
                )
            else:
                logger.info(f"Using default voice for language: {language}")
                # For YourTTS, we can generate without speaker_wav
                # This will use the model's default speaker
                tts_model.tts_to_file(
                    text=request.text,
                    language=language,
                    file_path=output_path
                )
            
            logger.info(f"✓ Generated speech for voice '{request.voice_id}'")
            
            # Return audio file
            return FileResponse(
                output_path,
                media_type="audio/wav",
                filename=f"{request.voice_id}_output.wav",
                background=None  # Don't delete immediately
            )
            
        except Exception as e:
            if os.path.exists(output_path):
                os.unlink(output_path)
            logger.error(f"TTS generation error details: {str(e)}")
            raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate speech: {str(e)}")


@app.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    """Delete a cloned voice"""
    voice_file = VOICES_DIR / f"{voice_id}.json"
    voice_dir = VOICES_DIR / voice_id
    
    if not voice_file.exists():
        raise HTTPException(status_code=404, detail=f"Voice not found: {voice_id}")
    
    # Delete voice directory and metadata
    shutil.rmtree(voice_dir, ignore_errors=True)
    voice_file.unlink(missing_ok=True)
    
    logger.info(f"✓ Deleted voice: {voice_id}")
    
    return {"success": True, "message": f"Voice '{voice_id}' deleted"}


@app.post("/tts/direct")
async def generate_speech_direct(
    text: str = Form(...),
    speaker_wav: UploadFile = File(...),
    language: str = Form("en")
):
    """
    Generate speech directly from an uploaded audio sample
    (No need to clone first - one-shot voice cloning)
    """
    try:
        await load_tts_model()
        
        # Save uploaded speaker file temporarily
        suffix = Path(speaker_wav.filename).suffix or '.wav'
        temp_speaker = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
        shutil.copyfileobj(speaker_wav.file, temp_speaker)
        temp_speaker.close()
        
        # Create temp file for output
        output_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
        output_path = output_file.name
        output_file.close()
        
        try:
            logger.info(f"Direct TTS generation: {text[:50]}...")
            
            # Generate audio
            tts_model.tts_to_file(
                text=text,
                speaker_wav=temp_speaker.name,
                language=language,
                file_path=output_path
            )
            
            logger.info("✓ Direct TTS generation complete")
            
            return FileResponse(
                output_path,
                media_type="audio/wav",
                filename="cloned_output.wav"
            )
            
        finally:
            # Cleanup temp speaker file
            os.unlink(temp_speaker.name)
            
    except Exception as e:
        logger.error(f"Direct TTS error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate speech: {str(e)}")


if __name__ == "__main__":
    port = int(os.getenv("XTTS_PORT", 8081))
    uvicorn.run(app, host="0.0.0.0", port=port)
