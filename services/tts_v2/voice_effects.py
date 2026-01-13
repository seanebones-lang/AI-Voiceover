"""
HumanMirage TTS - Voice Effects
Real-time audio effects and transformations
"""

import numpy as np
from typing import Optional, Callable
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

# Try to import scipy for advanced filtering
try:
    import scipy.signal
    import scipy.fft
    HAS_SCIPY = True
except ImportError:
    HAS_SCIPY = False


@dataclass
class EffectChain:
    """Chain of audio effects to apply."""
    effects: list = None
    
    def __post_init__(self):
        if self.effects is None:
            self.effects = []
    
    def add(self, effect: Callable[[np.ndarray, int], np.ndarray]):
        """Add effect to chain."""
        self.effects.append(effect)
        return self
    
    def process(self, audio: np.ndarray, sample_rate: int) -> np.ndarray:
        """Apply all effects in sequence."""
        result = audio.copy()
        for effect in self.effects:
            result = effect(result, sample_rate)
        return result


class VoiceEffects:
    """
    Collection of voice effects for TTS post-processing.
    
    Effects:
    - Pitch shifting
    - Time stretching
    - Reverb
    - Echo/Delay
    - EQ (bass boost, treble)
    - Compression
    - De-essing
    - Robot voice
    - Whisper effect
    """
    
    @staticmethod
    def pitch_shift(
        audio: np.ndarray,
        sample_rate: int,
        semitones: float,
    ) -> np.ndarray:
        """
        Shift pitch without changing duration.
        
        Args:
            audio: Input audio
            sample_rate: Sample rate
            semitones: Pitch shift in semitones (+/-)
        """
        if semitones == 0:
            return audio
        
        try:
            import librosa
            return librosa.effects.pitch_shift(
                audio,
                sr=sample_rate,
                n_steps=semitones,
            ).astype(np.float32)
        except ImportError:
            # Simple resampling fallback (changes duration too)
            factor = 2 ** (semitones / 12)
            indices = np.arange(0, len(audio), factor)
            indices = indices[indices < len(audio)].astype(int)
            return audio[indices]
    
    @staticmethod
    def time_stretch(
        audio: np.ndarray,
        sample_rate: int,
        rate: float,
    ) -> np.ndarray:
        """
        Change speed without changing pitch.
        
        Args:
            audio: Input audio
            sample_rate: Sample rate
            rate: Speed multiplier (>1 = faster, <1 = slower)
        """
        if rate == 1.0:
            return audio
        
        try:
            import librosa
            return librosa.effects.time_stretch(
                audio,
                rate=rate,
            ).astype(np.float32)
        except ImportError:
            # Simple resampling (changes pitch too)
            new_length = int(len(audio) / rate)
            indices = np.linspace(0, len(audio) - 1, new_length)
            return np.interp(indices, np.arange(len(audio)), audio).astype(np.float32)
    
    @staticmethod
    def reverb(
        audio: np.ndarray,
        sample_rate: int,
        room_size: float = 0.5,
        damping: float = 0.5,
        wet_level: float = 0.3,
    ) -> np.ndarray:
        """
        Add reverb effect.
        
        Args:
            audio: Input audio
            sample_rate: Sample rate
            room_size: Room size (0-1)
            damping: High frequency damping (0-1)
            wet_level: Mix level of reverb (0-1)
        """
        if wet_level == 0:
            return audio
        
        # Simple comb filter reverb
        delays_ms = [29, 37, 43, 53]  # Prime number delays
        decay = 0.5 * room_size
        
        reverb = np.zeros_like(audio)
        
        for delay_ms in delays_ms:
            delay_samples = int(delay_ms * sample_rate / 1000)
            
            # Create delayed version
            delayed = np.zeros_like(audio)
            if delay_samples < len(audio):
                delayed[delay_samples:] = audio[:-delay_samples] * decay
            
            reverb += delayed
            decay *= (1 - damping * 0.3)
        
        # Normalize reverb
        if np.max(np.abs(reverb)) > 0:
            reverb = reverb / np.max(np.abs(reverb)) * np.max(np.abs(audio))
        
        # Mix dry and wet
        return ((1 - wet_level) * audio + wet_level * reverb).astype(np.float32)
    
    @staticmethod
    def echo(
        audio: np.ndarray,
        sample_rate: int,
        delay_ms: float = 300,
        decay: float = 0.4,
        num_echoes: int = 3,
    ) -> np.ndarray:
        """
        Add echo effect.
        
        Args:
            audio: Input audio
            sample_rate: Sample rate
            delay_ms: Delay between echoes in milliseconds
            decay: Decay factor per echo
            num_echoes: Number of echo repetitions
        """
        delay_samples = int(delay_ms * sample_rate / 1000)
        
        # Extend audio to fit echoes
        total_length = len(audio) + delay_samples * num_echoes
        result = np.zeros(total_length, dtype=np.float32)
        result[:len(audio)] = audio
        
        # Add echoes
        current_decay = decay
        for i in range(1, num_echoes + 1):
            offset = delay_samples * i
            end = min(offset + len(audio), total_length)
            result[offset:end] += audio[:end - offset] * current_decay
            current_decay *= decay
        
        # Normalize
        max_val = np.max(np.abs(result))
        if max_val > 1.0:
            result = result / max_val
        
        return result
    
    @staticmethod
    def eq_bass_boost(
        audio: np.ndarray,
        sample_rate: int,
        gain_db: float = 6.0,
        cutoff_hz: float = 200.0,
    ) -> np.ndarray:
        """
        Boost bass frequencies.
        
        Args:
            audio: Input audio
            sample_rate: Sample rate
            gain_db: Gain in dB
            cutoff_hz: Cutoff frequency
        """
        if not HAS_SCIPY or gain_db == 0:
            return audio
        
        # Low-pass filter to extract bass
        nyquist = sample_rate / 2
        normalized_cutoff = cutoff_hz / nyquist
        
        if normalized_cutoff >= 1.0:
            return audio
        
        b, a = scipy.signal.butter(2, normalized_cutoff, btype='low')
        bass = scipy.signal.filtfilt(b, a, audio)
        
        # Apply gain and add back
        gain_linear = 10 ** (gain_db / 20)
        boosted_bass = bass * (gain_linear - 1)
        
        result = audio + boosted_bass
        
        # Soft clip to prevent distortion
        return np.tanh(result).astype(np.float32)
    
    @staticmethod
    def eq_treble_boost(
        audio: np.ndarray,
        sample_rate: int,
        gain_db: float = 6.0,
        cutoff_hz: float = 4000.0,
    ) -> np.ndarray:
        """
        Boost treble frequencies.
        
        Args:
            audio: Input audio
            sample_rate: Sample rate
            gain_db: Gain in dB
            cutoff_hz: Cutoff frequency
        """
        if not HAS_SCIPY or gain_db == 0:
            return audio
        
        nyquist = sample_rate / 2
        normalized_cutoff = cutoff_hz / nyquist
        
        if normalized_cutoff >= 1.0:
            return audio
        
        b, a = scipy.signal.butter(2, normalized_cutoff, btype='high')
        treble = scipy.signal.filtfilt(b, a, audio)
        
        gain_linear = 10 ** (gain_db / 20)
        boosted_treble = treble * (gain_linear - 1)
        
        result = audio + boosted_treble
        return np.tanh(result).astype(np.float32)
    
    @staticmethod
    def compression(
        audio: np.ndarray,
        sample_rate: int,
        threshold_db: float = -20.0,
        ratio: float = 4.0,
        attack_ms: float = 5.0,
        release_ms: float = 50.0,
    ) -> np.ndarray:
        """
        Dynamic range compression.
        
        Args:
            audio: Input audio
            sample_rate: Sample rate
            threshold_db: Compression threshold in dB
            ratio: Compression ratio (e.g., 4:1)
            attack_ms: Attack time in milliseconds
            release_ms: Release time in milliseconds
        """
        threshold = 10 ** (threshold_db / 20)
        
        # Calculate envelope
        attack_samples = int(attack_ms * sample_rate / 1000)
        release_samples = int(release_ms * sample_rate / 1000)
        
        envelope = np.zeros_like(audio)
        current_env = 0.0
        
        for i, sample in enumerate(np.abs(audio)):
            if sample > current_env:
                # Attack
                coef = 1.0 / max(attack_samples, 1)
            else:
                # Release
                coef = 1.0 / max(release_samples, 1)
            
            current_env = current_env + coef * (sample - current_env)
            envelope[i] = current_env
        
        # Calculate gain reduction
        gain = np.ones_like(audio)
        above_threshold = envelope > threshold
        
        if np.any(above_threshold):
            # dB above threshold
            db_above = 20 * np.log10(envelope[above_threshold] / threshold + 1e-10)
            # Reduced dB
            reduced_db = db_above / ratio
            # Gain reduction
            gain[above_threshold] = 10 ** ((reduced_db - db_above) / 20)
        
        return (audio * gain).astype(np.float32)
    
    @staticmethod
    def robot_voice(
        audio: np.ndarray,
        sample_rate: int,
        frequency: float = 100.0,
    ) -> np.ndarray:
        """
        Create robotic voice effect using ring modulation.
        
        Args:
            audio: Input audio
            sample_rate: Sample rate
            frequency: Modulation frequency in Hz
        """
        # Generate carrier wave
        t = np.arange(len(audio)) / sample_rate
        carrier = np.sin(2 * np.pi * frequency * t)
        
        # Ring modulation
        modulated = audio * carrier
        
        return modulated.astype(np.float32)
    
    @staticmethod
    def whisper_effect(
        audio: np.ndarray,
        sample_rate: int,
        noise_level: float = 0.3,
    ) -> np.ndarray:
        """
        Create whispery voice effect.
        
        Args:
            audio: Input audio
            sample_rate: Sample rate
            noise_level: Amount of noise to add
        """
        if not HAS_SCIPY:
            return audio
        
        # High-pass filter to remove low frequencies
        nyquist = sample_rate / 2
        cutoff = 500 / nyquist
        
        if cutoff < 1.0:
            b, a = scipy.signal.butter(2, cutoff, btype='high')
            filtered = scipy.signal.filtfilt(b, a, audio)
        else:
            filtered = audio
        
        # Add breathiness (filtered noise)
        noise = np.random.randn(len(audio)) * noise_level
        
        # Shape noise with envelope of original audio
        envelope = np.abs(audio)
        
        # Smooth envelope
        window_size = int(0.01 * sample_rate)
        if window_size > 1:
            envelope = np.convolve(envelope, np.ones(window_size) / window_size, mode='same')
        
        shaped_noise = noise * envelope
        
        # Mix
        result = filtered * 0.7 + shaped_noise * 0.3
        
        # Normalize
        max_val = np.max(np.abs(result))
        if max_val > 0:
            result = result / max_val * np.max(np.abs(audio))
        
        return result.astype(np.float32)
    
    @staticmethod
    def telephone_effect(
        audio: np.ndarray,
        sample_rate: int,
    ) -> np.ndarray:
        """
        Apply telephone/radio effect (bandpass filter).
        
        Args:
            audio: Input audio
            sample_rate: Sample rate
        """
        if not HAS_SCIPY:
            return audio
        
        nyquist = sample_rate / 2
        low = 300 / nyquist
        high = 3400 / nyquist
        
        if low >= 1.0 or high >= 1.0:
            return audio
        
        b, a = scipy.signal.butter(4, [low, high], btype='band')
        filtered = scipy.signal.filtfilt(b, a, audio)
        
        # Add slight distortion
        filtered = np.tanh(filtered * 1.5) / 1.5
        
        return filtered.astype(np.float32)


