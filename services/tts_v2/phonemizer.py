"""
HumanMirage TTS - Production Phonemizer
High-quality Grapheme-to-Phoneme conversion with context awareness
"""

import re
from functools import lru_cache
from typing import List, Dict, Tuple
import logging

logger = logging.getLogger(__name__)

# Try to import phonemizer, fallback to basic if unavailable
try:
    from phonemizer import phonemize
    from phonemizer.backend import EspeakBackend
    HAS_PHONEMIZER = True
except ImportError:
    HAS_PHONEMIZER = False
    logger.warning("phonemizer not installed, using basic G2P")

try:
    from g2p_en import G2p
    HAS_G2P = True
except ImportError:
    HAS_G2P = False


class MasterPhonimizer:
    """
    Production-grade G2P with:
    - Multi-language support
    - Custom pronunciation overrides
    - Number/abbreviation expansion
    - Prosodic markers for punctuation
    """
    
    # Tech terms pronunciation overrides (IPA)
    LEXICON: Dict[str, str] = {
        "API": "eɪ piː aɪ",
        "GUI": "ɡuːi",
        "SQL": "siːkwəl",
        "GIF": "dʒɪf",
        "AWS": "eɪ dʌbəlju ɛs",
        "OAuth": "oʊ ɔːθ",
        "GitHub": "ɡɪt hʌb",
        "PyTorch": "paɪ tɔːrtʃ",
        "CUDA": "kuːdə",
        "GPU": "dʒiː piː juː",
        "CPU": "siː piː juː",
        "RAM": "ræm",
        "SSD": "ɛs ɛs diː",
        "URL": "juː ɑːr ɛl",
        "HTTP": "eɪtʃ tiː tiː piː",
        "JSON": "dʒeɪsɒn",
        "YAML": "jæməl",
        "npm": "ɛn piː ɛm",
        "CLI": "siː ɛl aɪ",
        "UI": "juː aɪ",
        "UX": "juː ɛks",
        "AI": "eɪ aɪ",
        "ML": "ɛm ɛl",
        "LLM": "ɛl ɛl ɛm",
        "TTS": "tiː tiː ɛs",
        "ASR": "eɪ ɛs ɑːr",
        "NLP": "ɛn ɛl piː",
    }
    
    # Abbreviation expansions
    ABBREVIATIONS: Dict[str, str] = {
        r'\bDr\.': 'Doctor',
        r'\bMr\.': 'Mister',
        r'\bMrs\.': 'Missus',
        r'\bMs\.': 'Miz',
        r'\bProf\.': 'Professor',
        r'\bvs\.': 'versus',
        r'\betc\.': 'etcetera',
        r'\be\.g\.': 'for example',
        r'\bi\.e\.': 'that is',
        r'\bw/\b': 'with',
        r'\bw/o\b': 'without',
        r'\bmin\.': 'minutes',
        r'\bsec\.': 'seconds',
        r'\bhr\.': 'hour',
        r'\bft\.': 'feet',
        r'\bin\.': 'inches',
        r'\blb\.': 'pounds',
        r'\bkg\.': 'kilograms',
        r'&': 'and',
        r'@': 'at',
        r'#': 'hashtag',
        r'\$(\d)': r'\1 dollars',
        r'€(\d)': r'\1 euros',
        r'£(\d)': r'\1 pounds',
    }
    
    def __init__(self, language: str = "en-us"):
        self.language = language
        
        # Initialize G2P backend
        if HAS_G2P:
            self.g2p = G2p()
        else:
            self.g2p = None
            
        if HAS_PHONEMIZER:
            try:
                self.backend = EspeakBackend(
                    language=language.replace('-', '_'),
                    preserve_punctuation=True,
                    with_stress=True
                )
            except Exception as e:
                logger.warning(f"Could not initialize espeak backend: {e}")
                self.backend = None
        else:
            self.backend = None
    
    def _expand_abbreviations(self, text: str) -> str:
        """Expand common abbreviations."""
        for pattern, replacement in self.ABBREVIATIONS.items():
            text = re.sub(pattern, replacement, text, flags=re.IGNORECASE)
        return text
    
    def _expand_numbers(self, text: str) -> str:
        """Convert numbers to spoken form."""
        try:
            import inflect
            p = inflect.engine()
            
            def replace_number(match):
                num = match.group(0)
                try:
                    # Handle decimals
                    if '.' in num and num.replace('.', '').replace(',', '').isdigit():
                        parts = num.split('.')
                        integer_part = p.number_to_words(int(parts[0].replace(',', '')))
                        decimal_part = ' '.join(p.number_to_words(int(d)) for d in parts[1])
                        return f"{integer_part} point {decimal_part}"
                    
                    # Plain integers
                    clean_num = num.replace(',', '')
                    if clean_num.isdigit():
                        return p.number_to_words(int(clean_num))
                    return num
                except:
                    return num
            
            # Match numbers with optional commas and decimals
            text = re.sub(r'\b[\d,]+\.?\d*\b', replace_number, text)
            
        except ImportError:
            pass
        
        return text
    
    def _apply_lexicon(self, text: str) -> Tuple[str, Dict[str, str]]:
        """Replace known tech terms with phoneme placeholders."""
        replacements = {}
        
        for word, phonemes in self.LEXICON.items():
            pattern = re.compile(rf'\b{re.escape(word)}\b', re.IGNORECASE)
            if pattern.search(text):
                placeholder = f"__LEXICON_{len(replacements)}__"
                text = pattern.sub(placeholder, text)
                replacements[placeholder] = phonemes
        
        return text, replacements
    
    def _punctuation_to_prosody(self, text: str) -> str:
        """Convert punctuation to prosodic control tokens."""
        # Preserve sentence structure with prosodic markers
        replacements = [
            (r'\.\.\.', ' <PAUSE_LONG> '),
            (r'\.', ' <PAUSE_SENTENCE> '),
            (r'\!', ' <PAUSE_SENTENCE> '),
            (r'\?', ' <PAUSE_SENTENCE> '),
            (r'\;', ' <PAUSE_MEDIUM> '),
            (r'\:', ' <PAUSE_MEDIUM> '),
            (r'\,', ' <PAUSE_SHORT> '),
            (r'\—', ' <PAUSE_SHORT> '),
            (r'\–', ' <PAUSE_SHORT> '),
            (r'\"', ''),
            (r"\'", ''),
        ]
        
        for pattern, replacement in replacements:
            text = re.sub(pattern, replacement, text)
        
        return text
    
    @lru_cache(maxsize=10000)
    def phonemize(self, text: str) -> List[str]:
        """
        Convert text to phoneme sequence.
        
        Returns list of phonemes with prosodic markers:
        - <PAUSE_SHORT> - comma pause (~200ms)
        - <PAUSE_MEDIUM> - semicolon pause (~400ms)
        - <PAUSE_SENTENCE> - period pause (~600ms)
        - <PAUSE_LONG> - ellipsis pause (~800ms)
        - <BREATH> - breath mark
        """
        if not text or not text.strip():
            return []
        
        # Preprocessing pipeline
        processed = self._expand_abbreviations(text)
        processed = self._expand_numbers(processed)
        processed, lexicon_subs = self._apply_lexicon(processed)
        
        # Core phonemization
        if self.g2p is not None:
            # Use g2p_en for English
            phonemes_raw = self.g2p(processed)
            phonemes_str = ' '.join(phonemes_raw)
        elif self.backend is not None and HAS_PHONEMIZER:
            # Use espeak backend
            phonemes_str = phonemize(
                processed,
                language=self.language,
                backend='espeak',
                strip=False,
                preserve_punctuation=True,
                with_stress=True
            )
        else:
            # Fallback: basic character-based (not ideal)
            phonemes_str = processed
        
        # Re-insert lexicon overrides
        for placeholder, phonemes in lexicon_subs.items():
            phonemes_str = phonemes_str.replace(placeholder, f" {phonemes} ")
        
        # Convert punctuation to prosody markers
        phonemes_str = self._punctuation_to_prosody(phonemes_str)
        
        # Tokenize
        tokens = phonemes_str.split()
        tokens = [t for t in tokens if t]  # Remove empty
        
        return tokens
    
    def text_to_sequence(self, text: str) -> List[int]:
        """Convert text to integer sequence for model input."""
        phonemes = self.phonemize(text)
        
        # Build vocabulary mapping
        vocab = self._get_vocabulary()
        
        sequence = []
        for phoneme in phonemes:
            if phoneme in vocab:
                sequence.append(vocab[phoneme])
            else:
                # Handle unknown phonemes
                for char in phoneme:
                    if char in vocab:
                        sequence.append(vocab[char])
        
        return sequence
    
    def _get_vocabulary(self) -> Dict[str, int]:
        """Get phoneme to integer mapping."""
        # Standard ARPAbet + IPA + special tokens
        symbols = [
            '<PAD>', '<UNK>', '<BOS>', '<EOS>',
            '<PAUSE_SHORT>', '<PAUSE_MEDIUM>', '<PAUSE_SENTENCE>', '<PAUSE_LONG>', '<BREATH>',
            # ARPAbet
            'AA', 'AE', 'AH', 'AO', 'AW', 'AY', 'B', 'CH', 'D', 'DH',
            'EH', 'ER', 'EY', 'F', 'G', 'HH', 'IH', 'IY', 'JH', 'K',
            'L', 'M', 'N', 'NG', 'OW', 'OY', 'P', 'R', 'S', 'SH',
            'T', 'TH', 'UH', 'UW', 'V', 'W', 'Y', 'Z', 'ZH',
            # Stress markers
            'AA0', 'AA1', 'AA2', 'AE0', 'AE1', 'AE2', 'AH0', 'AH1', 'AH2',
            'AO0', 'AO1', 'AO2', 'AW0', 'AW1', 'AW2', 'AY0', 'AY1', 'AY2',
            'EH0', 'EH1', 'EH2', 'ER0', 'ER1', 'ER2', 'EY0', 'EY1', 'EY2',
            'IH0', 'IH1', 'IH2', 'IY0', 'IY1', 'IY2', 'OW0', 'OW1', 'OW2',
            'OY0', 'OY1', 'OY2', 'UH0', 'UH1', 'UH2', 'UW0', 'UW1', 'UW2',
            # Common IPA
            'ə', 'ɪ', 'ʊ', 'ɛ', 'ɔ', 'æ', 'ʌ', 'ɑ', 'ɒ',
            'ð', 'θ', 'ʃ', 'ʒ', 'ŋ', 'ɹ', 'j', 'w',
            # Punctuation/whitespace
            ' ', '.', ',', '!', '?', '-', "'",
        ]
        
        return {s: i for i, s in enumerate(symbols)}


# Singleton instance
_phonemizer: MasterPhonimizer = None

def get_phonemizer(language: str = "en-us") -> MasterPhonimizer:
    """Get or create phonemizer singleton."""
    global _phonemizer
    if _phonemizer is None:
        _phonemizer = MasterPhonimizer(language)
    return _phonemizer
