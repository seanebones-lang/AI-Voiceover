"""
HumanMirage TTS v3
Production Text-to-Speech with Voice Cloning

Usage:
    from services.tts_v2 import get_tts_engine, text_to_speech
    
    # Simple usage
    audio = await text_to_speech("Hello world", speaker_id="my_voice")
    
    # Full control
    engine = get_tts_engine()
    audio = await engine.synthesize(
        text="Hello world",
        speaker_id="my_voice",
        emotion=Emotion.HAPPY,
        language="en"
    )
"""

from .pipeline import (
    HumanMirageTTS,
    get_tts_engine,
    text_to_speech,
    Emotion,
    TTSConfig
)

from .speaker_encoder import (
    SpeakerEncoder,
    SpeakerDatabase,
    get_speaker_encoder,
    get_speaker_database
)

from .phonemizer import (
    MasterPhonimizer,
    get_phonemizer
)

__version__ = "3.0.0"
__all__ = [
    "HumanMirageTTS",
    "get_tts_engine",
    "text_to_speech",
    "Emotion",
    "TTSConfig",
    "SpeakerEncoder",
    "SpeakerDatabase",
    "get_speaker_encoder",
    "get_speaker_database",
    "MasterPhonimizer",
    "get_phonemizer",
]
