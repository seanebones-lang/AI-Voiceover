"""
HumanMirage TTS - Production Server
FastAPI + WebSocket streaming server
"""

import asyncio
import json
import os
import tempfile
import struct
from pathlib import Path
from typing import Optional, List
from datetime import datetime
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, FileResponse
from pydantic import BaseModel, Field
import numpy as np

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="HumanMirage TTS",
    description="Production Text-to-Speech with Voice Cloning",
    version="3.0.0"
)

# CORS: set CORS_ORIGINS in production to restrict origins
_cors_origins = os.getenv("CORS_ORIGINS", "*").strip()
_cors_origins_list = [o.strip() for o in _cors_origins.split(",")] if _cors_origins else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Lazy load TTS engine
_engine = None

def get_engine():
    global _engine
    if _engine is None:
        from .pipeline import HumanMirageTTS
        _engine = HumanMirageTTS()
    return _engine


# Request/Response models
class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    voice_id: Optional[str] = None
    emotion: str = "neutral"
    language: str = "en"
    speed: float = 1.0
    format: str = "wav"  # wav, mp3, pcm


class VoiceInfo(BaseModel):
    voice_id: str
    name: str
    description: Optional[str] = None
    source: str
    language: Optional[str] = None
    created_at: Optional[str] = None


class CloneResponse(BaseModel):
    success: bool
    voice_id: str
    name: str
    message: str


# Startup event
@app.on_event("startup")
async def startup():
    logger.info("🚀 HumanMirage TTS Server starting...")
    
    # Pre-load engine in background
    asyncio.create_task(_preload_engine())


async def _preload_engine():
    """Preload TTS engine in background."""
    try:
        get_engine()
        logger.info("✅ TTS Engine ready!")
    except Exception as e:
        logger.error(f"Failed to load TTS engine: {e}")


# Health check
@app.get("/health")
async def health():
    """Health check endpoint."""
    engine_ready = _engine is not None
    
    return {
        "status": "healthy" if engine_ready else "initializing",
        "service": "HumanMirage TTS",
        "version": "3.0.0",
        "engine_ready": engine_ready,
        "timestamp": datetime.now().isoformat()
    }


# List voices
@app.get("/voices", response_model=dict)
async def list_voices():
    """List all available voices."""
    try:
        engine = get_engine()
        voices = engine.list_voices()
        
        return {
            "voices": voices,
            "count": len(voices)
        }
    except Exception as e:
        logger.error(f"Error listing voices: {e}")
        raise HTTPException(500, str(e))


# Text-to-Speech
@app.post("/tts")
async def synthesize(request: TTSRequest):
    """
    Generate speech from text.
    
    Returns WAV audio file.
    """
    try:
        engine = get_engine()
        
        logger.info(f"🎤 TTS request: voice={request.voice_id}, emotion={request.emotion}, text='{request.text[:50]}...'")
        
        # Import emotion enum
        from .pipeline import Emotion
        
        # Synthesize
        audio = await engine.synthesize(
            text=request.text,
            speaker_id=request.voice_id,
            emotion=Emotion(request.emotion),
            language=request.language
        )
        
        # Convert to WAV
        wav_data = create_wav(audio, engine.config.sample_rate)
        
        logger.info(f"✅ Generated {len(audio) / engine.config.sample_rate:.2f}s of audio")
        
        return Response(
            content=wav_data,
            media_type="audio/wav",
            headers={
                "Content-Disposition": f'attachment; filename="tts_{hash(request.text) % 10000}.wav"',
                "X-Audio-Duration": str(len(audio) / engine.config.sample_rate),
                "X-Sample-Rate": str(engine.config.sample_rate)
            }
        )
        
    except Exception as e:
        logger.error(f"TTS error: {e}")
        raise HTTPException(500, f"TTS generation failed: {str(e)}")


