"""
HumanMirage TTS - API Key Management
Multi-tenant authentication and usage tracking
"""

import secrets
import hashlib
import time
from typing import Optional, Dict, List, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import json
import logging
import sqlite3
from pathlib import Path

logger = logging.getLogger(__name__)


class Plan(str, Enum):
    """Subscription plans."""
    FREE = "free"
    STARTER = "starter"
    PRO = "pro"
    ENTERPRISE = "enterprise"


@dataclass
class PlanLimits:
    """Rate limits per plan."""
    requests_per_minute: int
    requests_per_day: int
    max_text_length: int
    max_voices: int
    features: List[str]


# Plan configurations
PLAN_LIMITS: Dict[Plan, PlanLimits] = {
    Plan.FREE: PlanLimits(
        requests_per_minute=5,
        requests_per_day=100,
        max_text_length=500,
        max_voices=2,
        features=["basic_tts", "basic_emotions"],
    ),
    Plan.STARTER: PlanLimits(
        requests_per_minute=20,
        requests_per_day=1000,
        max_text_length=2000,
        max_voices=5,
        features=["basic_tts", "all_emotions", "voice_cloning"],
    ),
    Plan.PRO: PlanLimits(
        requests_per_minute=60,
        requests_per_day=10000,
        max_text_length=5000,
        max_voices=20,
        features=["basic_tts", "all_emotions", "voice_cloning", "streaming", "batch", "effects"],
    ),
    Plan.ENTERPRISE: PlanLimits(
        requests_per_minute=300,
        requests_per_day=100000,
        max_text_length=50000,
        max_voices=100,
        features=["all"],
    ),
}


@dataclass
class APIKey:
    """API key record."""
    key_id: str              # Public identifier (prefix of key)
    key_hash: str            # SHA256 hash of full key
    name: str                # User-provided name
    user_id: str             # Owner user ID
    plan: Plan
    created_at: datetime
    last_used_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    is_active: bool = True
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class UsageRecord:
    """API usage record."""
    key_id: str
    timestamp: datetime
    endpoint: str
    text_length: int
    audio_duration: float
    latency_ms: float
    success: bool
    error: Optional[str] = None


