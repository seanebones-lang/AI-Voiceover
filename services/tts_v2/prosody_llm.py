"""
HumanMirage TTS - LLM-Powered Prosody Generation
Uses language models to generate context-aware speech patterns
"""

import re
import json
from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)

# Try to import transformers for local LLM
try:
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
    HAS_TRANSFORMERS = True
except ImportError:
    HAS_TRANSFORMERS = False
    logger.warning("transformers not installed, LLM prosody disabled")


@dataclass
class ProsodyAnnotation:
    """Prosody control for a text segment."""
    text: str
    pitch_shift: float = 0.0      # Semitones (-12 to +12)
    speed_factor: float = 1.0     # 0.5 to 2.0
    energy_factor: float = 1.0    # 0.5 to 2.0
    pause_before_ms: int = 0      # Milliseconds
    pause_after_ms: int = 0       # Milliseconds
    emphasis: bool = False        # Emphasize this word


@dataclass 
class ProsodyPlan:
    """Complete prosody plan for an utterance."""
    segments: List[ProsodyAnnotation]
    overall_emotion: str = "neutral"
    speaking_rate: float = 1.0
    pitch_range: float = 1.0  # Variance multiplier


class RuleBasedProsody:
    """
    Rule-based prosody annotation.
    Fast fallback when LLM is not available.
    """
    
    # Punctuation pause durations (ms)
    PAUSE_RULES = {
        '.': 400,
        '!': 400,
        '?': 400,
        ',': 200,
        ';': 300,
        ':': 300,
        '...': 600,
        '—': 200,
        '-': 100,
    }
    
    # Words that typically receive emphasis
    EMPHASIS_WORDS = {
        'very', 'really', 'extremely', 'absolutely', 'definitely',
        'never', 'always', 'must', 'should', 'important', 'critical',
        'amazing', 'terrible', 'fantastic', 'horrible', 'incredible',
        'love', 'hate', 'need', 'want', 'best', 'worst',
    }
    
    # Question word pitch patterns
    QUESTION_WORDS = {'who', 'what', 'where', 'when', 'why', 'how'}
    
    def annotate(self, text: str, emotion: str = "neutral") -> ProsodyPlan:
        """Generate prosody plan from text."""
        segments = []
        
        # Split into sentences
        sentences = re.split(r'([.!?]+)', text)
        
        for i in range(0, len(sentences) - 1, 2):
            sentence = sentences[i].strip()
            punctuation = sentences[i + 1] if i + 1 < len(sentences) else '.'
            
            if not sentence:
                continue
            
            # Determine sentence type
            is_question = '?' in punctuation
            is_exclamation = '!' in punctuation
            
            # Process words
            words = sentence.split()
            
            for j, word in enumerate(words):
                clean_word = re.sub(r'[^\w]', '', word.lower())
                
                # Determine prosody for this word
                pitch = 0.0
                speed = 1.0
                energy = 1.0
                emphasis = False
                pause_after = 0
                
                # Check for emphasis words
                if clean_word in self.EMPHASIS_WORDS:
                    emphasis = True
                    energy = 1.2
                    pitch = 1.0
                
                # Question intonation
                if is_question:
                    # Rising intonation toward end
                    progress = j / max(len(words) - 1, 1)
                    pitch += progress * 3  # Rise up to 3 semitones
                
                # Exclamation emphasis
                if is_exclamation:
                    energy *= 1.2
                    pitch += 1
                
                # Check for inline punctuation
                for punct, pause in self.PAUSE_RULES.items():
                    if punct in word:
                        pause_after = pause
                        break
                
                # Last word gets sentence-end pause
                if j == len(words) - 1:
                    pause_after = self.PAUSE_RULES.get(punctuation, 400)
                
                segments.append(ProsodyAnnotation(
                    text=word,
                    pitch_shift=pitch,
                    speed_factor=speed,
                    energy_factor=energy,
                    pause_after_ms=pause_after,
                    emphasis=emphasis,
                ))
        
        # Apply emotion modifiers
        emotion_mods = self._get_emotion_modifiers(emotion)
        
        for seg in segments:
            seg.pitch_shift += emotion_mods['pitch']
            seg.speed_factor *= emotion_mods['speed']
            seg.energy_factor *= emotion_mods['energy']
        
        return ProsodyPlan(
            segments=segments,
            overall_emotion=emotion,
            speaking_rate=emotion_mods['speed'],
            pitch_range=emotion_mods.get('variance', 1.0),
        )
    
    def _get_emotion_modifiers(self, emotion: str) -> Dict[str, float]:
        """Get prosody modifiers for emotion."""
        modifiers = {
            'neutral': {'pitch': 0, 'speed': 1.0, 'energy': 1.0, 'variance': 1.0},
            'happy': {'pitch': 2, 'speed': 1.1, 'energy': 1.2, 'variance': 1.3},
            'sad': {'pitch': -2, 'speed': 0.85, 'energy': 0.7, 'variance': 0.6},
            'angry': {'pitch': 1, 'speed': 1.15, 'energy': 1.4, 'variance': 1.2},
            'excited': {'pitch': 3, 'speed': 1.2, 'energy': 1.3, 'variance': 1.5},
            'calm': {'pitch': -1, 'speed': 0.9, 'energy': 0.8, 'variance': 0.5},
            'whisper': {'pitch': -3, 'speed': 0.95, 'energy': 0.4, 'variance': 0.3},
            'serious': {'pitch': -1, 'speed': 0.95, 'energy': 1.0, 'variance': 0.7},
        }
        return modifiers.get(emotion, modifiers['neutral'])


