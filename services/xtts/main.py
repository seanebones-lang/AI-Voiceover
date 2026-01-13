"""
NextEleven Voice Service
Production-ready TTS using edge-tts (Microsoft Edge TTS)
Voice cloning via local file storage
"""

import sys
import os
import traceback

# Set up logging FIRST before any other imports
import logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

logger.info("=" * 50)
logger.info("NextEleven Voice Service Starting...")
logger.info("=" * 50)

# Now import everything else with error handling
try:
    from fastapi import FastAPI, File, UploadFile, HTTPException, Form
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import FileResponse, Response
    from pydantic import BaseModel
    from typing import List, Optional
    import uvicorn
    import tempfile
    import shutil
    from pathlib import Path
    import json
    import asyncio
    import datetime
    logger.info("✅ Core imports successful")
except ImportError as e:
    logger.error(f"❌ Failed to import core dependencies: {e}")
    logger.error(traceback.format_exc())
    sys.exit(1)

# Test edge-tts import
try:
    import edge_tts
    logger.info("✅ edge-tts imported successfully")
except ImportError as e:
    logger.error(f"❌ Failed to import edge-tts: {e}")
    logger.error("Please install: pip install edge-tts")
    sys.exit(1)

# Initialize FastAPI
app = FastAPI(
    title="NextEleven Voice Service",
    version="2.0.0",
    description="Production TTS with edge-tts and voice cloning"
)

# CORS middleware - allow all for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Storage for cloned voices
VOICES_DIR = Path(os.getenv("VOICES_DIR", "/app/cloned_voices"))
VOICES_DIR.mkdir(parents=True, exist_ok=True)
logger.info(f"📁 Voices directory: {VOICES_DIR}")

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
    """Initialize on startup"""
    logger.info("🚀 FastAPI application starting...")
    VOICES_DIR.mkdir(parents=True, exist_ok=True)
    
    # Test edge-tts connectivity
    try:
        voices = await edge_tts.list_voices()
        logger.info(f"✅ edge-tts connected! Found {len(voices)} voices")
    except Exception as e:
        logger.warning(f"⚠️ edge-tts connectivity test failed: {e}")
        logger.warning("TTS may not work if Microsoft servers are unreachable")
    
    logger.info("✅ NextEleven Voice Service ready!")


@app.get("/")
async def root():
    """Root endpoint"""
    return {"service": "NextEleven Voice", "status": "running", "version": "2.0.0"}


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    cloned_count = len(list(VOICES_DIR.glob("*.json")))
    return {
        "status": "healthy",
        "service": "NextEleven Voice",
        "tts_engine": "edge-tts",
        "cloned_voices": cloned_count,
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
                    "source": "cloned"
                })
        except Exception as e:
            logger.error(f"Error reading voice file {voice_file}: {e}")
    
    return {"voices": voices}


@app.post("/tts")
async def generate_speech(request: TTSRequest):
    """
    Generate speech using edge-tts
    """
    text = request.text.strip()
    voice_id = request.voice_id
    
    if not text:
        raise HTTPException(status_code=400, detail="Text is required")
    
    if len(text) > 5000:
        raise HTTPException(status_code=400, detail="Text must be 5000 characters or less")
    
    # Determine the edge-tts voice to use
    if voice_id.startswith("clone_"):
        # For cloned voices, use a similar sounding edge voice for now
        # Real voice cloning would require XTTS/Coqui models
        edge_voice = "en-US-GuyNeural"
        logger.info(f"📢 Cloned voice requested: {voice_id}, using edge voice as placeholder")
    else:
        edge_voice = EDGE_VOICES.get(voice_id, "en-US-GuyNeural")
    
    logger.info(f"🎤 Generating TTS: voice={edge_voice}, text='{text[:50]}...'")
    
    # Create temp file for output
    temp_file = None
    try:
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix='.mp3')
        output_path = temp_file.name
        temp_file.close()
        
        # Generate audio using edge-tts
        communicate = edge_tts.Communicate(text, edge_voice)
        await communicate.save(output_path)
        
        # Read the file and return as response
        with open(output_path, 'rb') as f:
            audio_data = f.read()
        
        logger.info(f"✅ TTS generated: {len(audio_data)} bytes")
        
        return Response(
            content=audio_data,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f'attachment; filename="nexteleven_{datetime.datetime.now().strftime("%Y%m%d_%H%M%S")}.mp3"'
            }
        )
        
    except Exception as e:
        logger.error(f"❌ TTS generation error: {e}")
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"TTS generation failed: {str(e)}")
    
    finally:
        # Clean up temp file
        if temp_file and os.path.exists(output_path):
            try:
                os.unlink(output_path)
            except:
                pass