def create_effect_chain(*effects) -> EffectChain:
    """Create an effect chain from effect functions."""
    chain = EffectChain()
    for effect in effects:
        chain.add(effect)
    return chain


# Preset effect chains
EFFECT_PRESETS = {
    "radio": lambda: create_effect_chain(
        lambda a, sr: VoiceEffects.telephone_effect(a, sr),
        lambda a, sr: VoiceEffects.compression(a, sr, threshold_db=-15),
    ),
    "stadium": lambda: create_effect_chain(
        lambda a, sr: VoiceEffects.reverb(a, sr, room_size=0.9, wet_level=0.5),
        lambda a, sr: VoiceEffects.echo(a, sr, delay_ms=200, decay=0.3),
    ),
    "robot": lambda: create_effect_chain(
        lambda a, sr: VoiceEffects.robot_voice(a, sr, frequency=80),
        lambda a, sr: VoiceEffects.eq_bass_boost(a, sr, gain_db=3),
    ),
    "whisper": lambda: create_effect_chain(
        lambda a, sr: VoiceEffects.whisper_effect(a, sr, noise_level=0.4),
    ),
    "warm": lambda: create_effect_chain(
        lambda a, sr: VoiceEffects.eq_bass_boost(a, sr, gain_db=4),
        lambda a, sr: VoiceEffects.compression(a, sr, threshold_db=-18),
    ),
    "bright": lambda: create_effect_chain(
        lambda a, sr: VoiceEffects.eq_treble_boost(a, sr, gain_db=4),
    ),
    "broadcast": lambda: create_effect_chain(
        lambda a, sr: VoiceEffects.compression(a, sr, threshold_db=-12, ratio=6),
        lambda a, sr: VoiceEffects.eq_bass_boost(a, sr, gain_db=2),
        lambda a, sr: VoiceEffects.eq_treble_boost(a, sr, gain_db=2),
    ),
}


def apply_preset(audio: np.ndarray, sample_rate: int, preset: str) -> np.ndarray:
    """Apply a preset effect chain."""
    if preset not in EFFECT_PRESETS:
        logger.warning(f"Unknown preset: {preset}")
        return audio
    
    chain = EFFECT_PRESETS[preset]()
    return chain.process(audio, sample_rate)