class APIKeyManager:
    """
    Manage API keys and usage tracking.
    
    Features:
    - Key generation and validation
    - Plan-based rate limiting
    - Usage tracking and analytics
    - Key rotation
    """
    
    def __init__(self, db_path: str = "data/api_keys.db"):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._init_db()
        
        # In-memory rate limit tracking
        self._rate_limits: Dict[str, List[float]] = {}
    
    def _init_db(self):
        """Initialize database schema."""
        conn = sqlite3.connect(str(self.db_path))
        
        conn.execute("""
            CREATE TABLE IF NOT EXISTS api_keys (
                key_id TEXT PRIMARY KEY,
                key_hash TEXT NOT NULL UNIQUE,
                name TEXT NOT NULL,
                user_id TEXT NOT NULL,
                plan TEXT NOT NULL,
                created_at TEXT NOT NULL,
                last_used_at TEXT,
                expires_at TEXT,
                is_active INTEGER DEFAULT 1,
                metadata TEXT
            )
        """)
        
        conn.execute("""
            CREATE TABLE IF NOT EXISTS usage_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                key_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                endpoint TEXT NOT NULL,
                text_length INTEGER,
                audio_duration REAL,
                latency_ms REAL,
                success INTEGER,
                error TEXT,
                FOREIGN KEY (key_id) REFERENCES api_keys (key_id)
            )
        """)
        
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_usage_key_time 
            ON usage_records (key_id, timestamp)
        """)
        
        conn.commit()
        conn.close()
    
    def _get_conn(self) -> sqlite3.Connection:
        return sqlite3.connect(str(self.db_path))
    
    def create_key(
        self,
        name: str,
        user_id: str,
        plan: Plan = Plan.FREE,
        expires_in_days: Optional[int] = None,
        metadata: Optional[Dict] = None,
    ) -> str:
        """
        Create a new API key.
        
        Returns:
            Full API key (only shown once!)
        """
        # Generate secure key
        full_key = f"hm_{''.join(secrets.token_hex(24))}"
        key_id = full_key[:12]  # Public prefix
        key_hash = hashlib.sha256(full_key.encode()).hexdigest()
        
        # Expiration
        expires_at = None
        if expires_in_days:
            expires_at = datetime.now() + timedelta(days=expires_in_days)
        
        # Store
        conn = self._get_conn()
        conn.execute(
            """
            INSERT INTO api_keys 
            (key_id, key_hash, name, user_id, plan, created_at, expires_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                key_id,
                key_hash,
                name,
                user_id,
                plan.value,
                datetime.now().isoformat(),
                expires_at.isoformat() if expires_at else None,
                json.dumps(metadata or {}),
            )
        )
        conn.commit()
        conn.close()
        
        logger.info(f"Created API key: {key_id} for user {user_id}")
        
        return full_key
    
    def validate_key(self, api_key: str) -> Optional[APIKey]:
        """
        Validate an API key.
        
        Returns:
            APIKey object if valid, None if invalid
        """
        if not api_key or not api_key.startswith("hm_"):
            return None
        
        key_hash = hashlib.sha256(api_key.encode()).hexdigest()
        
        conn = self._get_conn()
        cursor = conn.execute(
            """
            SELECT key_id, key_hash, name, user_id, plan, 
                   created_at, last_used_at, expires_at, is_active, metadata
            FROM api_keys WHERE key_hash = ?
            """,
            (key_hash,)
        )
        row = cursor.fetchone()
        conn.close()
        
        if not row:
            return None
        
        key = APIKey(
            key_id=row[0],
            key_hash=row[1],
            name=row[2],
            user_id=row[3],
            plan=Plan(row[4]),
            created_at=datetime.fromisoformat(row[5]),
            last_used_at=datetime.fromisoformat(row[6]) if row[6] else None,
            expires_at=datetime.fromisoformat(row[7]) if row[7] else None,
            is_active=bool(row[8]),
            metadata=json.loads(row[9]) if row[9] else {},
        )
        
        # Check if active
        if not key.is_active:
            return None
        
        # Check expiration
        if key.expires_at and datetime.now() > key.expires_at:
            return None
        
        return key
    
    def check_rate_limit(self, api_key: APIKey) -> tuple[bool, Dict[str, Any]]:
        """
        Check if request is within rate limits.
        
        Returns:
            (allowed, info_dict)
        """
        limits = PLAN_LIMITS[api_key.plan]
        now = time.time()
        
        # Get request timestamps for this key
        if api_key.key_id not in self._rate_limits:
            self._rate_limits[api_key.key_id] = []
        
        timestamps = self._rate_limits[api_key.key_id]
        
        # Clean old timestamps
        minute_ago = now - 60
        day_ago = now - 86400
        timestamps[:] = [t for t in timestamps if t > day_ago]
        
        # Count requests
        requests_last_minute = sum(1 for t in timestamps if t > minute_ago)
        requests_last_day = len(timestamps)
        
        # Check limits
        info = {
            "requests_last_minute": requests_last_minute,
            "requests_last_day": requests_last_day,
            "limit_per_minute": limits.requests_per_minute,
            "limit_per_day": limits.requests_per_day,
            "remaining_minute": max(0, limits.requests_per_minute - requests_last_minute),
            "remaining_day": max(0, limits.requests_per_day - requests_last_day),
        }
        
        if requests_last_minute >= limits.requests_per_minute:
            info["retry_after"] = 60
            return False, info
        
        if requests_last_day >= limits.requests_per_day:
            info["retry_after"] = 86400
            return False, info
        
        return True, info
    
    def record_usage(
        self,
        api_key: APIKey,
        endpoint: str,
        text_length: int,
        audio_duration: float,
        latency_ms: float,
        success: bool,
        error: Optional[str] = None,
    ):
        """Record API usage."""
        now = time.time()
        
        # Update rate limit tracking
        if api_key.key_id not in self._rate_limits:
            self._rate_limits[api_key.key_id] = []
        self._rate_limits[api_key.key_id].append(now)
        
        # Update last_used_at
        conn = self._get_conn()
        conn.execute(
            "UPDATE api_keys SET last_used_at = ? WHERE key_id = ?",
            (datetime.now().isoformat(), api_key.key_id)
        )
        
        # Store usage record
        conn.execute(
            """
            INSERT INTO usage_records 
            (key_id, timestamp, endpoint, text_length, audio_duration, latency_ms, success, error)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                api_key.key_id,
                datetime.now().isoformat(),
                endpoint,
                text_length,
                audio_duration,
                latency_ms,
                int(success),
                error,
            )
        )
        conn.commit()
        conn.close()
    
    def get_usage_stats(
        self,
        key_id: str,
        days: int = 30,
    ) -> Dict[str, Any]:
        """Get usage statistics for an API key."""
        since = (datetime.now() - timedelta(days=days)).isoformat()
        
        conn = self._get_conn()
        
        # Total requests
        cursor = conn.execute(
            """
            SELECT 
                COUNT(*) as total_requests,
                SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successful,
                SUM(text_length) as total_characters,
                SUM(audio_duration) as total_audio_seconds,
                AVG(latency_ms) as avg_latency_ms
            FROM usage_records
            WHERE key_id = ? AND timestamp > ?
            """,
            (key_id, since)
        )
        row = cursor.fetchone()
        
        # Daily breakdown
        cursor = conn.execute(
            """
            SELECT 
                DATE(timestamp) as date,
                COUNT(*) as requests,
                SUM(audio_duration) as audio_seconds
            FROM usage_records
            WHERE key_id = ? AND timestamp > ?
            GROUP BY DATE(timestamp)
            ORDER BY date
            """,
            (key_id, since)
        )
        daily = [{"date": r[0], "requests": r[1], "audio_seconds": r[2]} for r in cursor.fetchall()]
        
        conn.close()
        
        return {
            "period_days": days,
            "total_requests": row[0] or 0,
            "successful_requests": row[1] or 0,
            "total_characters": row[2] or 0,
            "total_audio_seconds": row[3] or 0,
            "avg_latency_ms": row[4] or 0,
            "daily_breakdown": daily,
        }
    
    def list_keys(self, user_id: str) -> List[Dict]:
        """List all API keys for a user."""
        conn = self._get_conn()
        cursor = conn.execute(
            """
            SELECT key_id, name, plan, created_at, last_used_at, is_active
            FROM api_keys WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user_id,)
        )
        
        keys = []
        for row in cursor.fetchall():
            keys.append({
                "key_id": row[0],
                "name": row[1],
                "plan": row[2],
                "created_at": row[3],
                "last_used_at": row[4],
                "is_active": bool(row[5]),
            })
        
        conn.close()
        return keys
    
    def revoke_key(self, key_id: str) -> bool:
        """Revoke an API key."""
        conn = self._get_conn()
        cursor = conn.execute(
            "UPDATE api_keys SET is_active = 0 WHERE key_id = ?",
            (key_id,)
        )
        success = cursor.rowcount > 0
        conn.commit()
        conn.close()
        
        if success:
            logger.info(f"Revoked API key: {key_id}")
        
        return success
    
    def rotate_key(self, old_key: str, name: str) -> Optional[str]:
        """
        Rotate an API key (create new, revoke old).
        
        Returns:
            New API key or None if old key invalid
        """
        old_api_key = self.validate_key(old_key)
        if not old_api_key:
            return None
        
        # Create new key with same settings
        new_key = self.create_key(
            name=name,
            user_id=old_api_key.user_id,
            plan=old_api_key.plan,
            metadata=old_api_key.metadata,
        )
        
        # Revoke old key
        self.revoke_key(old_api_key.key_id)
        
        return new_key


