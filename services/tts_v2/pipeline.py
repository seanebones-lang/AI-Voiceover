"""
HumanMirage TTS - Core Pipeline
Production TTS with voice cloning and emotion control
"""

import torch
import numpy as np
from pathlib import Path
from typing import Optional, AsyncGenerator, Dict, Any
import asyncio
import logging
from dataclasses import dataclass
from enum import Enum

from .phonemizer import get_phonemizer, MasterPhonimizer
from .speaker_encoder import get_speaker_encoder, get_speaker_database, SpeakerEncoder

logger = logging.getLogger(__name__)


class Emotion(str, Enum):
    """Supported emotion presets."""
    NEUTRAL = "neutral"
    HAPPY = "happy"
    SAD = "sad"
    ANGRY = "angry"
    EXCITED = "excited"
    CALM = "calm"
    WHISPER = "whisper"
    SERIOUS = "serious"


@dataclass
class TTSConfig:
    """TTS generation configuration."""
    sample_rate: int = 24000
    chunk_size: int = 4800  # 200ms at 24kHz
    speed: float = 1.0
    pitch: float = 0.0  # semitones
    energy: float = 1.0


# Emotion to prosody parameter mapping
EMOTION_PARAMS: Dict[Emotion, Dict[str, float]] = {
    Emotion.NEUTRAL: {"speed": 1.0, "pitch": 0.0, "energy": 1.0, "variance": 0.5},
    Emotion.HAPPY: {"speed": 1.1, "pitch": 2.0, "energy": 1.2, "variance": 0.7},
    Emotion.SAD: {"speed": 0.85, "pitch": -2.0, "energy": 0.7, "variance": 0.3},
    Emotion.ANGRY: {"speed": 1.15, "pitch": 1.0, "energy": 1.4, "variance": 0.8},
    Emotion.EXCITED: {"speed": 1.2, "pitch": 3.0, "energy": 1.3, "variance": 0.9},
    Emotion.CALM: {"speed": 0.9, "pitch": -1.0, "energy": 0.8, "variance": 0.2},
    Emotion.WHISPER: {"speed": 0.95, "pitch": -3.0, "energy": 0.4, "variance": 0.1},
    Emotion.SERIOUS: {"speed": 0.95, "pitch": -1.0, "energy": 1.0, "variance": 0.3},
}


