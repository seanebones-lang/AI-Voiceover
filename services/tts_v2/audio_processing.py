"""
HumanMirage TTS - Audio Post-Processing
Normalization, noise reduction, and enhancement
"""

import numpy as np
from typing import Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# Try to import optional libraries
try:
    import scipy.signal
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False

try:
    import noisereduce as nr
    HAS_NOISEREDUCE = True
except ImportError:
    HAS_NOISEREDUCE = False


class AudioProcessor:
    """
    Audio post-processing for TTS output.
    
    Features:
    - Loudness normalization (LUFS targeting)
    - Noise reduction
    - High-pass filtering (remove DC offset)
    - Soft clipping (prevent harsh clipping)
    - Silence trimming
    """
    
    def __init__(
        self,
        sample_rate: int = 24000,
        target_lufs: float = -16.0,  # Broadcast standard
        enable_noise_reduction: bool = False,
        enable_highpass: bool = True,
        highpass_freq: float = 80.0,  # Hz
    ):
        self.sample_rate = sample_rate
        self.target_lufs = target_lufs
        self.enable_noise_reduction = enable_noise_reduction
        self.enable_highpass = enable_highpass
        self.highpass_freq = highpass_freq
    
    def process(self, audio: np.ndarray) -> np.ndarray:
        """
        Apply full processing pipeline.
        
        Args:
            audio: Float32 audio array [-1, 1]
            
        Returns:
            Processed audio
        """
        # Remove DC offset
        audio = self._remove_dc_offset(audio)
        
        # High-pass filter
        if self.enable_highpass and HAS_SCIPY:
            audio = self._highpass_filter(audio)
        
        # Noise reduction
        if self.enable_noise_reduction and HAS_NOISEREDUCE:
            audio = self._reduce_noise(audio)
        
        # Normalize loudness
        audio = self._normalize_loudness(audio)
        
        # Soft clip to prevent harsh distortion
        audio = self._soft_clip(audio)
        
        return audio
    
    def _remove_dc_offset(self, audio: np.ndarray) -> np.ndarray:
        """Remove DC offset (mean)."""
        return audio - np.mean(audio)
    
    def _highpass_filter(self, audio: np.ndarray) -> np.ndarray:
        """Apply high-pass filter to remove low rumble."""
        if not HAS_SCIPY:
            return audio
        
        # Design 2nd order Butterworth high-pass
        nyquist = self.sample_rate / 2
        normalized_freq = self.highpass_freq / nyquist
        
        if normalized_freq >= 1.0:
            return audio
        
        b, a = scipy.signal.butter(2, normalized_freq, btype='high')
        return scipy.signal.filtfilt(b, a, audio).astype(np.float32)
    
    def _reduce_noise(self, audio: np.ndarray) -> np.ndarray:
        """Apply noise reduction."""
        if not HAS_NOISEREDUCE:
            return audio
        
        try:
            return nr.reduce_noise(
                y=audio,
                sr=self.sample_rate,
                stationary=True,
                prop_decrease=0.75,
            ).astype(np.float32)
        except Exception as e:
            logger.warning(f"Noise reduction failed: {e}")
            return audio
    
    def _normalize_loudness(self, audio: np.ndarray) -> np.ndarray:
        """
        Normalize to target LUFS.
        
        Uses simplified LUFS approximation (RMS-based).
        For true LUFS, use pyloudnorm library.
        """
        # Calculate current RMS
        rms = np.sqrt(np.mean(audio ** 2))
        
        if rms < 1e-8:
            return audio
        
        # Approximate LUFS from RMS
        # LUFS ≈ 20 * log10(RMS) - 0.691 (simplified)
        current_lufs = 20 * np.log10(rms + 1e-10) - 0.691
        
        # Calculate gain needed
        gain_db = self.target_lufs - current_lufs
        gain_linear = 10 ** (gain_db / 20)
        
        # Apply gain
        return (audio * gain_linear).astype(np.float32)
    
    def _soft_clip(self, audio: np.ndarray, threshold: float = 0.95) -> np.ndarray:
        """
        Apply soft clipping to prevent harsh distortion.
        
        Uses tanh-based soft clipper.
        """
        # Only apply to samples above threshold
        mask = np.abs(audio) > threshold
        
        if not np.any(mask):
            return audio
        
        # Apply tanh soft clipping
        result = audio.copy()
        result[mask] = threshold * np.tanh(audio[mask] / threshold)
        
        return result
    
    def trim_silence(
        self,
        audio: np.ndarray,
        threshold_db: float = -40.0,
        min_silence_duration: float = 0.1,  # seconds
    ) -> np.ndarray:
        """
        Trim leading and trailing silence.
        
        Args:
            audio: Input audio
            threshold_db: Silence threshold in dB
            min_silence_duration: Minimum silence duration to trim
            
        Returns:
            Trimmed audio
        """
        threshold_linear = 10 ** (threshold_db / 20)
        
        # Calculate energy envelope
        frame_length = int(0.02 * self.sample_rate)  # 20ms frames
        hop_length = frame_length // 2
        
        # RMS energy per frame
        num_frames = (len(audio) - frame_length) // hop_length + 1
        energy = np.zeros(num_frames)
        
        for i in range(num_frames):
            start = i * hop_length
            end = start + frame_length
            frame = audio[start:end]
            energy[i] = np.sqrt(np.mean(frame ** 2))
        
        # Find first and last frames above threshold
        above_threshold = energy > threshold_linear
        
        if not np.any(above_threshold):
            return audio  # All silence, return as-is
        
        first_frame = np.argmax(above_threshold)
        last_frame = len(above_threshold) - np.argmax(above_threshold[::-1]) - 1
        
        # Convert to samples
        start_sample = max(0, first_frame * hop_length - int(0.05 * self.sample_rate))
        end_sample = min(len(audio), (last_frame + 1) * hop_length + int(0.05 * self.sample_rate))
        
        return audio[start_sample:end_sample]
    
    def add_fade(
        self,
        audio: np.ndarray,
        fade_in_ms: float = 10.0,
        fade_out_ms: float = 10.0,
    ) -> np.ndarray:
        """Add fade in/out to prevent clicks."""
        fade_in_samples = int(fade_in_ms * self.sample_rate / 1000)
        fade_out_samples = int(fade_out_ms * self.sample_rate / 1000)
        
        result = audio.copy()
        
        # Fade in
        if fade_in_samples > 0 and len(result) > fade_in_samples:
            fade_in = np.linspace(0, 1, fade_in_samples)
            result[:fade_in_samples] *= fade_in
        
        # Fade out
        if fade_out_samples > 0 and len(result) > fade_out_samples:
            fade_out = np.linspace(1, 0, fade_out_samples)
            result[-fade_out_samples:] *= fade_out
        
        return result