class LLMProsodyAnnotator:
    """
    LLM-powered prosody annotation.
    Uses a language model to understand context and generate natural prosody.
    """
    
    SYSTEM_PROMPT = """You are an expert speech prosody annotator. Given text, output JSON prosody annotations.

For each word, provide:
- pitch: semitone shift (-6 to +6)
- speed: rate multiplier (0.7 to 1.5)  
- energy: volume multiplier (0.6 to 1.4)
- pause_after: milliseconds (0-500)
- emphasis: boolean

Rules:
1. Questions rise in pitch toward the end
2. Statements fall slightly at the end
3. Emphasize important content words
4. Slow down for complex/important info
5. Add pauses at punctuation and phrase boundaries
6. Match the requested emotion

Output ONLY valid JSON array."""

    def __init__(
        self,
        model_name: str = "microsoft/phi-2",
        device: str = "cuda",
        use_4bit: bool = True,
    ):
        self.device = device
        self.model = None
        self.tokenizer = None
        
        if HAS_TRANSFORMERS:
            self._load_model(model_name, use_4bit)
    
    def _load_model(self, model_name: str, use_4bit: bool):
        """Load the LLM for prosody generation."""
        try:
            logger.info(f"Loading prosody LLM: {model_name}")
            
            if use_4bit:
                quant_config = BitsAndBytesConfig(
                    load_in_4bit=True,
                    bnb_4bit_compute_dtype=torch.float16,
                )
                self.model = AutoModelForCausalLM.from_pretrained(
                    model_name,
                    quantization_config=quant_config,
                    device_map="auto",
                    trust_remote_code=True,
                )
            else:
                self.model = AutoModelForCausalLM.from_pretrained(
                    model_name,
                    torch_dtype=torch.float16,
                    device_map="auto",
                    trust_remote_code=True,
                )
            
            self.tokenizer = AutoTokenizer.from_pretrained(model_name)
            
            logger.info("✓ Prosody LLM loaded")
            
        except Exception as e:
            logger.error(f"Failed to load prosody LLM: {e}")
            self.model = None
    
    def annotate(self, text: str, emotion: str = "neutral") -> ProsodyPlan:
        """Generate prosody plan using LLM."""
        if self.model is None:
            # Fallback to rule-based
            return RuleBasedProsody().annotate(text, emotion)
        
        prompt = self._build_prompt(text, emotion)
        
        try:
            response = self._generate(prompt)
            plan = self._parse_response(response, text)
            plan.overall_emotion = emotion
            return plan
            
        except Exception as e:
            logger.warning(f"LLM prosody failed, using rules: {e}")
            return RuleBasedProsody().annotate(text, emotion)
    
    def _build_prompt(self, text: str, emotion: str) -> str:
        """Build the prompt for prosody generation."""
        return f"""{self.SYSTEM_PROMPT}

Text: "{text}"
Emotion: {emotion}

Prosody JSON:"""
    
    def _generate(self, prompt: str) -> str:
        """Generate response from LLM."""
        inputs = self.tokenizer(prompt, return_tensors="pt").to(self.device)
        
        with torch.no_grad():
            outputs = self.model.generate(
                **inputs,
                max_new_tokens=1024,
                temperature=0.7,
                do_sample=True,
                pad_token_id=self.tokenizer.eos_token_id,
            )
        
        response = self.tokenizer.decode(outputs[0], skip_special_tokens=True)
        
        # Extract just the generated part
        response = response[len(prompt):]
        
        return response
    
    def _parse_response(self, response: str, original_text: str) -> ProsodyPlan:
        """Parse LLM response into ProsodyPlan."""
        # Find JSON array in response
        json_match = re.search(r'\[.*\]', response, re.DOTALL)
        
        if not json_match:
            raise ValueError("No JSON found in response")
        
        annotations = json.loads(json_match.group())
        
        segments = []
        words = original_text.split()
        
        for i, word in enumerate(words):
            if i < len(annotations):
                ann = annotations[i]
                segments.append(ProsodyAnnotation(
                    text=word,
                    pitch_shift=float(ann.get('pitch', 0)),
                    speed_factor=float(ann.get('speed', 1.0)),
                    energy_factor=float(ann.get('energy', 1.0)),
                    pause_after_ms=int(ann.get('pause_after', 0)),
                    emphasis=bool(ann.get('emphasis', False)),
                ))
            else:
                segments.append(ProsodyAnnotation(text=word))
        
        return ProsodyPlan(segments=segments)


