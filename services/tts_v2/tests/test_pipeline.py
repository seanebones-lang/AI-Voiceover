"""
HumanMirage TTS - Test Suite
Validates all components of the TTS pipeline
"""

import pytest
import asyncio
import numpy as np
from pathlib import Path
import tempfile
import wave
import sys

# Add parent to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))


class TestPhonimizer:
    """Test phonemizer functionality."""
    
    def test_basic_phonemization(self):
        """Test basic text to phoneme conversion."""
        from phonemizer import get_phonemizer
        
        ph = get_phonemizer()
        phonemes = ph.phonemize("Hello world")
        
        assert phonemes is not None
        assert len(phonemes) > 0
        assert isinstance(phonemes, list)
    
    def test_number_expansion(self):
        """Test number to word conversion."""
        from phonemizer import get_phonemizer
        
        ph = get_phonemizer()
        
        # Test various number formats
        result = ph._expand_numbers("I have 5 apples")
        assert "five" in result.lower()
        
        result = ph._expand_numbers("The price is $100")
        assert "hundred" in result.lower() or "100" not in result
    
    def test_abbreviation_expansion(self):
        """Test abbreviation expansion."""
        from phonemizer import get_phonemizer
        
        ph = get_phonemizer()
        result = ph._expand_abbreviations("Dr. Smith went to the store")
        
        assert "Doctor" in result or "doctor" in result
    
    def test_tech_lexicon(self):
        """Test tech term pronunciation."""
        from phonemizer import get_phonemizer
        
        ph = get_phonemizer()
        
        # These should be in the lexicon
        text, subs = ph._apply_lexicon("The API uses JSON")
        
        assert len(subs) > 0  # Should have replacements
    
    def test_punctuation_to_prosody(self):
        """Test punctuation conversion to prosodic markers."""
        from phonemizer import get_phonemizer
        
        ph = get_phonemizer()
        result = ph._punctuation_to_prosody("Hello. How are you?")
        
        assert "<PAUSE" in result


class TestSpeakerEncoder:
    """Test speaker encoding functionality."""
    
    @pytest.fixture
    def sample_audio(self):
        """Create a sample audio file for testing."""
        # Generate 5 seconds of sine wave
        sample_rate = 16000
        duration = 5.0
        frequency = 440.0
        
        t = np.linspace(0, duration, int(sample_rate * duration))
        audio = (np.sin(2 * np.pi * frequency * t) * 0.5).astype(np.float32)
        
        # Save to temp file
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            temp_path = f.name
        
        with wave.open(temp_path, 'w') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes((audio * 32767).astype(np.int16).tobytes())
        
        yield temp_path
        
        # Cleanup
        Path(temp_path).unlink(missing_ok=True)
    
    def test_encoder_initialization(self):
        """Test speaker encoder loads correctly."""
        from speaker_encoder import SpeakerEncoder
        
        encoder = SpeakerEncoder(device="cpu")
        assert encoder is not None
    
    def test_embedding_extraction(self, sample_audio):
        """Test embedding extraction from audio."""
        from speaker_encoder import SpeakerEncoder
        
        encoder = SpeakerEncoder(device="cpu")
        embedding = encoder.encode(sample_audio)
        
        assert embedding is not None
        assert embedding.shape == (256,)  # 256-dim embedding
        assert np.isfinite(embedding).all()  # No NaN or Inf
    
    def test_embedding_normalization(self, sample_audio):
        """Test that embeddings are L2 normalized."""
        from speaker_encoder import SpeakerEncoder
        
        encoder = SpeakerEncoder(device="cpu")
        embedding = encoder.encode(sample_audio)
        
        # L2 norm should be ~1.0
        norm = np.linalg.norm(embedding)
        assert abs(norm - 1.0) < 0.01
    
    def test_embedding_consistency(self, sample_audio):
        """Test that same audio produces same embedding."""
        from speaker_encoder import SpeakerEncoder
        
        encoder = SpeakerEncoder(device="cpu")
        
        emb1 = encoder.encode(sample_audio)
        emb2 = encoder.encode(sample_audio)
        
        # Should be identical
        similarity = encoder.similarity(emb1, emb2)
        assert similarity > 0.99
    
    def test_embedding_to_id(self, sample_audio):
        """Test deterministic ID generation."""
        from speaker_encoder import SpeakerEncoder
        
        encoder = SpeakerEncoder(device="cpu")
        embedding = encoder.encode(sample_audio)
        
        id1 = SpeakerEncoder.embedding_to_id(embedding)
        id2 = SpeakerEncoder.embedding_to_id(embedding)
        
        assert id1 == id2
        assert len(id1) == 16  # SHA256 truncated to 16 chars