@app.post("/clone")
async def clone_voice(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    """
    Clone a voice from reference audio files
    """
    logger.info(f"🎙️ Voice clone request: name={name}, files={len(files)}")
    
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="At least one audio file required")
    
    if len(files) > 5:
        raise HTTPException(status_code=400, detail="Maximum 5 files allowed")
    
    if not name or len(name.strip()) == 0:
        raise HTTPException(status_code=400, detail="Voice name is required")
    
    # Create voice ID
    safe_name = name.lower().replace(' ', '_').replace('-', '_')
    safe_name = ''.join(c for c in safe_name if c.isalnum() or c == '_')
    voice_id = f"clone_{safe_name}"
    
    voice_dir = VOICES_DIR / voice_id
    voice_dir.mkdir(parents=True, exist_ok=True)
    
    saved_files = []
    try:
        for i, file in enumerate(files):
            # Validate file type
            content_type = file.content_type or ""
            filename = file.filename or f"audio_{i}"
            
            if not (content_type.startswith('audio/') or 
                    filename.endswith(('.wav', '.mp3', '.ogg', '.flac', '.m4a', '.webm'))):
                raise HTTPException(status_code=400, detail=f"Invalid file type: {filename}")
            
            # Save file
            suffix = Path(filename).suffix or '.wav'
            file_path = voice_dir / f"sample_{i}{suffix}"
            
            with open(file_path, 'wb') as f:
                content = await file.read()
                f.write(content)
            saved_files.append(str(file_path))
            logger.info(f"  Saved: {file_path}")
        
        # Save voice metadata
        voice_metadata = {
            "voice_id": voice_id,
            "name": name,
            "description": description,
            "sample_files": saved_files,
            "created_at": datetime.datetime.now().isoformat()
        }
        
        metadata_path = VOICES_DIR / f"{voice_id}.json"
        with open(metadata_path, 'w') as f:
            json.dump(voice_metadata, f, indent=2)
        
        logger.info(f"✅ Voice cloned: {name} ({voice_id}) with {len(saved_files)} samples")
        
        return {
            "success": True,
            "voice_id": voice_id,
            "name": name,
            "description": description,
            "samples_count": len(saved_files),
            "message": f"Voice '{name}' saved successfully!"
        }
        
    except HTTPException:
        shutil.rmtree(voice_dir, ignore_errors=True)
        raise
    except Exception as e:
        shutil.rmtree(voice_dir, ignore_errors=True)
        logger.error(f"❌ Voice cloning error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


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


@app.get("/edge-voices")
async def list_edge_voices():
    """List available edge-tts voices"""
    try:
        voices = await edge_tts.list_voices()
        return {"voices": voices, "count": len(voices)}
    except Exception as e:
        logger.error(f"Failed to list edge voices: {e}")
        return {"error": str(e), "voices": []}


if __name__ == "__main__":
    port = int(os.getenv("XTTS_PORT", "8081"))
    host = os.getenv("XTTS_HOST", "0.0.0.0")
    
    logger.info(f"🌐 Starting server on {host}:{port}")
    
    uvicorn.run(
        app,
        host=host,
        port=port,
        log_level="info",
        access_log=True
    )