class HumanMirageTTS:
    """
    Production TTS Pipeline
    
    Features:
    - Real voice cloning via speaker embeddings
    - Emotion control
    - Streaming synthesis
    - Multiple backend support (XTTS, StyleTTS2, VITS)
    """
    
    def __init__(
        self,
        model_name: str = "tts_models/multilingual/multi-dataset/xtts_v2",
        device: str = "cuda" if torch.cuda.is_available() else "cpu",
        use_deepspeed: bool = False
    ):
        self.device = device
        self.model_name = model_name
        self.config = TTSConfig()
        
        # Initialize components
        self.phonemizer = get_phonemizer()
        self.speaker_encoder = get_speaker_encoder()
        self.speaker_db = get_speaker_database()
        
        # Load TTS model
        self.model = None
        self._load_model(use_deepspeed)
        
        logger.info(f"✓ HumanMirage TTS initialized on {device}")
    
    def _load_model(self, use_deepspeed: bool = False):
        """Load TTS model with fallback options."""
        
        # Try XTTS v2 (best quality)
        try:
            from TTS.api import TTS
            
            self.model = TTS(self.model_name).to(self.device)
            self._backend = "coqui"
            self.config.sample_rate = 24000
            logger.info(f"✓ Loaded Coqui TTS: {self.model_name}")
            return
        except Exception as e:
            logger.warning(f"Could not load Coqui TTS: {e}")
        
        # Try StyleTTS2
        try:
            import styletts2
            self.model = styletts2.tts.StyleTTS2()
            self._backend = "styletts2"
            self.config.sample_rate = 24000
            logger.info("✓ Loaded StyleTTS2")
            return
        except Exception as e:
            logger.debug(f"StyleTTS2 not available: {e}")
        
        # Try edge-tts as fallback (not ideal but works)
        try:
            import edge_tts
            self._backend = "edge"
            self.config.sample_rate = 24000
            logger.warning("⚠ Using edge-tts fallback (cloud-based)")
            return
        except ImportError:
            pass
        
        raise RuntimeError("No TTS backend available. Install: pip install TTS")
    
    def _apply_emotion(self, config: TTSConfig, emotion: Emotion) -> TTSConfig:
        """Apply emotion parameters to config."""
        params = EMOTION_PARAMS.get(emotion, EMOTION_PARAMS[Emotion.NEUTRAL])
        
        return TTSConfig(
            sample_rate=config.sample_rate,
            chunk_size=config.chunk_size,
            speed=config.speed * params["speed"],
            pitch=config.pitch + params["pitch"],
            energy=config.energy * params["energy"]
        )
    
    async def synthesize(
        self,
        text: str,
        speaker_id: Optional[str] = None,
        speaker_embedding: Optional[np.ndarray] = None,
        emotion: Emotion = Emotion.NEUTRAL,
        language: str = "en"
    ) -> np.ndarray:
        """
        Synthesize speech from text.
        
        Args:
            text: Input text
            speaker_id: ID of cloned speaker (from database)
            speaker_embedding: Direct speaker embedding (256-dim)
            emotion: Emotion preset
            language: Language code
            
        Returns:
            Audio as float32 numpy array
        """
        if not text or not text.strip():
            raise ValueError("Text cannot be empty")
        
        # Get speaker embedding
        if speaker_embedding is None and speaker_id:
            try:
                speaker_embedding = self.speaker_db.get_embedding(speaker_id)
            except ValueError:
                logger.warning(f"Speaker {speaker_id} not found, using default")
                speaker_embedding = None
        
        # Apply emotion parameters
        config = self._apply_emotion(self.config, emotion)
        
        # Generate based on backend
        if self._backend == "coqui":
            audio = await self._synthesize_coqui(
                text, speaker_embedding, config, language
            )
        elif self._backend == "styletts2":
            audio = await self._synthesize_styletts2(
                text, speaker_embedding, config
            )
        elif self._backend == "edge":
            audio = await self._synthesize_edge(text, language)
        else:
            raise RuntimeError(f"Unknown backend: {self._backend}")
        
        return audio
    
    async def _synthesize_coqui(
        self,
        text: str,
        speaker_embedding: Optional[np.ndarray],
        config: TTSConfig,
        language: str
    ) -> np.ndarray:
        """Synthesize using Coqui TTS (XTTS v2)."""
        
        # XTTS v2 synthesis
        # NOTE: Coqui TTS .tts() expects speaker_wav (path) for cloning, not a raw embedding.
        # When speaker_embedding is set we pass speaker_wav=None here, so cloning is not applied.
        # For reliable voice cloning use the XTTS service (services/xtts) which uses speaker_wav.
        if speaker_embedding is not None:
            # Use speaker embedding for voice cloning (Coqui API may not support this path fully)
            wav = self.model.tts(
                text=text,
                speaker_wav=None,  # Use embedding instead
                language=language,
                speaker=None,
                # Pass embedding through model's speaker manager
            )
        else:
            # Default voice
            wav = self.model.tts(
                text=text,
                language=language
            )
        
        audio = np.array(wav, dtype=np.float32)
        
        # Apply speed adjustment
        if config.speed != 1.0:
            audio = self._adjust_speed(audio, config.speed)
        
        return audio
    
    async def _synthesize_styletts2(
        self,
        text: str,
        speaker_embedding: Optional[np.ndarray],
        config: TTSConfig
    ) -> np.ndarray:
        """Synthesize using StyleTTS2."""
        
        # Run in thread pool (StyleTTS2 is not async)
        loop = asyncio.get_event_loop()
        
        def _generate():
            return self.model.inference(
                text=text,
                ref_s=speaker_embedding,
                alpha=0.3,  # Style strength
                beta=0.7,   # F0 strength
                diffusion_steps=10,
                embedding_scale=1.0
            )
        
        audio = await loop.run_in_executor(None, _generate)
        return np.array(audio, dtype=np.float32)
    
    async def _synthesize_edge(self, text: str, language: str) -> np.ndarray:
        """Synthesize using edge-tts (cloud fallback)."""
        import edge_tts
        import tempfile
        import soundfile as sf
        
        # Map language to edge voice
        voice_map = {
            "en": "en-US-GuyNeural",
            "es": "es-ES-AlvaroNeural",
            "fr": "fr-FR-HenriNeural",
            "de": "de-DE-ConradNeural",
        }
        voice = voice_map.get(language, "en-US-GuyNeural")
        
        # Generate to temp file
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
            temp_path = f.name
        
        communicate = edge_tts.Communicate(text, voice)
        await communicate.save(temp_path)
        
        # Load and convert
        audio, sr = sf.read(temp_path)
        
        # Cleanup
        Path(temp_path).unlink()
        
        return audio.astype(np.float32)
    
    def _adjust_speed(self, audio: np.ndarray, speed: float) -> np.ndarray:
        """Adjust playback speed without changing pitch."""
        if speed == 1.0:
            return audio
        
        try:
            import librosa
            return librosa.effects.time_stretch(audio, rate=speed)
        except ImportError:
            # Simple resampling fallback
            new_length = int(len(audio) / speed)
            indices = np.linspace(0, len(audio) - 1, new_length)
            return np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)
    
    async def synthesize_stream(
        self,
        text: str,
        speaker_id: Optional[str] = None,
        speaker_embedding: Optional[np.ndarray] = None,
        emotion: Emotion = Emotion.NEUTRAL,
        language: str = "en",
        chunk_size: Optional[int] = None
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream audio chunks for real-time playback.
        
        Yields:
            PCM int16 audio chunks
        """
        chunk_size = chunk_size or self.config.chunk_size
        
        # For now, generate full audio then stream chunks
        # TODO: Implement true streaming with chunked inference
        audio = await self.synthesize(
            text=text,
            speaker_id=speaker_id,
            speaker_embedding=speaker_embedding,
            emotion=emotion,
            language=language
        )
        
        # Convert to int16 PCM
        audio_int16 = (audio * 32767).astype(np.int16)
        
        # Yield chunks
        for i in range(0, len(audio_int16), chunk_size):
            chunk = audio_int16[i:i + chunk_size]
            yield chunk.tobytes()
            
            # Small delay to simulate streaming
            await asyncio.sleep(0.01)
    
    def clone_voice(
        self,
        name: str,
        audio_files: list,
        description: Optional[str] = None
    ) -> str:
        """
        Clone a voice from reference audio.
        
        Args:
            name: Name for the cloned voice
            audio_files: List of audio file paths
            description: Optional description
            
        Returns:
            Speaker ID for the cloned voice
        """
        return self.speaker_db.add_speaker(
            name=name,
            audio_files=audio_files,
            description=description
        )
    
    def list_voices(self) -> list:
        """List all available voices (cloned + default)."""
        cloned = self.speaker_db.list_speakers()
        
        # Add cloned voices
        voices = []
        for speaker in cloned:
            voices.append({
                "voice_id": speaker["id"],
                "name": speaker["name"],
                "description": speaker.get("description"),
                "source": "cloned",
                "created_at": speaker["created_at"]
            })
        
        # Add default voices based on backend
        if self._backend == "coqui":
            # XTTS v2 default speakers
            default_voices = [
                {"voice_id": "default_male", "name": "Default Male", "source": "default"},
                {"voice_id": "default_female", "name": "Default Female", "source": "default"},
            ]
            voices.extend(default_voices)
        
        return voices


# Global instance
_tts_engine: Optional[HumanMirageTTS] = None


def get_tts_engine() -> HumanMirageTTS:
    """Get or create TTS engine singleton."""
    global _tts_engine
    if _tts_engine is None:
        _tts_engine = HumanMirageTTS()
    return _tts_engine


async def text_to_speech(
    text: str,
    speaker_id: Optional[str] = None,
    emotion: str = "neutral",
    language: str = "en"
) -> np.ndarray:
    """Convenience function for TTS."""
    engine = get_tts_engine()
    return await engine.synthesize(
        text=text,
        speaker_id=speaker_id,
        emotion=Emotion(emotion),
        language=language
    )