class TestSpeakerDatabase:
    """Test speaker database functionality."""
    
    @pytest.fixture
    def temp_db(self):
        """Create temporary database."""
        with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
            db_path = f.name
        yield db_path
        Path(db_path).unlink(missing_ok=True)
    
    @pytest.fixture
    def sample_audio(self):
        """Create sample audio file."""
        sample_rate = 16000
        duration = 5.0
        t = np.linspace(0, duration, int(sample_rate * duration))
        audio = (np.sin(2 * np.pi * 440 * t) * 0.5).astype(np.float32)
        
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            temp_path = f.name
        
        with wave.open(temp_path, 'w') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes((audio * 32767).astype(np.int16).tobytes())
        
        yield temp_path
        Path(temp_path).unlink(missing_ok=True)
    
    def test_database_creation(self, temp_db):
        """Test database initializes correctly."""
        from speaker_encoder import SpeakerDatabase
        
        db = SpeakerDatabase(temp_db)
        assert db is not None
        assert Path(temp_db).exists()
    
    def test_add_speaker(self, temp_db, sample_audio):
        """Test adding a speaker."""
        from speaker_encoder import SpeakerDatabase
        
        db = SpeakerDatabase(temp_db)
        speaker_id = db.add_speaker(
            name="Test Voice",
            audio_files=[sample_audio],
            description="Test description"
        )
        
        assert speaker_id is not None
        assert len(speaker_id) == 16
    
    def test_get_embedding(self, temp_db, sample_audio):
        """Test retrieving speaker embedding."""
        from speaker_encoder import SpeakerDatabase
        
        db = SpeakerDatabase(temp_db)
        speaker_id = db.add_speaker("Test", [sample_audio])
        
        embedding = db.get_embedding(speaker_id)
        
        assert embedding is not None
        assert embedding.shape == (256,)
    
    def test_list_speakers(self, temp_db, sample_audio):
        """Test listing speakers."""
        from speaker_encoder import SpeakerDatabase
        
        db = SpeakerDatabase(temp_db)
        db.add_speaker("Voice 1", [sample_audio])
        db.add_speaker("Voice 2", [sample_audio])
        
        speakers = db.list_speakers()
        
        assert len(speakers) == 2
        assert any(s["name"] == "Voice 1" for s in speakers)
        assert any(s["name"] == "Voice 2" for s in speakers)
    
    def test_delete_speaker(self, temp_db, sample_audio):
        """Test deleting a speaker."""
        from speaker_encoder import SpeakerDatabase
        
        db = SpeakerDatabase(temp_db)
        speaker_id = db.add_speaker("Test", [sample_audio])
        
        assert db.has_speaker(speaker_id)
        
        db.delete_speaker(speaker_id)
        
        assert not db.has_speaker(speaker_id)


class TestTTSPipeline:
    """Test main TTS pipeline."""
    
    @pytest.fixture
    def engine(self):
        """Create TTS engine instance."""
        from pipeline import HumanMirageTTS
        
        # Use CPU for tests
        engine = HumanMirageTTS(device="cpu")
        return engine
    
    @pytest.mark.asyncio
    async def test_basic_synthesis(self, engine):
        """Test basic text to speech."""
        audio = await engine.synthesize("Hello world")
        
        assert audio is not None
        assert isinstance(audio, np.ndarray)
        assert len(audio) > 0
        assert audio.dtype == np.float32
    
    @pytest.mark.asyncio
    async def test_emotion_synthesis(self, engine):
        """Test synthesis with different emotions."""
        from pipeline import Emotion
        
        text = "This is a test."
        
        for emotion in [Emotion.HAPPY, Emotion.SAD, Emotion.ANGRY]:
            audio = await engine.synthesize(text, emotion=emotion)
            
            assert audio is not None
            assert len(audio) > 0
    
    @pytest.mark.asyncio
    async def test_streaming(self, engine):
        """Test streaming synthesis."""
        chunks = []
        
        async for chunk in engine.synthesize_stream("Hello world"):
            chunks.append(chunk)
        
        assert len(chunks) > 0
        
        # All chunks should be bytes
        for chunk in chunks:
            assert isinstance(chunk, bytes)
    
    @pytest.mark.asyncio
    async def test_empty_text_raises(self, engine):
        """Test that empty text raises error."""
        with pytest.raises(ValueError):
            await engine.synthesize("")
        
        with pytest.raises(ValueError):
            await engine.synthesize("   ")
    
    def test_list_voices(self, engine):
        """Test voice listing."""
        voices = engine.list_voices()
        
        assert isinstance(voices, list)
        # Should have at least default voices
        assert len(voices) > 0


class TestServerEndpoints:
    """Test API server endpoints."""
    
    @pytest.fixture
    def client(self):
        """Create test client."""
        from fastapi.testclient import TestClient
        from server import app
        
        return TestClient(app)
    
    def test_health_endpoint(self, client):
        """Test health check."""
        response = client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
    
    def test_voices_endpoint(self, client):
        """Test voices listing."""
        response = client.get("/voices")
        
        assert response.status_code == 200
        data = response.json()
        assert "voices" in data
    
    def test_tts_endpoint(self, client):
        """Test TTS generation."""
        response = client.post(
            "/tts",
            json={"text": "Hello world", "emotion": "neutral"}
        )
        
        assert response.status_code == 200
        assert response.headers["content-type"] == "audio/wav"
        assert len(response.content) > 0
    
    def test_tts_validation(self, client):
        """Test TTS input validation."""
        # Empty text
        response = client.post("/tts", json={"text": ""})
        assert response.status_code == 422 or response.status_code == 400
        
        # Missing text
        response = client.post("/tts", json={})
        assert response.status_code == 422 or response.status_code == 400


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
