"""
HumanMirage TTS - Production Monitoring
Metrics collection, health checks, and alerting
"""

import time
import asyncio
import threading
from typing import Dict, Any, Optional, List, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from collections import deque
import json
import logging

logger = logging.getLogger(__name__)


@dataclass
class MetricPoint:
    """Single metric data point."""
    timestamp: datetime
    value: float
    labels: Dict[str, str] = field(default_factory=dict)


class MetricsCollector:
    """
    Collect and aggregate TTS metrics.
    
    Tracks:
    - Request latency (p50, p95, p99)
    - Generation throughput
    - Error rates
    - Audio duration generated
    - Active connections
    """
    
    def __init__(self, max_points: int = 10000):
        self.max_points = max_points
        self._lock = threading.Lock()
        
        # Metric storage
        self._latency: deque = deque(maxlen=max_points)
        self._first_chunk_latency: deque = deque(maxlen=max_points)
        self._requests: deque = deque(maxlen=max_points)
        self._errors: deque = deque(maxlen=max_points)
        self._audio_duration: deque = deque(maxlen=max_points)
        
        # Counters
        self._total_requests = 0
        self._total_errors = 0
        self._total_audio_seconds = 0.0
        self._active_requests = 0
        
        # Start time
        self._start_time = datetime.now()
    
    def record_request(
        self,
        latency_ms: float,
        audio_duration_s: float,
        first_chunk_ms: Optional[float] = None,
        labels: Optional[Dict[str, str]] = None,
    ):
        """Record a successful TTS request."""
        now = datetime.now()
        labels = labels or {}
        
        with self._lock:
            self._latency.append(MetricPoint(now, latency_ms, labels))
            self._requests.append(MetricPoint(now, 1, labels))
            self._audio_duration.append(MetricPoint(now, audio_duration_s, labels))
            
            if first_chunk_ms is not None:
                self._first_chunk_latency.append(MetricPoint(now, first_chunk_ms, labels))
            
            self._total_requests += 1
            self._total_audio_seconds += audio_duration_s
    
    def record_error(
        self,
        error_type: str = "unknown",
        labels: Optional[Dict[str, str]] = None,
    ):
        """Record an error."""
        now = datetime.now()
        labels = labels or {}
        labels["error_type"] = error_type
        
        with self._lock:
            self._errors.append(MetricPoint(now, 1, labels))
            self._total_errors += 1
    
    def increment_active(self):
        """Increment active request counter."""
        with self._lock:
            self._active_requests += 1
    
    def decrement_active(self):
        """Decrement active request counter."""
        with self._lock:
            self._active_requests = max(0, self._active_requests - 1)
    
    def _percentile(self, data: deque, p: float) -> float:
        """Calculate percentile from deque of MetricPoints."""
        if not data:
            return 0.0
        
        values = sorted(point.value for point in data)
        idx = int(len(values) * p / 100)
        return values[min(idx, len(values) - 1)]
    
    def _rate(self, data: deque, window_seconds: float = 60) -> float:
        """Calculate rate over time window."""
        if not data:
            return 0.0
        
        cutoff = datetime.now() - timedelta(seconds=window_seconds)
        recent = sum(1 for p in data if p.timestamp > cutoff)
        return recent / window_seconds
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get current metrics snapshot."""
        with self._lock:
            uptime = (datetime.now() - self._start_time).total_seconds()
            
            return {
                "uptime_seconds": uptime,
                "total_requests": self._total_requests,
                "total_errors": self._total_errors,
                "total_audio_seconds": self._total_audio_seconds,
                "active_requests": self._active_requests,
                "error_rate": self._total_errors / max(1, self._total_requests),
                "latency": {
                    "p50_ms": self._percentile(self._latency, 50),
                    "p95_ms": self._percentile(self._latency, 95),
                    "p99_ms": self._percentile(self._latency, 99),
                },
                "first_chunk_latency": {
                    "p50_ms": self._percentile(self._first_chunk_latency, 50),
                    "p95_ms": self._percentile(self._first_chunk_latency, 95),
                },
                "throughput": {
                    "requests_per_second": self._rate(self._requests, 60),
                    "audio_seconds_per_minute": sum(
                        p.value for p in self._audio_duration
                        if p.timestamp > datetime.now() - timedelta(seconds=60)
                    ),
                },
            }
    
    def get_prometheus_metrics(self) -> str:
        """Get metrics in Prometheus format."""
        metrics = self.get_metrics()
        
        lines = [
            "# HELP tts_requests_total Total TTS requests",
            "# TYPE tts_requests_total counter",
            f'tts_requests_total {metrics["total_requests"]}',
            "",
            "# HELP tts_errors_total Total TTS errors",
            "# TYPE tts_errors_total counter",
            f'tts_errors_total {metrics["total_errors"]}',
            "",
            "# HELP tts_audio_seconds_total Total audio generated in seconds",
            "# TYPE tts_audio_seconds_total counter",
            f'tts_audio_seconds_total {metrics["total_audio_seconds"]:.2f}',
            "",
            "# HELP tts_active_requests Current active requests",
            "# TYPE tts_active_requests gauge",
            f'tts_active_requests {metrics["active_requests"]}',
            "",
            "# HELP tts_latency_milliseconds TTS latency in milliseconds",
            "# TYPE tts_latency_milliseconds summary",
            f'tts_latency_milliseconds{{quantile="0.5"}} {metrics["latency"]["p50_ms"]:.2f}',
            f'tts_latency_milliseconds{{quantile="0.95"}} {metrics["latency"]["p95_ms"]:.2f}',
            f'tts_latency_milliseconds{{quantile="0.99"}} {metrics["latency"]["p99_ms"]:.2f}',
            "",
            "# HELP tts_first_chunk_latency_milliseconds First chunk latency for streaming",
            "# TYPE tts_first_chunk_latency_milliseconds summary",
            f'tts_first_chunk_latency_milliseconds{{quantile="0.5"}} {metrics["first_chunk_latency"]["p50_ms"]:.2f}',
            f'tts_first_chunk_latency_milliseconds{{quantile="0.95"}} {metrics["first_chunk_latency"]["p95_ms"]:.2f}',
        ]
        
        return "\n".join(lines)


@dataclass
class HealthStatus:
    """Health check status."""
    healthy: bool
    checks: Dict[str, bool]
    details: Dict[str, Any]
    timestamp: datetime = field(default_factory=datetime.now)


class HealthChecker:
    """
    Comprehensive health checking.
    
    Checks:
    - TTS engine loaded
    - Model responsive
    - Database accessible
    - Memory usage
    - GPU availability
    """
    
    def __init__(self, engine=None, speaker_db=None):
        self.engine = engine
        self.speaker_db = speaker_db
        self._last_check: Optional[HealthStatus] = None
        self._check_interval = 30  # seconds
        self._last_check_time = 0
    
    async def check(self, force: bool = False) -> HealthStatus:
        """Run health checks."""
        now = time.time()
        
        # Use cached result if recent
        if not force and self._last_check and (now - self._last_check_time) < self._check_interval:
            return self._last_check
        
        checks = {}
        details = {}
        
        # Check engine
        checks["engine_loaded"] = self.engine is not None
        
        # Check model responsiveness
        checks["model_responsive"] = await self._check_model()
        
        # Check database
        checks["database_accessible"] = self._check_database()
        
        # Check memory
        memory_ok, memory_info = self._check_memory()
        checks["memory_ok"] = memory_ok
        details["memory"] = memory_info
        
        # Check GPU
        gpu_ok, gpu_info = self._check_gpu()
        checks["gpu_available"] = gpu_ok
        details["gpu"] = gpu_info
        
        # Overall health
        healthy = all(checks.values())
        
        status = HealthStatus(
            healthy=healthy,
            checks=checks,
            details=details,
        )
        
        self._last_check = status
        self._last_check_time = now
        
        return status
    
    async def _check_model(self) -> bool:
        """Check if model is responsive."""
        if self.engine is None:
            return False
        
        try:
            # Generate short test audio
            audio = await asyncio.wait_for(
                self.engine.synthesize("test"),
                timeout=10.0
            )
            return audio is not None and len(audio) > 0
        except Exception as e:
            logger.error(f"Model check failed: {e}")
            return False
    
    def _check_database(self) -> bool:
        """Check database accessibility."""
        if self.speaker_db is None:
            return True  # No DB configured, skip check
        
        try:
            self.speaker_db.list_speakers()
            return True
        except Exception as e:
            logger.error(f"Database check failed: {e}")
            return False
    
    def _check_memory(self) -> tuple:
        """Check memory usage."""
        try:
            import psutil
            
            memory = psutil.virtual_memory()
            info = {
                "total_gb": memory.total / (1024**3),
                "available_gb": memory.available / (1024**3),
                "percent_used": memory.percent,
            }
            
            # Warn if >90% used
            ok = memory.percent < 90
            return ok, info
            
        except ImportError:
            return True, {"error": "psutil not installed"}
    
    def _check_gpu(self) -> tuple:
        """Check GPU availability and memory."""
        try:
            import torch
            
            if not torch.cuda.is_available():
                return False, {"error": "CUDA not available"}
            
            device_count = torch.cuda.device_count()
            devices = []
            
            for i in range(device_count):
                props = torch.cuda.get_device_properties(i)
                memory_total = props.total_memory / (1024**3)
                memory_allocated = torch.cuda.memory_allocated(i) / (1024**3)
                
                devices.append({
                    "name": props.name,
                    "total_memory_gb": memory_total,
                    "allocated_memory_gb": memory_allocated,
                    "utilization_percent": (memory_allocated / memory_total) * 100,
                })
            
            return True, {"devices": devices}
            
        except Exception as e:
            return False, {"error": str(e)}


# Global metrics instance
_metrics: Optional[MetricsCollector] = None


def get_metrics() -> MetricsCollector:
    """Get global metrics collector."""
    global _metrics
    if _metrics is None:
        _metrics = MetricsCollector()
    return _metrics


# Context manager for request tracking
class RequestTracker:
    """Context manager for tracking request metrics."""
    
    def __init__(self, labels: Optional[Dict[str, str]] = None):
        self.labels = labels or {}
        self.start_time: float = 0
        self.first_chunk_time: Optional[float] = None
        self.audio_duration: float = 0
        self._metrics = get_metrics()
    
    def __enter__(self):
        self.start_time = time.perf_counter()
        self._metrics.increment_active()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        self._metrics.decrement_active()
        
        if exc_type is not None:
            # Error occurred
            self._metrics.record_error(
                error_type=exc_type.__name__,
                labels=self.labels,
            )
        else:
            # Success
            latency_ms = (time.perf_counter() - self.start_time) * 1000
            first_chunk_ms = None
            
            if self.first_chunk_time is not None:
                first_chunk_ms = (self.first_chunk_time - self.start_time) * 1000
            
            self._metrics.record_request(
                latency_ms=latency_ms,
                audio_duration_s=self.audio_duration,
                first_chunk_ms=first_chunk_ms,
                labels=self.labels,
            )
    
    def record_first_chunk(self):
        """Record when first audio chunk was generated."""
        if self.first_chunk_time is None:
            self.first_chunk_time = time.perf_counter()
    
    def set_audio_duration(self, duration: float):
        """Set the audio duration generated."""
        self.audio_duration = duration


# Async context manager version
class AsyncRequestTracker(RequestTracker):
    """Async context manager for tracking request metrics."""
    
    async def __aenter__(self):
        return self.__enter__()
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        return self.__exit__(exc_type, exc_val, exc_tb)
