"""
NextEleven Voice Service
Fast TTS using edge-tts (Microsoft Edge TTS)
Voice cloning via local file storage
"""

from fastapi import FastAPI, File, UploadFile, HTTPException, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import tempfile
import shutil
from pathlib import Path
import logging
import json
import asyncio

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="NextEleven Voice Service", version="2.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage for cloned voices
VOICES_DIR = Path("/app/cloned_voices")
VOICES_DIR.mkdir(parents=True, exist_ok=True)

# Edge TTS voice mapping
EDGE_VOICES = {
    "default_english": "en-US-GuyNeural",
    "default_spanish": "es-ES-AlvaroNeural",
    "default_french": "fr-FR-HenriNeural",
    "default_german": "de-DE-ConradNeural",
    "default_portuguese": "pt-BR-AntonioNeural",
    "female_english": "en-US-JennyNeural",
    "female_british": "en-GB-SoniaNeural",
    "male_british": "en-GB-RyanNeural",
}


class TTSRequest(BaseModel):
    text: str
    voice_id: str
    language: str = "en"


@app.on_event("startup")
async def startup_event():
    """Initialize on startup"""
    logger.info("NextEleven Voice Service started")
    VOICES_DIR.mkdir(parents=True, exist_ok=True)


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "NextEleven Voice",
        "tts_engine": "edge-tts",
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


@app.post("/tts")
async def generate_speech(request: TTSRequest):
    """
    Generate speech using edge-tts
    
    - voice_id: Standard voice or cloned voice ID
    - text: Text to speak
    - language: Language code
    """
    try:
        import edge_tts
        
        text = request.text
        voice_id = request.voice_id
        
        # Determine the edge-tts voice to use
        if voice_id.startswith("clone_"):
            # For cloned voices, use a similar sounding edge voice
            # TODO: Implement proper voice cloning playback
            edge_voice = "en-US-GuyNeural"
            logger.info(f"Cloned voice requested: {voice_id}, using placeholder")
        else:
            # Map to edge-tts voice
            edge_voice = EDGE_VOICES.get(voice_id, "en-US-GuyNeural")
        
        logger.info(f"Generating TTS: voice={edge_voice}, text='{text[:50]}...'")
        
        # Create temp file for output
        output_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
        output_path = output_file.name
        output_file.close()
        
        try:
            # Generate audio using edge-tts
            communicate = edge_tts.Communicate(text, edge_voice)
            await communicate.save(output_path)
            
            logger.info(f"✓ TTS generated successfully")
            
            # Return audio file
            return FileResponse(
                output_path,
                media_type="audio/mpeg",
                filename=f"nexteleven_output.mp3"
            )
            
        except Exception as e:
            if os.path.exists(output_path):
                os.unlink(output_path)
            logger.error(f"TTS generation error: {str(e)}")
            raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")
        
    except ImportError:
        raise HTTPException(status_code=500, detail="edge-tts not installed")
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate speech: {str(e)}")


@app.post("/clone")
async def clone_voice(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    """
    Clone a voice from reference audio files
    
    - Upload 1-5 audio files (WAV, MP3, etc.)
    - Stores the audio samples for later playback reference
    """
    try:
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
                if not (content_type.startswith('audio/') or 
                        file.filename.endswith(('.wav', '.mp3', '.ogg', '.flac', '.m4a', '.webm'))):
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
                "created_at": datetime.datetime.now().isoformat()
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
                "message": f"Voice '{name}' saved successfully! Use voice_id '{voice_id}' for reference."
            }
            
        except HTTPException:
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


@app.get("/edge-voices")
async def list_edge_voices():
    """List available edge-tts voices"""
    try:
        import edge_tts
        voices = await edge_tts.list_voices()
        return {"voices": voices}
    except Exception as e:
        return {"error": str(e), "voices": []}


if __name__ == "__main__":
    port = int(os.getenv("XTTS_PORT", 8081))
    uvicorn.run(app, host="0.0.0.0", port=port)