class ProsodyEngine:
    """
    Main prosody engine with automatic fallback.
    """
    
    def __init__(self, use_llm: bool = False, llm_model: str = None):
        self.rule_based = RuleBasedProsody()
        self.llm_annotator = None
        
        if use_llm and HAS_TRANSFORMERS:
            try:
                self.llm_annotator = LLMProsodyAnnotator(
                    model_name=llm_model or "microsoft/phi-2"
                )
            except Exception as e:
                logger.warning(f"LLM prosody not available: {e}")
    
    def annotate(
        self,
        text: str,
        emotion: str = "neutral",
        use_llm: bool = None,
    ) -> ProsodyPlan:
        """
        Generate prosody plan for text.
        
        Args:
            text: Input text
            emotion: Target emotion
            use_llm: Force LLM (True) or rules (False), or auto (None)
        """
        # Auto-select based on text complexity
        if use_llm is None:
            # Use LLM for longer, more complex texts
            use_llm = len(text) > 100 and self.llm_annotator is not None
        
        if use_llm and self.llm_annotator:
            return self.llm_annotator.annotate(text, emotion)
        
        return self.rule_based.annotate(text, emotion)
    
    def plan_to_ssml(self, plan: ProsodyPlan) -> str:
        """Convert prosody plan to SSML markup."""
        ssml_parts = ['<speak>']
        
        for seg in plan.segments:
            # Build prosody tag attributes
            attrs = []
            
            if seg.pitch_shift != 0:
                sign = '+' if seg.pitch_shift > 0 else ''
                attrs.append(f'pitch="{sign}{seg.pitch_shift}st"')
            
            if seg.speed_factor != 1.0:
                rate_pct = int((seg.speed_factor - 1) * 100)
                sign = '+' if rate_pct > 0 else ''
                attrs.append(f'rate="{sign}{rate_pct}%"')
            
            if seg.energy_factor != 1.0:
                vol_pct = int((seg.energy_factor - 1) * 100)
                sign = '+' if vol_pct > 0 else ''
                attrs.append(f'volume="{sign}{vol_pct}%"')
            
            # Add pause before
            if seg.pause_before_ms > 0:
                ssml_parts.append(f'<break time="{seg.pause_before_ms}ms"/>')
            
            # Add word with prosody
            if attrs:
                ssml_parts.append(f'<prosody {" ".join(attrs)}>')
                
                if seg.emphasis:
                    ssml_parts.append(f'<emphasis level="strong">{seg.text}</emphasis>')
                else:
                    ssml_parts.append(seg.text)
                
                ssml_parts.append('</prosody>')
            else:
                if seg.emphasis:
                    ssml_parts.append(f'<emphasis level="strong">{seg.text}</emphasis>')
                else:
                    ssml_parts.append(seg.text)
            
            # Add pause after
            if seg.pause_after_ms > 0:
                ssml_parts.append(f'<break time="{seg.pause_after_ms}ms"/>')
            
            ssml_parts.append(' ')
        
        ssml_parts.append('</speak>')
        
        return ''.join(ssml_parts)


# Convenience function
def annotate_prosody(
    text: str,
    emotion: str = "neutral",
) -> ProsodyPlan:
    """Quick prosody annotation."""
    engine = ProsodyEngine()
    return engine.annotate(text, emotion)
