"""
HumanMirage TTS - Python SDK
Easy integration for Python applications
"""

import asyncio
import aiohttp
import json
from typing import Optional, List, Dict, Any, AsyncGenerator, Union
from dataclasses import dataclass
from pathlib import Path
import io

try:
    import numpy as np
    HAS_NUMPY = True
except ImportError:
    HAS_NUMPY = False

try:
    import soundfile as sf
    HAS_SOUNDFILE = True
except ImportError:
    HAS_SOUNDFILE = False


@dataclass
class Voice:
    """Voice information."""
    voice_id: str
    name: str
    description: Optional[str] = None
    source: str = "default"
    language: Optional[str] = None


@dataclass
class GenerationResult:
    """TTS generation result."""
    audio_bytes: bytes
    sample_rate: int = 24000
    duration: float = 0.0
    latency_ms: float = 0.0
    
    def save(self, path: Union[str, Path]):
        """Save audio to file."""
        with open(path, 'wb') as f:
            f.write(self.audio_bytes)
    
    def to_numpy(self):
        """Convert to numpy array (requires soundfile)."""
        if not HAS_SOUNDFILE:
            raise ImportError("soundfile required for numpy conversion")
        
        audio, sr = sf.read(io.BytesIO(self.audio_bytes))
        return audio, sr


