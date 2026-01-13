"""
HumanMirage TTS - Caching Layer
Intelligent caching for repeated TTS requests
"""

import hashlib
import json
import time
import asyncio
from typing import Optional, Dict, Any
from dataclasses import dataclass
from pathlib import Path
import logging
import pickle
import threading

import numpy as np

logger = logging.getLogger(__name__)

# Try to import Redis for distributed caching
try:
    import redis.asyncio as redis
    HAS_REDIS = True
except ImportError:
    HAS_REDIS = False


@dataclass
class CacheEntry:
    """Cached TTS result."""
    audio: np.ndarray
    sample_rate: int
    created_at: float
    hits: int = 0
    
    def to_bytes(self) -> bytes:
        """Serialize to bytes."""
        return pickle.dumps({
            'audio': self.audio.tobytes(),
            'dtype': str(self.audio.dtype),
            'shape': self.audio.shape,
            'sample_rate': self.sample_rate,
            'created_at': self.created_at,
            'hits': self.hits,
        })
    
    @classmethod
    def from_bytes(cls, data: bytes) -> "CacheEntry":
        """Deserialize from bytes."""
        d = pickle.loads(data)
        audio = np.frombuffer(d['audio'], dtype=d['dtype']).reshape(d['shape'])
        return cls(
            audio=audio,
            sample_rate=d['sample_rate'],
            created_at=d['created_at'],
            hits=d['hits'],
        )


class TTSCache:
    """
    In-memory LRU cache for TTS results.
    
    Features:
    - Content-based hashing (same text = same key)
    - LRU eviction
    - TTL expiration
    - Memory limit
    """
    
    def __init__(
        self,
        max_entries: int = 1000,
        max_memory_mb: float = 500,
        ttl_seconds: int = 3600,
    ):
        self.max_entries = max_entries
        self.max_memory_bytes = max_memory_mb * 1024 * 1024
        self.ttl_seconds = ttl_seconds
        
        self._cache: Dict[str, CacheEntry] = {}
        self._access_order: Dict[str, float] = {}
        self._lock = threading.Lock()
        
        # Stats
        self._hits = 0
        self._misses = 0
    
    def _make_key(
        self,
        text: str,
        voice_id: Optional[str],
        emotion: str,
        language: str,
        **kwargs,
    ) -> str:
        """Generate cache key from TTS parameters."""
        key_data = {
            'text': text,
            'voice_id': voice_id,
            'emotion': emotion,
            'language': language,
            **kwargs,
        }
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.sha256(key_str.encode()).hexdigest()[:32]
    
    def get(
        self,
        text: str,
        voice_id: Optional[str] = None,
        emotion: str = "neutral",
        language: str = "en",
        **kwargs,
    ) -> Optional[np.ndarray]:
        """
        Get cached TTS result.
        
        Returns:
            Cached audio array or None if not found/expired
        """
        key = self._make_key(text, voice_id, emotion, language, **kwargs)
        
        with self._lock:
            entry = self._cache.get(key)
            
            if entry is None:
                self._misses += 1
                return None
            
            # Check TTL
            if time.time() - entry.created_at > self.ttl_seconds:
                del self._cache[key]
                del self._access_order[key]
                self._misses += 1
                return None
            
            # Update access time and hits
            entry.hits += 1
            self._access_order[key] = time.time()
            self._hits += 1
            
            return entry.audio.copy()
    
    def set(
        self,
        audio: np.ndarray,
        sample_rate: int,
        text: str,
        voice_id: Optional[str] = None,
        emotion: str = "neutral",
        language: str = "en",
        **kwargs,
    ):
        """
        Cache TTS result.
        
        Args:
            audio: Generated audio array
            sample_rate: Audio sample rate
            text: Original text
            voice_id: Voice used
            emotion: Emotion used
            language: Language used
        """
        key = self._make_key(text, voice_id, emotion, language, **kwargs)
        
        entry = CacheEntry(
            audio=audio.copy(),
            sample_rate=sample_rate,
            created_at=time.time(),
        )
        
        with self._lock:
            # Evict if needed
            self._evict_if_needed(entry)
            
            # Store
            self._cache[key] = entry
            self._access_order[key] = time.time()
    
    def _evict_if_needed(self, new_entry: CacheEntry):
        """Evict entries if cache is full."""
        new_size = new_entry.audio.nbytes
        
        # Check entry count
        while len(self._cache) >= self.max_entries:
            self._evict_lru()
        
        # Check memory
        current_size = sum(e.audio.nbytes for e in self._cache.values())
        while current_size + new_size > self.max_memory_bytes and self._cache:
            evicted = self._evict_lru()
            if evicted:
                current_size -= evicted.audio.nbytes
    
    def _evict_lru(self) -> Optional[CacheEntry]:
        """Evict least recently used entry."""
        if not self._access_order:
            return None
        
        # Find LRU key
        lru_key = min(self._access_order, key=self._access_order.get)
        
        entry = self._cache.pop(lru_key, None)
        self._access_order.pop(lru_key, None)
        
        return entry
    
    def clear(self):
        """Clear all cached entries."""
        with self._lock:
            self._cache.clear()
            self._access_order.clear()
    
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with self._lock:
            total_requests = self._hits + self._misses
            hit_rate = self._hits / total_requests if total_requests > 0 else 0
            
            return {
                "entries": len(self._cache),
                "memory_mb": sum(e.audio.nbytes for e in self._cache.values()) / (1024 * 1024),
                "hits": self._hits,
                "misses": self._misses,
                "hit_rate": hit_rate,
                "max_entries": self.max_entries,
                "max_memory_mb": self.max_memory_bytes / (1024 * 1024),
                "ttl_seconds": self.ttl_seconds,
            }