# Voice Cloning
@app.post("/clone", response_model=CloneResponse)
async def clone_voice(
    name: str = Form(...),
    description: Optional[str] = Form(None),
    files: List[UploadFile] = File(...)
):
    """
    Clone a voice from reference audio files.
    
    - Upload 1-5 audio files (3-30 seconds each)
    - Supported formats: WAV, MP3, FLAC, OGG
    """
    try:
        if not files:
            raise HTTPException(400, "At least one audio file required")
        
        if len(files) > 5:
            raise HTTPException(400, "Maximum 5 files allowed")
        
        engine = get_engine()
        
        # Save uploaded files temporarily
        temp_dir = Path(tempfile.mkdtemp())
        saved_paths = []
        
        try:
            for i, file in enumerate(files):
                # Validate file type
                if not file.content_type or not file.content_type.startswith('audio/'):
                    # Check extension
                    valid_extensions = {'.wav', '.mp3', '.flac', '.ogg', '.m4a', '.webm'}
                    ext = Path(file.filename or '').suffix.lower()
                    if ext not in valid_extensions:
                        raise HTTPException(400, f"Invalid file type: {file.filename}")
                
                # Save file
                file_path = temp_dir / f"sample_{i}{Path(file.filename or '.wav').suffix}"
                content = await file.read()
                file_path.write_bytes(content)
                saved_paths.append(str(file_path))
                
                logger.info(f"📁 Saved: {file.filename} ({len(content)} bytes)")
            
            # Clone voice
            voice_id = engine.clone_voice(
                name=name,
                audio_files=saved_paths,
                description=description
            )
            
            logger.info(f"✅ Voice cloned: {name} ({voice_id})")
            
            return CloneResponse(
                success=True,
                voice_id=voice_id,
                name=name,
                message=f"Voice '{name}' cloned successfully!"
            )
            
        finally:
            # Cleanup temp files
            import shutil
            shutil.rmtree(temp_dir, ignore_errors=True)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Clone error: {e}")
        raise HTTPException(500, f"Voice cloning failed: {str(e)}")


# Delete voice
@app.delete("/voices/{voice_id}")
async def delete_voice(voice_id: str):
    """Delete a cloned voice."""
    try:
        engine = get_engine()
        
        if engine.speaker_db.delete_speaker(voice_id):
            return {"success": True, "message": f"Voice {voice_id} deleted"}
        else:
            raise HTTPException(404, f"Voice not found: {voice_id}")
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))


# WebSocket streaming
@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """
    WebSocket endpoint for real-time audio streaming.
    
    Protocol:
    1. Client sends JSON: {"text": "...", "voice_id": "...", "emotion": "..."}
    2. Server streams binary PCM chunks (int16, mono)
    3. Server sends JSON: {"done": true, "duration_ms": ...}
    """
    await websocket.accept()
    logger.info("🔌 WebSocket connected")
    
    try:
        engine = get_engine()
        from .pipeline import Emotion
        
        while True:
            # Receive request
            data = await websocket.receive_text()
            request = json.loads(data)
            
            text = request.get("text", "")
            voice_id = request.get("voice_id")
            emotion = request.get("emotion", "neutral")
            language = request.get("language", "en")
            
            if not text.strip():
                await websocket.send_json({"error": "Empty text"})
                continue
            
            logger.info(f"🎤 Stream request: {text[:50]}...")
            
            # Stream audio chunks
            start_time = asyncio.get_event_loop().time()
            total_samples = 0
            first_chunk = True
            
            async for chunk in engine.synthesize_stream(
                text=text,
                speaker_id=voice_id,
                emotion=Emotion(emotion),
                language=language
            ):
                if first_chunk:
                    latency = (asyncio.get_event_loop().time() - start_time) * 1000
                    logger.info(f"⚡ First chunk latency: {latency:.0f}ms")
                    first_chunk = False
                
                # Send binary PCM
                await websocket.send_bytes(chunk)
                total_samples += len(chunk) // 2  # int16 = 2 bytes
            
            # Send completion
            duration_ms = (total_samples / engine.config.sample_rate) * 1000
            await websocket.send_json({
                "done": True,
                "duration_ms": duration_ms,
                "samples": total_samples,
                "sample_rate": engine.config.sample_rate
            })
            
            logger.info(f"✅ Streamed {duration_ms:.0f}ms of audio")
            
    except WebSocketDisconnect:
        logger.info("🔌 WebSocket disconnected")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        try:
            await websocket.send_json({"error": str(e)})
        except:
            pass


def create_wav(audio: np.ndarray, sample_rate: int = 24000) -> bytes:
    """Create WAV file from audio array."""
    # Convert to int16
    audio_int16 = (audio * 32767).astype(np.int16)
    pcm_data = audio_int16.tobytes()
    
    # WAV header
    num_channels = 1
    bits_per_sample = 16
    byte_rate = sample_rate * num_channels * bits_per_sample // 8
    block_align = num_channels * bits_per_sample // 8
    data_size = len(pcm_data)
    
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',
        36 + data_size,
        b'WAVE',
        b'fmt ',
        16,
        1,  # PCM
        num_channels,
        sample_rate,
        byte_rate,
        block_align,
        bits_per_sample,
        b'data',
        data_size,
    )
    
    return header + pcm_data


# Run server
if __name__ == "__main__":
    import uvicorn
    
    port = int(os.getenv("TTS_PORT", "8082"))
    
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        workers=1,  # Single worker for GPU
        log_level="info"
    )