# Middleware helper
def require_api_key(manager: APIKeyManager):
    """
    FastAPI dependency for API key authentication.
    """
    from fastapi import Header, HTTPException, Request
    
    async def verify_key(
        request: Request,
        x_api_key: str = Header(None, alias="X-API-Key"),
        authorization: str = Header(None),
    ):
        # Get key from header
        api_key = x_api_key
        if not api_key and authorization:
            if authorization.startswith("Bearer "):
                api_key = authorization[7:]
        
        if not api_key:
            raise HTTPException(401, "API key required")
        
        # Validate
        key = manager.validate_key(api_key)
        if not key:
            raise HTTPException(401, "Invalid API key")
        
        # Check rate limit
        allowed, info = manager.check_rate_limit(key)
        if not allowed:
            raise HTTPException(
                429,
                detail={
                    "error": "Rate limit exceeded",
                    **info,
                },
                headers={"Retry-After": str(info.get("retry_after", 60))},
            )
        
        # Store in request state for later use
        request.state.api_key = key
        request.state.rate_limit_info = info
        
        return key
    
    return verify_key


# Global instance
_manager: Optional[APIKeyManager] = None


def get_api_key_manager() -> APIKeyManager:
    """Get API key manager singleton."""
    global _manager
    if _manager is None:
        _manager = APIKeyManager()
    return _manager
