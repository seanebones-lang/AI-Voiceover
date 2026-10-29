"""
XTTS v2 engine for cloned voices and the built-in studio speakers.

Quality-relevant differences from calling `TTS.api.TTS.tts_to_file(speaker_wav=...)`:
- Conditioning latents are computed once per voice from *all* cleaned takes (balanced across
  takes, longer windows) and cached on disk, instead of recomputed per chunk from the first
  10 s of each file.
- Each segment is checked for runaway/truncated generations and re-sampled once if its
  duration is implausible for its text.
- Speed uses XTTS's native latent-rate control for moderate changes (no time-stretch smear).
"""

import hashlib
import logging
import os
import threading
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from engine_init import INIT_LOCK

logger = logging.getLogger(__name__)

SAMPLE_RATE = 24000
COND_SR = 22050  # XTTS conditioning encoders run at 22.05 kHz
MODEL_NAME = "tts_models/multilingual/multi-dataset/xtts_v2"
LATENT_CACHE_VERSION = "v2"

LANGUAGES = {
    "en": "en", "es": "es", "fr": "fr", "de": "de", "it": "it", "pt": "pt", "pl": "pl",
    "tr": "tr", "ru": "ru", "nl": "nl", "cs": "cs", "ar": "ar", "zh": "zh-cn", "ja": "ja",
    "ko": "ko", "hu": "hu", "hi": "hi",
}

# Rough speaking rates (chars/second at speed 1.0) used to catch runaway generations.
_CHARS_PER_SECOND = {"zh": 4.5, "ja": 6.0, "ko": 6.5}


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, str(default)))
    except ValueError:
        return default


GPT_COND_LEN = _env_int("XTTS_GPT_COND_LEN", 30)
GPT_COND_CHUNK_LEN = _env_int("XTTS_GPT_COND_CHUNK_LEN", 4)
MAX_REF_LEN = _env_int("XTTS_MAX_REF_LEN", 30)
NATIVE_SPEED_RANGE = (0.8, 1.25)


def resolve_model_dir() -> str:
    explicit = os.getenv("XTTS_MODEL_DIR")
    if explicit:
        return explicit
    from TTS.utils.manage import ModelManager

    return os.path.join(str(ModelManager(progress_bar=False).output_prefix), MODEL_NAME.replace("/", "--"))


def ensure_model_files(model_dir: str) -> str:
    """Return a directory holding config.json + model.pth, downloading once if allowed."""
    if os.path.exists(os.path.join(model_dir, "model.pth")):
        return model_dir
    if os.getenv("HF_HUB_OFFLINE") == "1" or os.getenv("VOICE_OFFLINE") == "1":
        raise FileNotFoundError(
            f"XTTS weights not found in {model_dir} and offline mode is on. "
            "Bake them into the image (prefetch_models.py) or set XTTS_MODEL_DIR."
        )
    from TTS.utils.manage import ModelManager

    path, _, _ = ModelManager().download_model(MODEL_NAME)
    return path if os.path.isdir(path) else os.path.dirname(path)


