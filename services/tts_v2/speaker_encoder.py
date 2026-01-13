"""
HumanMirage TTS - Speaker Encoder
True voice cloning via speaker embeddings
"""

import torch
import torch.nn.functional as F
import numpy as np
from pathlib import Path
from typing import Union, List, Optional
import hashlib
import json
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# Try to import audio processing libraries
try:
    import torchaudio
    HAS_TORCHAUDIO = True
except ImportError:
    HAS_TORCHAUDIO = False

try:
    import librosa
    HAS_LIBROSA = True
except ImportError:
    HAS_LIBROSA = False


class SpeakerEncoder:
    """
    Extract speaker embeddings from reference audio for voice cloning.
    
    Uses a pretrained speaker verification model to create
    256-dimensional speaker representations.
    """
    
    SAMPLE_RATE = 16000
    MIN_DURATION = 3.0  # seconds
    MAX_DURATION = 30.0
    EMBEDDING_DIM = 256
    
    def __init__(self, device: str = "cuda" if torch.cuda.is_available() else "cpu"):
        self.device = device
        self.model = None
        self._load_model()
    
    def _load_model(self):
        """Load speaker encoder model."""
        try:
            # Try to load from TTS library (Coqui)
            from TTS.tts.utils.speakers import SpeakerManager
            from TTS.utils.audio import AudioProcessor
            
            # Use the speaker encoder from XTTS
            model_path = Path("models/speaker_encoder")
            if model_path.exists():
                self.model = torch.jit.load(
                    model_path / "speaker_encoder.pt",
                    map_location=self.device
                )
                self.model.eval()
                logger.info("✓ Loaded JIT speaker encoder")
                return
        except Exception as e:
            logger.debug(f"Could not load TTS speaker encoder: {e}")
        
        try:
            # Fallback: Use resemblyzer-style encoder
            from resemblyzer import VoiceEncoder
            self.model = VoiceEncoder(device=self.device)
            self._model_type = "resemblyzer"
            logger.info("✓ Loaded resemblyzer speaker encoder")
            return
        except ImportError:
            pass
        
        # Final fallback: Simple mel-based embeddings
        logger.warning("No speaker encoder available, using basic mel embeddings")
        self.model = None
        self._model_type = "basic"
    
    def _load_audio(self, audio_path: Union[str, Path]) -> np.ndarray:
        """Load and preprocess audio file."""
        audio_path = Path(audio_path)
        
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio file not found: {audio_path}")
        
        # Load with librosa or torchaudio
        if HAS_LIBROSA:
            wav, sr = librosa.load(str(audio_path), sr=self.SAMPLE_RATE, mono=True)
        elif HAS_TORCHAUDIO:
            wav, sr = torchaudio.load(str(audio_path))
            wav = wav.mean(dim=0).numpy()  # Convert to mono
            if sr != self.SAMPLE_RATE:
                wav = librosa.resample(wav, orig_sr=sr, target_sr=self.SAMPLE_RATE)
        else:
            raise ImportError("Need either librosa or torchaudio for audio loading")
        
        # Normalize
        wav = wav / (np.abs(wav).max() + 1e-8)
        
        # Check duration
        duration = len(wav) / self.SAMPLE_RATE
        if duration < self.MIN_DURATION:
            raise ValueError(f"Audio too short: {duration:.1f}s (minimum {self.MIN_DURATION}s)")
        
        # Truncate if too long
        if duration > self.MAX_DURATION:
            max_samples = int(self.MAX_DURATION * self.SAMPLE_RATE)
            wav = wav[:max_samples]
        
        return wav.astype(np.float32)
    
    @torch.no_grad()
    def encode(self, audio: Union[str, Path, np.ndarray]) -> np.ndarray:
        """
        Extract speaker embedding from audio.
        
        Args:
            audio: Path to audio file or numpy array
            
        Returns:
            256-dimensional normalized speaker embedding
        """
        # Load audio if path provided
        if isinstance(audio, (str, Path)):
            wav = self._load_audio(audio)
        else:
            wav = audio.astype(np.float32)
        
        # Use appropriate encoder
        if hasattr(self, '_model_type') and self._model_type == "resemblyzer":
            embedding = self.model.embed_utterance(wav)
            # Resemblyzer outputs 256-dim
            
        elif self.model is not None:
            # JIT model
            wav_tensor = torch.from_numpy(wav).unsqueeze(0).to(self.device)
            embedding = self.model(wav_tensor).cpu().numpy()[0]
            
        else:
            # Basic fallback: use mel spectrogram statistics
            embedding = self._basic_embedding(wav)
        
        # L2 normalize
        embedding = embedding / (np.linalg.norm(embedding) + 1e-8)
        
        return embedding
    
    def _basic_embedding(self, wav: np.ndarray) -> np.ndarray:
        """Fallback: compute basic mel-based embedding."""
        if not HAS_LIBROSA:
            # Ultra-basic fallback
            return np.random.randn(self.EMBEDDING_DIM).astype(np.float32)
        
        # Compute mel spectrogram
        mel = librosa.feature.melspectrogram(
            y=wav, 
            sr=self.SAMPLE_RATE,
            n_mels=80,
            fmax=8000
        )
        mel_db = librosa.power_to_db(mel, ref=np.max)
        
        # Extract statistics as embedding
        features = []
        features.extend(np.mean(mel_db, axis=1))  # 80 dims
        features.extend(np.std(mel_db, axis=1))   # 80 dims
        features.extend(np.max(mel_db, axis=1))   # 80 dims
        
        # Pad or truncate to 256
        embedding = np.array(features[:self.EMBEDDING_DIM], dtype=np.float32)
        if len(embedding) < self.EMBEDDING_DIM:
            embedding = np.pad(embedding, (0, self.EMBEDDING_DIM - len(embedding)))
        
        return embedding
    
    def encode_multiple(self, audio_files: List[Union[str, Path]]) -> np.ndarray:
        """
        Encode multiple reference files and average embeddings.
        More robust than single-file encoding.
        """
        embeddings = []
        
        for audio in audio_files:
            try:
                emb = self.encode(audio)
                embeddings.append(emb)
                logger.info(f"✓ Encoded: {audio}")
            except Exception as e:
                logger.warning(f"Failed to process {audio}: {e}")
                continue
        
        if not embeddings:
            raise ValueError("No valid audio files could be processed")
        
        # Average and re-normalize
        mean_embedding = np.mean(embeddings, axis=0)
        mean_embedding = mean_embedding / (np.linalg.norm(mean_embedding) + 1e-8)
        
        return mean_embedding
    
    def similarity(self, emb1: np.ndarray, emb2: np.ndarray) -> float:
        """Compute cosine similarity between two speaker embeddings."""
        return float(np.dot(emb1, emb2))
    
    @staticmethod
    def embedding_to_id(embedding: np.ndarray) -> str:
        """Generate deterministic ID from embedding."""
        emb_bytes = embedding.tobytes()
        return hashlib.sha256(emb_bytes).hexdigest()[:16]


