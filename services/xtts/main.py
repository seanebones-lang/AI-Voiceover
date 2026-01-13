"""
XTTS-v2 Voice Cloning Sidecar Service
FastAPI service for handling voice cloning with Coqui XTTS-v2
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import uvicorn
import os
import tempfile
import shutil
from pathlib import Path
import asyncio
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="XTTS Voice Cloning Service", version="1.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global model cache
xtts_model = None
xtts_processor = None


class CloneRequest(BaseModel):
    name: str
    description: Optional[str] = None


class TTSRequest(BaseModel):
    text: str
    speaker_embedding: str  # Base64 encoded embedding
    language: str = "en"


async def load_xtts_model():
    """Load XTTS-v2 model (lazy loading)"""
    global xtts_model, xtts_processor
    
    if xtts_model is not None:
        return
    
    try:
        logger.info("Loading XTTS-v2 model...")
        
        # Import TTS - this will download model on first run
        from TTS.api import TTS
        
        # Initialize XTTS-v2
        tts = TTS(model_name="tts_models/multilingual/multi-dataset/xtts_v2", progress_bar=True)
        
        xtts_model = tts
        logger.info("✓ XTTS-v2 model loaded successfully")
        
    except Exception as e:
        logger.error(f"Failed to load XTTS model: {e}")
        raise


@app.on_event("startup")
async def startup_event():
    """Load model on startup"""
    # Don't load on startup to speed up container start
    # Load on first request instead
    logger.info("XTTS sidecar service started")


@app.get("/health")
async def health_check():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "model_loaded": xtts_model is not None
    }


@app.post("/clone")
async def clone_voice(
    name: str,
    description: Optional[str] = None,
    files: List[UploadFile] = File(...)
):
    """
    Clone a voice from reference audio files
    
    Args:
        name: Name for the cloned voice
        description: Optional description
        files: 1-5 audio files (WAV, MP3, etc.)
    
    Returns:
        Speaker embedding and metadata
    """
    try:
        # Ensure model is loaded
        await load_xtts_model()
        
        if not files or len(files) == 0:
            raise HTTPException(status_code=400, detail="At least one audio file required")
        
        if len(files) > 5:
            raise HTTPException(status_code=400, detail="Maximum 5 files allowed")
        
        # Save uploaded files temporarily
        temp_files = []
        try:
            for file in files:
                # Validate file type
                if not file.content_type.startswith('audio/'):
                    raise HTTPException(status_code=400, detail=f"Invalid file type: {file.content_type}")
                
                # Save to temp file
                suffix = Path(file.filename).suffix
                temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=suffix)
                shutil.copyfileobj(file.file, temp_file)
                temp_file.close()
                temp_files.append(temp_file.name)
            
            # Extract speaker embedding using XTTS
            logger.info(f"Extracting speaker embedding from {len(temp_files)} files...")
            
            # Use first file for embedding (XTTS can use multiple)
            speaker_embedding = xtts_model.get_conditioning_latents(
                audio_path=temp_files[0]
            )
            
            # Convert embedding to base64 for storage
            import base64
            import numpy as np
            
            embedding_bytes = speaker_embedding.numpy().tobytes()
            embedding_b64 = base64.b64encode(embedding_bytes).decode('utf-8')
            
            logger.info(f"✓ Voice cloned: {name}")
            
            return {
                "success": True,
                "voice_id": f"xtts_{name.lower().replace(' ', '_')}",
                "speaker_embedding": embedding_b64,
                "name": name,
                "description": description,
                "message": "Voice cloned successfully"
            }
            
        finally:
            # Cleanup temp files
            for temp_file in temp_files:
                try:
                    os.unlink(temp_file)
                except:
                    pass
                    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Voice cloning error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to clone voice: {str(e)}")


@app.post("/tts")
async def generate_speech(request: TTSRequest):
    """
    Generate speech using cloned voice
    
    Args:
        request: TTS request with text and speaker embedding
    
    Returns:
        Audio stream (WAV)
    """
    try:
        await load_xtts_model()
        
        # Decode speaker embedding
        import base64
        import numpy as np
        import torch
        
        embedding_bytes = base64.b64decode(request.speaker_embedding)
        speaker_embedding = torch.from_numpy(
            np.frombuffer(embedding_bytes, dtype=np.float32).reshape(1, -1)
        )
        
        # Generate speech
        logger.info(f"Generating speech: {request.text[:50]}...")
        
        # Create temp file for output
        output_file = tempfile.NamedTemporaryFile(delete=False, suffix='.wav')
        output_file.close()
        
        # Generate audio
        xtts_model.tts_to_file(
            text=request.text,
            speaker_wav=None,  # Use embedding instead
            language=request.language,
            file_path=output_file.name,
            speaker_embedding=speaker_embedding
        )
        
        # Stream audio file
        def generate():
            try:
                with open(output_file.name, 'rb') as f:
                    while True:
                        chunk = f.read(8192)
                        if not chunk:
                            break
                        yield chunk
            finally:
                os.unlink(output_file.name)
        
        return StreamingResponse(
            generate(),
            media_type="audio/wav",
            headers={
                "Content-Disposition": f'attachment; filename="cloned_voice.wav"'
            }
        )
        
    except Exception as e:
        logger.error(f"TTS generation error: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate speech: {str(e)}")


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
