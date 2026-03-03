"""
Production TTS Server v2
Uses production pipeline with all optimizations
"""

import asyncio
import json
import os
from pathlib import Path
from typing import Optional, List
from datetime import datetime
import logging

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel, Field
from dataclasses import asdict

from .production_pipeline import get_production_pipeline, ProductionTTSPipeline
from .pipeline import Emotion
from .monitoring_v2 import get_monitor

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(levelname)s | %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="Production TTS Server",
    description="Maximum Performance Text-to-Speech with all optimizations",
    version="2.0.0"
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

# Lazy load pipeline
_pipeline: Optional[ProductionTTSPipeline] = None

def get_pipeline() -> ProductionTTSPipeline:
    """Get production pipeline."""
    global _pipeline
    if _pipeline is None:
        # Railway: Use CPU by default (no GPU), can override with TTS_DEVICE
        default_device = "cpu"  # Railway doesn't provide GPU by default
        if os.getenv("CUDA_VISIBLE_DEVICES") or os.getenv("TTS_DEVICE") == "cuda":
            default_device = "cuda"
        
        _pipeline = get_production_pipeline(
            device=os.getenv("TTS_DEVICE", default_device),
            use_tensorrt=os.getenv("USE_TENSORRT", "false").lower() == "true",
            use_flash_attention=os.getenv("USE_FLASH_ATTENTION", "true").lower() == "true",
            use_quantization=os.getenv("USE_QUANTIZATION", "false").lower() == "true",
            enable_monitoring=True
        )
    return _pipeline


# Request/Response models
class TTSRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=10000)
    voice_id: Optional[str] = None
    speaker_ref: Optional[str] = None
    emotion: str = "neutral"
    language: str = "en"
    add_artifacts: bool = True
    match_voice_quality: bool = False


class VoiceInfo(BaseModel):
    voice_id: str
    name: str
    description: Optional[str] = None
    source: str


class CloneResponse(BaseModel):
    success: bool
    voice_id: str
    name: str
    message: str


# Startup event
@app.on_event("startup")
async def startup():
    logger.info("🚀 Production TTS Server starting...")
    
    # Pre-load pipeline
    asyncio.create_task(_preload_pipeline())


async def _preload_pipeline():
    """Preload pipeline in background."""
    try:
        get_pipeline()
        logger.info("✅ Production TTS Pipeline ready!")
    except Exception as e:
        logger.error(f"Failed to load pipeline: {e}")


# Health check
@app.get("/health")
async def health():
    """Health check endpoint."""
    pipeline_ready = _pipeline is not None
    
    metrics = None
    if pipeline_ready:
        metrics = _pipeline.get_metrics()
    
    return {
        "status": "healthy" if pipeline_ready else "initializing",
        "service": "Production TTS",
        "version": "2.0.0",
        "pipeline_ready": pipeline_ready,
        "metrics": asdict(metrics) if metrics else None,
        "timestamp": datetime.now().isoformat()
    }


# Text-to-Speech
@app.post("/tts")
async def synthesize(request: TTSRequest):
    """Generate speech from text."""
    try:
        pipeline = get_pipeline()
        
        logger.info(f"🎤 TTS request: emotion={request.emotion}, text='{request.text[:50]}...'")
        
        # Synthesize
        try:
            emotion = Emotion(request.emotion) if hasattr(Emotion, request.emotion.upper()) else Emotion.NEUTRAL
        except:
            emotion = Emotion.NEUTRAL
        
        audio = await pipeline.synthesize(
            text=request.text,
            speaker_ref=request.speaker_ref,
            emotion=emotion,
            language=request.language,
            add_artifacts=request.add_artifacts,
            match_voice_quality=request.match_voice_quality
        )
        
        # Convert to WAV
        from .server import create_wav
        wav_data = create_wav(audio, pipeline.config.sample_rate)
        
        logger.info(f"✅ Generated {len(audio) / pipeline.config.sample_rate:.2f}s of audio")
        
        return Response(
            content=wav_data,
            media_type="audio/wav",
            headers={
                "Content-Disposition": f'attachment; filename="tts_{hash(request.text) % 10000}.wav"',
                "X-Audio-Duration": str(len(audio) / pipeline.config.sample_rate),
                "X-Sample-Rate": str(pipeline.config.sample_rate)
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
    """Clone a voice from reference audio files."""
    try:
        if not files:
            raise HTTPException(400, "At least one audio file required")
        
        pipeline = get_pipeline()
        
        # Save uploaded files temporarily
        import tempfile
        import shutil
        temp_dir = Path(tempfile.mkdtemp())
        saved_paths = []
        
        try:
            for i, file in enumerate(files):
                file_path = temp_dir / f"sample_{i}{Path(file.filename or '.wav').suffix}"
                content = await file.read()
                file_path.write_bytes(content)
                saved_paths.append(str(file_path))
            
            # Clone voice
            voice_id, embedding = pipeline.clone_voice(
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
            shutil.rmtree(temp_dir, ignore_errors=True)
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Clone error: {e}")
        raise HTTPException(500, f"Voice cloning failed: {str(e)}")


# Metrics endpoint
@app.get("/metrics")
async def get_metrics_endpoint():
    """Get production metrics."""
    pipeline = get_pipeline()
    metrics = pipeline.get_metrics()
    if metrics:
        return asdict(metrics)
    return {"error": "Metrics not available"}


# WebSocket streaming
@app.websocket("/ws/stream")
async def websocket_stream(websocket: WebSocket):
    """WebSocket endpoint for real-time audio streaming."""
    await websocket.accept()
    logger.info("🔌 WebSocket connected")
    
    try:
        pipeline = get_pipeline()
        
        while True:
            # Receive request
            data = await websocket.receive_text()
            request = json.loads(data)
            
            text = request.get("text", "")
            speaker_ref = request.get("speaker_ref")
            emotion = request.get("emotion", "neutral")
            language = request.get("language", "en")
            
            if not text.strip():
                await websocket.send_json({"error": "Empty text"})
                continue
            
            logger.info(f"🎤 Stream request: {text[:50]}...")
            
            # Stream audio chunks
            total_samples = 0
            async for chunk in pipeline.synthesize_stream(
                text=text,
                speaker_ref=speaker_ref,
                emotion=Emotion(emotion),
                language=language
            ):
                await websocket.send_bytes(chunk)
                total_samples += len(chunk) // 2  # int16 = 2 bytes
            
            # Send completion
            duration_ms = (total_samples / pipeline.config.sample_rate) * 1000
            await websocket.send_json({
                "done": True,
                "duration_ms": duration_ms,
                "samples": total_samples,
                "sample_rate": pipeline.config.sample_rate
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


# Run server
if __name__ == "__main__":
    import uvicorn
    
    # Railway uses PORT, fallback to TTS_PORT for local development
    port = int(os.getenv("PORT", os.getenv("TTS_PORT", "8082")))
    
    uvicorn.run(
        "services.tts_v2.server_v2:app",
        host="0.0.0.0",
        port=port,
        reload=False,
        workers=1,  # Single worker for GPU
        log_level="info"
    )