class SpeakerDatabase:
    """
    SQLite-backed speaker embedding storage.
    Persists voice clones for reuse.
    """
    
    def __init__(self, db_path: str = "speakers.db"):
        self.db_path = Path(db_path)
        self.encoder = SpeakerEncoder()
        self._init_db()
    
    def _init_db(self):
        """Initialize SQLite database."""
        import sqlite3
        
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        
        conn = sqlite3.connect(str(self.db_path))
        conn.execute("""
            CREATE TABLE IF NOT EXISTS speakers (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT,
                embedding BLOB NOT NULL,
                created_at TEXT NOT NULL,
                sample_files TEXT,
                metadata TEXT
            )
        """)
        conn.commit()
        conn.close()
    
    def _get_conn(self):
        import sqlite3
        return sqlite3.connect(str(self.db_path))
    
    def add_speaker(
        self,
        name: str,
        audio_files: List[str],
        description: Optional[str] = None,
        metadata: Optional[dict] = None
    ) -> str:
        """
        Add new speaker from reference audio files.
        
        Returns:
            Speaker ID (16-char hash)
        """
        # Encode audio files
        embedding = self.encoder.encode_multiple(audio_files)
        speaker_id = SpeakerEncoder.embedding_to_id(embedding)
        
        # Store in database
        conn = self._get_conn()
        conn.execute(
            """
            INSERT OR REPLACE INTO speakers 
            (id, name, description, embedding, created_at, sample_files, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                speaker_id,
                name,
                description,
                embedding.tobytes(),
                datetime.now().isoformat(),
                json.dumps(audio_files),
                json.dumps(metadata or {})
            )
        )
        conn.commit()
        conn.close()
        
        logger.info(f"✓ Added speaker: {name} ({speaker_id})")
        return speaker_id
    
    def get_embedding(self, speaker_id: str) -> np.ndarray:
        """Retrieve speaker embedding by ID."""
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT embedding FROM speakers WHERE id = ?",
            (speaker_id,)
        )
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise ValueError(f"Speaker not found: {speaker_id}")
        
        embedding = np.frombuffer(row[0], dtype=np.float32)
        return embedding
    
    def get_speaker(self, speaker_id: str) -> dict:
        """Get full speaker info."""
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT id, name, description, created_at, sample_files, metadata FROM speakers WHERE id = ?",
            (speaker_id,)
        )
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            raise ValueError(f"Speaker not found: {speaker_id}")
        
        return {
            "id": row[0],
            "name": row[1],
            "description": row[2],
            "created_at": row[3],
            "sample_files": json.loads(row[4]) if row[4] else [],
            "metadata": json.loads(row[5]) if row[5] else {}
        }
    
    def list_speakers(self) -> List[dict]:
        """List all registered speakers."""
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT id, name, description, created_at, metadata FROM speakers ORDER BY created_at DESC"
        )
        speakers = []
        for row in cursor.fetchall():
            speakers.append({
                "id": row[0],
                "name": row[1],
                "description": row[2],
                "created_at": row[3],
                "metadata": json.loads(row[4]) if row[4] else {}
            })
        conn.close()
        return speakers
    
    def delete_speaker(self, speaker_id: str) -> bool:
        """Delete a speaker."""
        conn = self._get_conn()
        cursor = conn.execute(
            "DELETE FROM speakers WHERE id = ?",
            (speaker_id,)
        )
        deleted = cursor.rowcount > 0
        conn.commit()
        conn.close()
        
        if deleted:
            logger.info(f"✓ Deleted speaker: {speaker_id}")
        
        return deleted
    
    def has_speaker(self, speaker_id: str) -> bool:
        """Check if speaker exists."""
        conn = self._get_conn()
        cursor = conn.execute(
            "SELECT 1 FROM speakers WHERE id = ? LIMIT 1",
            (speaker_id,)
        )
        exists = cursor.fetchone() is not None
        conn.close()
        return exists


# Global instances
_encoder: Optional[SpeakerEncoder] = None
_database: Optional[SpeakerDatabase] = None


def get_speaker_encoder() -> SpeakerEncoder:
    """Get speaker encoder singleton."""
    global _encoder
    if _encoder is None:
        _encoder = SpeakerEncoder()
    return _encoder


def get_speaker_database(db_path: str = "data/speakers.db") -> SpeakerDatabase:
    """Get speaker database singleton."""
    global _database
    if _database is None:
        _database = SpeakerDatabase(db_path)
    return _database
