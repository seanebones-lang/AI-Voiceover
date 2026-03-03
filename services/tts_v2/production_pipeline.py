"""
Production TTS pipeline adapter.
Wraps HumanMirageTTS (pipeline) for server_v2. Canonical voice cloning for the main app is XTTS service (services/xtts).
"""

from dataclasses import dataclass
from typing import Optional, List, AsyncGenerator
import numpy as np
import logging

from .pipeline import HumanMirageTTS, Emotion, TTSConfig

logger = logging.getLogger(__name__)


@dataclass
class PipelineMetrics:
    """Simple metrics for health endpoint."""
    total_requests: int = 0
    total_errors: int = 0
    uptime_seconds: float = 0


class ProductionTTSPipeline:
    """
    Thin wrapper around HumanMirageTTS for server_v2 compatibility.
    Uses same engine as server.py (HumanMirageTTS).
    """

    def __init__(self, device: str = "cpu", **kwargs):
        self._device = device
        self._engine = HumanMirageTTS(device=device)
        self.config = self._engine.config
        self._metrics = PipelineMetrics()

    async def synthesize(
        self,
        text: str,
        speaker_ref: Optional[str] = None,
        emotion: Emotion = Emotion.NEUTRAL,
        language: str = "en",
        add_artifacts: bool = True,
        match_voice_quality: bool = False,
    ) -> np.ndarray:
        """Generate speech. speaker_ref maps to speaker_id."""
        return await self._engine.synthesize(
            text=text,
            speaker_id=speaker_ref,
            emotion=emotion,
            language=language,
        )

    async def synthesize_stream(
        self,
        text: str,
        speaker_ref: Optional[str] = None,
        emotion: Emotion = Emotion.NEUTRAL,
        language: str = "en",
    ) -> AsyncGenerator[bytes, None]:
        """Stream audio chunks."""
        async for chunk in self._engine.synthesize_stream(
            text=text,
            speaker_id=speaker_ref,
            emotion=emotion,
            language=language,
        ):
            yield chunk

    def clone_voice(
        self,
        name: str,
        audio_files: List[str],
        description: Optional[str] = None,
    ) -> tuple:
        """Clone voice; returns (voice_id, embedding). Embedding not stored in this adapter."""
        voice_id = self._engine.clone_voice(
            name=name,
            audio_files=audio_files,
            description=description,
        )
        return (voice_id, None)

    def get_metrics(self) -> PipelineMetrics:
        """Return simple metrics for health."""
        return self._metrics


def get_production_pipeline(
    device: str = "cpu",
    use_tensorrt: bool = False,
    use_flash_attention: bool = True,
    use_quantization: bool = False,
    enable_monitoring: bool = True,
) -> ProductionTTSPipeline:
    """Return a ProductionTTSPipeline instance. Optimizations flags are advisory (engine may ignore)."""
    return ProductionTTSPipeline(device=device)