def enhance_speech(
    audio: np.ndarray,
    sample_rate: int = 24000,
    target_lufs: float = -16.0,
) -> np.ndarray:
    """
    Convenience function to enhance TTS output.
    
    Args:
        audio: Raw TTS output (float32, [-1, 1])
        sample_rate: Sample rate
        target_lufs: Target loudness
        
    Returns:
        Enhanced audio
    """
    processor = AudioProcessor(
        sample_rate=sample_rate,
        target_lufs=target_lufs,
        enable_highpass=True,
        enable_noise_reduction=False,  # Usually not needed for TTS
    )
    
    audio = processor.process(audio)
    audio = processor.add_fade(audio)
    
    return audio


def concatenate_audio(
    segments: list,
    sample_rate: int = 24000,
    crossfade_ms: float = 20.0,
) -> np.ndarray:
    """
    Concatenate multiple audio segments with crossfade.
    
    Args:
        segments: List of audio arrays
        sample_rate: Sample rate
        crossfade_ms: Crossfade duration in milliseconds
        
    Returns:
        Concatenated audio
    """
    if not segments:
        return np.array([], dtype=np.float32)
    
    if len(segments) == 1:
        return segments[0]
    
    crossfade_samples = int(crossfade_ms * sample_rate / 1000)
    
    result = segments[0].copy()
    
    for segment in segments[1:]:
        if crossfade_samples > 0 and len(result) >= crossfade_samples and len(segment) >= crossfade_samples:
            # Apply crossfade
            fade_out = np.linspace(1, 0, crossfade_samples)
            fade_in = np.linspace(0, 1, crossfade_samples)
            
            # Overlap-add
            result[-crossfade_samples:] *= fade_out
            segment = segment.copy()
            segment[:crossfade_samples] *= fade_in
            
            result[-crossfade_samples:] += segment[:crossfade_samples]
            result = np.concatenate([result, segment[crossfade_samples:]])
        else:
            result = np.concatenate([result, segment])
    
    return result


def resample(
    audio: np.ndarray,
    orig_sr: int,
    target_sr: int,
) -> np.ndarray:
    """
    Resample audio to different sample rate.
    
    Args:
        audio: Input audio
        orig_sr: Original sample rate
        target_sr: Target sample rate
        
    Returns:
        Resampled audio
    """
    if orig_sr == target_sr:
        return audio
    
    if HAS_SCIPY:
        # Use scipy resampling
        num_samples = int(len(audio) * target_sr / orig_sr)
        return scipy.signal.resample(audio, num_samples).astype(np.float32)
    else:
        # Simple linear interpolation fallback
        ratio = target_sr / orig_sr
        new_length = int(len(audio) * ratio)
        indices = np.linspace(0, len(audio) - 1, new_length)
        return np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)