class HumanMirageClient:
    """
    Python SDK for HumanMirage TTS.
    
    Usage:
        client = HumanMirageClient(api_key="hm_xxxx")
        
        # Generate speech
        result = await client.generate("Hello world", emotion="happy")
        result.save("output.wav")
        
        # Clone a voice
        voice = await client.clone_voice("MyVoice", ["sample.wav"])
        
        # Stream audio
        async for chunk in client.stream("Long text here..."):
            play_audio(chunk)
    """
    
    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = "http://localhost:8082",
        timeout: float = 60.0,
    ):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def _get_session(self) -> aiohttp.ClientSession:
        """Get or create aiohttp session."""
        if self._session is None or self._session.closed:
            headers = {}
            if self.api_key:
                headers["X-API-Key"] = self.api_key
            
            timeout = aiohttp.ClientTimeout(total=self.timeout)
            self._session = aiohttp.ClientSession(
                headers=headers,
                timeout=timeout,
            )
        return self._session
    
    async def close(self):
        """Close the client session."""
        if self._session and not self._session.closed:
            await self._session.close()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.close()
    
    # Health check
    async def health(self) -> Dict[str, Any]:
        """Check service health."""
        session = await self._get_session()
        async with session.get(f"{self.base_url}/health") as resp:
            return await resp.json()
    
    # Voices
    async def list_voices(self) -> List[Voice]:
        """List available voices."""
        session = await self._get_session()
        async with session.get(f"{self.base_url}/voices") as resp:
            data = await resp.json()
            return [
                Voice(
                    voice_id=v["voice_id"],
                    name=v["name"],
                    description=v.get("description"),
                    source=v.get("source", "default"),
                    language=v.get("language"),
                )
                for v in data.get("voices", [])
            ]
    
    async def clone_voice(
        self,
        name: str,
        audio_files: List[Union[str, Path, bytes]],
        description: Optional[str] = None,
    ) -> Voice:
        """
        Clone a voice from audio samples.
        
        Args:
            name: Name for the cloned voice
            audio_files: List of audio file paths or bytes
            description: Optional description
        """
        session = await self._get_session()
        
        # Build form data
        data = aiohttp.FormData()
        data.add_field("name", name)
        if description:
            data.add_field("description", description)
        
        for i, audio in enumerate(audio_files):
            if isinstance(audio, (str, Path)):
                path = Path(audio)
                with open(path, 'rb') as f:
                    content = f.read()
                filename = path.name
            else:
                content = audio
                filename = f"sample_{i}.wav"
            
            data.add_field(
                "files",
                content,
                filename=filename,
                content_type="audio/wav",
            )
        
        async with session.post(f"{self.base_url}/clone", data=data) as resp:
            if resp.status != 200:
                error = await resp.json()
                raise Exception(error.get("detail", "Clone failed"))
            
            result = await resp.json()
            return Voice(
                voice_id=result["voice_id"],
                name=result["name"],
                source="cloned",
            )
    
    async def delete_voice(self, voice_id: str):
        """Delete a cloned voice."""
        session = await self._get_session()
        async with session.delete(f"{self.base_url}/voices/{voice_id}") as resp:
            if resp.status != 200:
                error = await resp.json()
                raise Exception(error.get("detail", "Delete failed"))
    
    # Text-to-Speech
    async def generate(
        self,
        text: str,
        voice_id: Optional[str] = None,
        emotion: str = "neutral",
        language: str = "en",
        speed: float = 1.0,
        effect: Optional[str] = None,
    ) -> GenerationResult:
        """
        Generate speech from text.
        
        Args:
            text: Text to synthesize
            voice_id: Voice ID (cloned or default)
            emotion: Emotion preset
            language: Language code
            speed: Speaking rate multiplier
            effect: Voice effect preset
        """
        session = await self._get_session()
        
        payload = {
            "text": text,
            "voice_id": voice_id,
            "emotion": emotion,
            "language": language,
            "speed": speed,
        }
        if effect:
            payload["effect"] = effect
        
        import time
        start = time.time()
        
        async with session.post(
            f"{self.base_url}/tts",
            json=payload,
        ) as resp:
            if resp.status != 200:
                error = await resp.json()
                raise Exception(error.get("detail", "Generation failed"))
            
            audio_bytes = await resp.read()
            latency = (time.time() - start) * 1000
            
            # Get duration from header if available
            duration = float(resp.headers.get("X-Audio-Duration", 0))
            sample_rate = int(resp.headers.get("X-Sample-Rate", 24000))
            
            return GenerationResult(
                audio_bytes=audio_bytes,
                sample_rate=sample_rate,
                duration=duration,
                latency_ms=latency,
            )
    
    async def stream(
        self,
        text: str,
        voice_id: Optional[str] = None,
        emotion: str = "neutral",
        language: str = "en",
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream audio generation via WebSocket.
        
        Yields:
            PCM audio chunks (int16)
        """
        import websockets
        
        ws_url = self.base_url.replace("http://", "ws://").replace("https://", "wss://")
        
        headers = {}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        
        async with websockets.connect(
            f"{ws_url}/ws/stream",
            extra_headers=headers,
        ) as ws:
            # Send request
            await ws.send(json.dumps({
                "text": text,
                "voice_id": voice_id,
                "emotion": emotion,
                "language": language,
            }))
            
            # Receive chunks
            while True:
                message = await ws.recv()
                
                if isinstance(message, bytes):
                    yield message
                else:
                    data = json.loads(message)
                    if data.get("done"):
                        break
                    if data.get("error"):
                        raise Exception(data["error"])
    
    # Batch processing
    async def batch_generate(
        self,
        texts: List[Dict[str, Any]],
    ) -> List[GenerationResult]:
        """
        Generate multiple texts in batch.
        
        Args:
            texts: List of dicts with 'text', 'voice_id', 'emotion', etc.
        """
        session = await self._get_session()
        
        async with session.post(
            f"{self.base_url}/batch",
            json={"texts": texts},
        ) as resp:
            if resp.status != 200:
                error = await resp.json()
                raise Exception(error.get("detail", "Batch failed"))
            
            # For now, return batch ID for async polling
            # Full implementation would poll for results
            return await resp.json()
    
    # Conversation
    async def generate_conversation(
        self,
        turns: List[Dict[str, str]],
        turn_gap_ms: int = 500,
    ) -> GenerationResult:
        """
        Generate multi-speaker conversation.
        
        Args:
            turns: List of dicts with 'speaker_id', 'speaker_name', 'text', 'emotion'
            turn_gap_ms: Gap between speakers in milliseconds
        """
        session = await self._get_session()
        
        async with session.post(
            f"{self.base_url}/conversation",
            json={
                "turns": turns,
                "turn_gap_ms": turn_gap_ms,
            },
        ) as resp:
            if resp.status != 200:
                error = await resp.json()
                raise Exception(error.get("detail", "Conversation failed"))
            
            audio_bytes = await resp.read()
            
            return GenerationResult(
                audio_bytes=audio_bytes,
            )


# Synchronous wrapper for non-async code
class HumanMirageSync:
    """
    Synchronous wrapper for HumanMirageClient.
    
    Usage:
        client = HumanMirageSync(api_key="hm_xxxx")
        result = client.generate("Hello world")
        result.save("output.wav")
    """
    
    def __init__(self, *args, **kwargs):
        self._client = HumanMirageClient(*args, **kwargs)
        self._loop = asyncio.new_event_loop()
    
    def _run(self, coro):
        return self._loop.run_until_complete(coro)
    
    def close(self):
        self._run(self._client.close())
        self._loop.close()
    
    def __enter__(self):
        return self
    
    def __exit__(self, *args):
        self.close()
    
    def health(self):
        return self._run(self._client.health())
    
    def list_voices(self):
        return self._run(self._client.list_voices())
    
    def clone_voice(self, *args, **kwargs):
        return self._run(self._client.clone_voice(*args, **kwargs))
    
    def delete_voice(self, voice_id):
        return self._run(self._client.delete_voice(voice_id))
    
    def generate(self, *args, **kwargs):
        return self._run(self._client.generate(*args, **kwargs))
    
    def generate_conversation(self, *args, **kwargs):
        return self._run(self._client.generate_conversation(*args, **kwargs))


# Example usage
if __name__ == "__main__":
    async def main():
        async with HumanMirageClient() as client:
            # Check health
            health = await client.health()
            print(f"Service status: {health['status']}")
            
            # List voices
            voices = await client.list_voices()
            print(f"Available voices: {len(voices)}")
            
            # Generate speech
            result = await client.generate(
                "Hello! I'm HumanMirage, your AI voice assistant.",
                emotion="happy",
            )
            result.save("hello.wav")
            print(f"Generated {result.duration:.2f}s of audio in {result.latency_ms:.0f}ms")
    
    asyncio.run(main())
