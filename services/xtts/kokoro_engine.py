"""
Kokoro-82M (Apache-2.0) stock-voice engine. Runs fully on-box; weights come from the local
Hugging Face cache (prefetched at image build, HF_HUB_OFFLINE=1 at runtime).
"""

import logging
import os
import threading
from typing import Dict, Optional

import numpy as np

logger = logging.getLogger(__name__)

SAMPLE_RATE = 24000
REPO_ID = os.getenv("KOKORO_REPO_ID", "hexgrad/Kokoro-82M")

# Kokoro voice prefix → misaki/KPipeline language code.
VOICE_LANG_CODES = {"a": "a", "b": "b", "e": "e", "f": "f", "h": "h", "i": "i", "j": "j", "p": "p", "z": "z"}
PHONEME_MARKUP_LANGS = {"a", "b"}  # misaki English G2P understands [word](/phonemes/)


class KokoroEngine:
    def __init__(self, device: str = "cpu"):
        self.device = device
        self.model = None
        self.load_error: Optional[str] = None
        self.loading = False
        self._pipelines: Dict[str, object] = {}
        self._pipeline_errors: Dict[str, str] = {}
        self._lock = threading.Lock()
        self._infer_lock = threading.Lock()

    @property
    def ready(self) -> bool:
        return self.model is not None

    def load(self) -> None:
        with self._lock:
            if self.model is not None or self.loading:
                return
            self.loading = True
        try:
            from kokoro import KModel

            model = KModel(repo_id=REPO_ID).to(self.device).eval()
            self.model = model
            self.load_error = None
            logger.info("Kokoro loaded (%s)", self.device)
        except Exception as e:  # pragma: no cover - depends on runtime install
            self.load_error = f"Kokoro failed to load: {e}"
            logger.error(self.load_error)
        finally:
            self.loading = False

    def _pipeline(self, lang_code: str):
        if lang_code in self._pipelines:
            return self._pipelines[lang_code]
        if lang_code in self._pipeline_errors:
            raise RuntimeError(self._pipeline_errors[lang_code])
        from kokoro import KPipeline

        try:
            pipe = KPipeline(lang_code=lang_code, repo_id=REPO_ID, model=self.model)
        except Exception as e:
            msg = f"Kokoro language pack '{lang_code}' unavailable: {e}"
            self._pipeline_errors[lang_code] = msg
            raise RuntimeError(msg) from e
        self._pipelines[lang_code] = pipe
        return pipe

    @staticmethod
    def lang_code_for(voice: str) -> str:
        code = VOICE_LANG_CODES.get((voice or "a")[0].lower())
        if not code:
            raise ValueError(f"Unknown Kokoro voice: {voice}")
        return code

    def warm(self, voices) -> None:
        """Load language pipelines and voice packs ahead of the first request."""
        for v in voices:
            try:
                pipe = self._pipeline(self.lang_code_for(v))
                pipe.load_voice(v)
            except Exception as e:
                logger.warning("Kokoro warm-up skipped %s: %s", v, e)

    def synthesize(self, text: str, voice: str, speed: float = 1.0) -> np.ndarray:
        if not self.ready:
            raise RuntimeError(self.load_error or "Kokoro is not loaded")
        pipe = self._pipeline(self.lang_code_for(voice))
        pieces = []
        with self._infer_lock:
            # split_pattern=None: the caller already segments text; Kokoro still splits
            # anything over its 510-token window on its own.
            for result in pipe(text, voice=voice, speed=float(speed), split_pattern=None):
                audio = result.audio
                if audio is None:
                    continue
                arr = audio.detach().cpu().numpy() if hasattr(audio, "detach") else np.asarray(audio)
                pieces.append(arr.astype(np.float32))
        if not pieces:
            raise RuntimeError("Kokoro produced no audio (text may contain no speakable characters)")
        return np.concatenate(pieces)