class RedisCache:
    """
    Redis-backed distributed cache for TTS results.
    Useful for multi-instance deployments.
    """
    
    def __init__(
        self,
        redis_url: str = "redis://localhost:6379",
        prefix: str = "tts:",
        ttl_seconds: int = 3600,
    ):
        if not HAS_REDIS:
            raise ImportError("redis package required for RedisCache")
        
        self.redis_url = redis_url
        self.prefix = prefix
        self.ttl_seconds = ttl_seconds
        
        self._client: Optional[redis.Redis] = None
    
    async def _get_client(self) -> redis.Redis:
        """Get or create Redis client."""
        if self._client is None:
            self._client = await redis.from_url(self.redis_url)
        return self._client
    
    def _make_key(
        self,
        text: str,
        voice_id: Optional[str],
        emotion: str,
        language: str,
        **kwargs,
    ) -> str:
        """Generate cache key."""
        key_data = {
            'text': text,
            'voice_id': voice_id,
            'emotion': emotion,
            'language': language,
            **kwargs,
        }
        key_str = json.dumps(key_data, sort_keys=True)
        key_hash = hashlib.sha256(key_str.encode()).hexdigest()[:32]
        return f"{self.prefix}{key_hash}"
    
    async def get(
        self,
        text: str,
        voice_id: Optional[str] = None,
        emotion: str = "neutral",
        language: str = "en",
        **kwargs,
    ) -> Optional[np.ndarray]:
        """Get cached TTS result from Redis."""
        try:
            client = await self._get_client()
            key = self._make_key(text, voice_id, emotion, language, **kwargs)
            
            data = await client.get(key)
            if data is None:
                return None
            
            entry = CacheEntry.from_bytes(data)
            return entry.audio
            
        except Exception as e:
            logger.warning(f"Redis cache get error: {e}")
            return None
    
    async def set(
        self,
        audio: np.ndarray,
        sample_rate: int,
        text: str,
        voice_id: Optional[str] = None,
        emotion: str = "neutral",
        language: str = "en",
        **kwargs,
    ):
        """Cache TTS result in Redis."""
        try:
            client = await self._get_client()
            key = self._make_key(text, voice_id, emotion, language, **kwargs)
            
            entry = CacheEntry(
                audio=audio,
                sample_rate=sample_rate,
                created_at=time.time(),
            )
            
            await client.setex(
                key,
                self.ttl_seconds,
                entry.to_bytes(),
            )
            
        except Exception as e:
            logger.warning(f"Redis cache set error: {e}")
    
    async def close(self):
        """Close Redis connection."""
        if self._client:
            await self._client.close()
            self._client = None


class CachedTTS:
    """
    TTS wrapper with automatic caching.
    """
    
    def __init__(
        self,
        tts_engine,
        cache: Optional[TTSCache] = None,
        redis_url: Optional[str] = None,
    ):
        self.tts = tts_engine
        
        # Use Redis if URL provided, otherwise local cache
        if redis_url and HAS_REDIS:
            self._redis_cache = RedisCache(redis_url)
            self._local_cache = None
        else:
            self._local_cache = cache or TTSCache()
            self._redis_cache = None
    
    async def synthesize(
        self,
        text: str,
        voice_id: Optional[str] = None,
        emotion: str = "neutral",
        language: str = "en",
        bypass_cache: bool = False,
        **kwargs,
    ) -> np.ndarray:
        """
        Synthesize with caching.
        
        Args:
            text: Text to synthesize
            voice_id: Voice ID
            emotion: Emotion
            language: Language
            bypass_cache: Skip cache lookup
            **kwargs: Additional TTS parameters
        """
        # Try cache first
        if not bypass_cache:
            cached = await self._get_cached(
                text, voice_id, emotion, language, **kwargs
            )
            if cached is not None:
                logger.debug(f"Cache hit for: {text[:30]}...")
                return cached
        
        # Generate
        from pipeline import Emotion
        
        audio = await self.tts.synthesize(
            text=text,
            speaker_id=voice_id,
            emotion=Emotion(emotion),
            language=language,
        )
        
        # Cache result
        await self._set_cached(
            audio,
            self.tts.config.sample_rate,
            text, voice_id, emotion, language,
            **kwargs,
        )
        
        return audio
    
    async def _get_cached(
        self,
        text: str,
        voice_id: Optional[str],
        emotion: str,
        language: str,
        **kwargs,
    ) -> Optional[np.ndarray]:
        """Get from cache."""
        if self._redis_cache:
            return await self._redis_cache.get(
                text, voice_id, emotion, language, **kwargs
            )
        elif self._local_cache:
            return self._local_cache.get(
                text, voice_id, emotion, language, **kwargs
            )
        return None
    
    async def _set_cached(
        self,
        audio: np.ndarray,
        sample_rate: int,
        text: str,
        voice_id: Optional[str],
        emotion: str,
        language: str,
        **kwargs,
    ):
        """Set in cache."""
        if self._redis_cache:
            await self._redis_cache.set(
                audio, sample_rate,
                text, voice_id, emotion, language,
                **kwargs,
            )
        elif self._local_cache:
            self._local_cache.set(
                audio, sample_rate,
                text, voice_id, emotion, language,
                **kwargs,
            )
    
    def cache_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        if self._local_cache:
            return self._local_cache.stats()
        return {"type": "redis", "status": "connected" if self._redis_cache else "disabled"}


# Global cache instance
_cache: Optional[TTSCache] = None


def get_cache() -> TTSCache:
    """Get global TTS cache."""
    global _cache
    if _cache is None:
        _cache = TTSCache()
    return _cache