class XttsEngine:
    def __init__(self, device: str = "cpu"):
        self.device = device
        self.model = None
        self.load_error: Optional[str] = None
        self.loading = False
        self._lock = threading.Lock()
        self._infer_lock = threading.Lock()
        self._latents: Dict[str, Tuple[object, object]] = {}

    @property
    def ready(self) -> bool:
        return self.model is not None

    def load(self) -> None:
        with self._lock:
            if self.model is not None or self.loading:
                return
            self.loading = True
        try:
            with INIT_LOCK:
                import torch
                from TTS.tts.configs.xtts_config import XttsConfig
                from TTS.tts.models.xtts import Xtts

                model_dir = ensure_model_files(resolve_model_dir())
                config = XttsConfig()
                config.load_json(os.path.join(model_dir, "config.json"))
                model = Xtts.init_from_config(config)
                model.load_checkpoint(config, checkpoint_dir=model_dir, eval=True, use_deepspeed=False)
                model.to(self.device)
            if self.device == "cpu":
                torch.set_num_threads(max(1, _env_int("XTTS_CPU_THREADS", os.cpu_count() or 1)))
            self.model = model
            self.load_error = None
            logger.info("XTTS v2 loaded from %s on %s", model_dir, self.device)
        except Exception as e:  # pragma: no cover - depends on runtime install
            self.load_error = f"XTTS failed to load: {e}"
            logger.error(self.load_error)
        finally:
            self.loading = False

    # ------------------------------------------------------------ speakers

    def studio_speakers(self) -> List[str]:
        if not self.ready or not getattr(self.model, "speaker_manager", None):
            return []
        return sorted(self.model.speaker_manager.speakers.keys())

    def studio_latents(self, name: str):
        speakers = self.model.speaker_manager.speakers if self.ready and self.model.speaker_manager else {}
        if name not in speakers:
            raise KeyError(f"XTTS studio speaker not found: {name}")
        s = speakers[name]
        return s["gpt_cond_latent"], s["speaker_embedding"]

    @staticmethod
    def latent_key(ref_paths: Sequence[str]) -> str:
        h = hashlib.sha1(LATENT_CACHE_VERSION.encode())
        h.update(f"{GPT_COND_LEN}:{GPT_COND_CHUNK_LEN}:{MAX_REF_LEN}".encode())
        for p in ref_paths:
            st = os.stat(p)
            h.update(f"{os.path.basename(p)}:{st.st_size}:{int(st.st_mtime)}".encode())
        return h.hexdigest()[:16]

    def voice_latents(self, voice_id: str, ref_paths: Sequence[str], cache_dir: Optional[str] = None):
        """Conditioning latents for a cloned voice: memory cache → disk cache → compute."""
        import torch

        key = self.latent_key(ref_paths)
        mem_key = f"{voice_id}:{key}"
        if mem_key in self._latents:
            return self._latents[mem_key]
        cache_file = os.path.join(cache_dir, f"latents_{key}.pt") if cache_dir else None
        if cache_file and os.path.exists(cache_file):
            try:
                data = torch.load(cache_file, map_location="cpu", weights_only=True)
                latents = (data["gpt_cond_latent"], data["speaker_embedding"])
                self._latents[mem_key] = latents
                return latents
            except Exception as e:
                logger.warning("Ignoring unreadable latent cache %s: %s", cache_file, e)
        latents = self.compute_latents(ref_paths)
        self._latents[mem_key] = latents
        if cache_file:
            try:
                for old in os.listdir(cache_dir):
                    if old.startswith("latents_") and old.endswith(".pt"):
                        os.unlink(os.path.join(cache_dir, old))
                torch.save({"gpt_cond_latent": latents[0], "speaker_embedding": latents[1]}, cache_file)
            except OSError as e:
                logger.warning("Could not persist latents for %s: %s", voice_id, e)
        return latents

    def forget(self, voice_id: str) -> None:
        for k in [k for k in self._latents if k.startswith(f"{voice_id}:")]:
            del self._latents[k]

    def compute_latents(self, ref_paths: Sequence[str]):
        """
        Speaker embedding: mean over every take (each up to MAX_REF_LEN s), weighted by length.
        GPT style latent: built from a balanced slice of each take so all takes contribute,
        GPT_COND_LEN seconds total, averaged over GPT_COND_CHUNK_LEN-second windows.
        """
        import torch
        from audio_utils import decode_audio

        if not self.ready:
            raise RuntimeError(self.load_error or "XTTS is not loaded")
        takes = []
        for p in ref_paths:
            wav = decode_audio(p, COND_SR)
            if len(wav) >= COND_SR * 0.5:
                takes.append(wav[: COND_SR * MAX_REF_LEN])
        if not takes:
            raise ValueError("No usable reference audio (each take must have at least 0.5 s of audio)")

        with self._infer_lock, torch.inference_mode():
            embs, weights = [], []
            for t in takes:
                audio = torch.from_numpy(t).unsqueeze(0).to(self.device)
                embs.append(self.model.get_speaker_embedding(audio, COND_SR))
                weights.append(len(t))
            w = torch.tensor(weights, dtype=embs[0].dtype, device=embs[0].device)
            speaker_embedding = (torch.stack(embs) * (w / w.sum()).view(-1, 1, 1, 1)).sum(0)
            # Re-normalize: the decoder was trained on L2-normalized speaker vectors.
            speaker_embedding = speaker_embedding / speaker_embedding.norm(dim=1, keepdim=True).clamp_min(1e-8)

            budget = COND_SR * GPT_COND_LEN
            share = budget // len(takes)
            parts, leftover = [], 0
            for t in sorted(takes, key=len):
                take = t[: share + leftover]
                leftover = share + leftover - len(take)
                parts.append(take)
            full = torch.from_numpy(np.concatenate(parts)).unsqueeze(0)
            gpt_cond_latent = self.model.get_gpt_cond_latents(
                full, COND_SR, length=GPT_COND_LEN, chunk_length=GPT_COND_CHUNK_LEN
            )
        return gpt_cond_latent.cpu(), speaker_embedding.cpu()

    # ------------------------------------------------------------ synthesis

    @staticmethod
    def expected_seconds(text: str, lang: str, speed: float) -> float:
        cps = _CHARS_PER_SECOND.get(lang, 14.0) * max(0.5, speed)
        return max(0.6, len(text) / cps)

    @classmethod
    def _plausible(cls, n_samples: int, text: str, lang: str, speed: float) -> bool:
        expected = cls.expected_seconds(text, lang, speed)
        dur = n_samples / SAMPLE_RATE
        return (expected * 0.33) <= dur <= (expected * 2.3 + 1.5)

    def synthesize(
        self,
        text: str,
        language: str,
        latents,
        temperature: float,
        repetition_penalty: float,
        top_k: int,
        top_p: float,
        speed: float = 1.0,
    ) -> Tuple[np.ndarray, float]:
        """Synthesize one segment. Returns (wav @ 24 kHz, residual tempo factor still to apply)."""
        import torch

        if not self.ready:
            raise RuntimeError(self.load_error or "XTTS is not loaded")
        lang = (language or "en").split("-")[0].lower()
        xlang = LANGUAGES.get(lang)
        if not xlang:
            raise ValueError(f"XTTS does not support language '{language}'")
        native = float(np.clip(speed, *NATIVE_SPEED_RANGE))
        residual = speed / native
        gpt_cond_latent, speaker_embedding = latents

        best = None
        attempts = 2
        for attempt in range(attempts):
            # Runaway output (babble, endless "uhh") comes from weak repetition control, so the
            # retry tightens both knobs instead of only re-rolling the same distribution.
            temp = temperature if attempt == 0 else max(0.35, temperature - 0.1)
            rep = repetition_penalty if attempt == 0 else max(repetition_penalty, 5.0)
            with self._infer_lock, torch.inference_mode():
                out = self.model.inference(
                    text,
                    xlang,
                    gpt_cond_latent,
                    speaker_embedding,
                    temperature=temp,
                    length_penalty=1.0,
                    repetition_penalty=rep,
                    top_k=int(top_k),
                    top_p=top_p,
                    speed=native,
                    enable_text_splitting=False,
                )
            wav = np.asarray(out["wav"], dtype=np.float32).reshape(-1)
            if self._plausible(len(wav), text, lang, native):
                return wav, residual
            logger.warning(
                "XTTS segment duration implausible (%.1fs for %d chars, attempt %d); re-sampling",
                len(wav) / SAMPLE_RATE, len(text), attempt + 1,
            )
            target = self.expected_seconds(text, lang, native) * SAMPLE_RATE
            if best is None or abs(len(wav) - target) < abs(len(best) - target):
                best = wav
        return best, residual
