"""
HumanMirage TTS - SSML Parser
Speech Synthesis Markup Language support
"""

import re
import xml.etree.ElementTree as ET
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass, field
import logging

logger = logging.getLogger(__name__)


@dataclass
class SSMLSegment:
    """Parsed SSML segment with prosody controls."""
    text: str
    
    # Prosody attributes
    rate: float = 1.0           # Speaking rate multiplier
    pitch: float = 0.0          # Pitch shift in semitones
    volume: float = 1.0         # Volume multiplier
    
    # Timing
    pause_before_ms: int = 0
    pause_after_ms: int = 0
    
    # Special markers
    emphasis: str = "none"      # none, strong, moderate, reduced
    say_as: Optional[str] = None  # interpret-as: date, time, telephone, etc.
    phoneme: Optional[str] = None  # IPA phoneme override
    
    # Voice switching
    voice_id: Optional[str] = None
    language: Optional[str] = None


@dataclass
class SSMLDocument:
    """Parsed SSML document."""
    segments: List[SSMLSegment] = field(default_factory=list)
    default_voice: Optional[str] = None
    default_language: str = "en"
    
    def to_plain_text(self) -> str:
        """Convert to plain text (strip markup)."""
        return " ".join(seg.text for seg in self.segments if seg.text.strip())
    
    def get_total_pause_ms(self) -> int:
        """Get total pause duration."""
        return sum(seg.pause_before_ms + seg.pause_after_ms for seg in self.segments)


class SSMLParser:
    """
    Parse SSML markup into synthesis instructions.
    
    Supported elements:
    - <speak> - Root element
    - <prosody> - Rate, pitch, volume control
    - <break> - Pauses
    - <emphasis> - Word emphasis
    - <say-as> - Interpret as (date, time, etc.)
    - <phoneme> - Phoneme override
    - <voice> - Voice switching
    - <p>, <s> - Paragraph/sentence structure
    - <sub> - Substitution
    """
    
    # Rate value mappings
    RATE_VALUES = {
        "x-slow": 0.5,
        "slow": 0.75,
        "medium": 1.0,
        "fast": 1.25,
        "x-fast": 1.5,
    }
    
    # Pitch value mappings
    PITCH_VALUES = {
        "x-low": -6,
        "low": -3,
        "medium": 0,
        "high": 3,
        "x-high": 6,
    }
    
    # Volume value mappings
    VOLUME_VALUES = {
        "silent": 0.0,
        "x-soft": 0.25,
        "soft": 0.5,
        "medium": 1.0,
        "loud": 1.5,
        "x-loud": 2.0,
    }
    
    # Break strength to milliseconds
    BREAK_STRENGTHS = {
        "none": 0,
        "x-weak": 100,
        "weak": 200,
        "medium": 400,
        "strong": 600,
        "x-strong": 1000,
    }
    
    def parse(self, ssml: str) -> SSMLDocument:
        """
        Parse SSML string into SSMLDocument.
        
        Args:
            ssml: SSML markup string
            
        Returns:
            Parsed SSMLDocument with segments
        """
        doc = SSMLDocument()
        
        # Handle plain text (no markup)
        if not ssml.strip().startswith("<"):
            doc.segments.append(SSMLSegment(text=ssml.strip()))
            return doc
        
        # Wrap in <speak> if needed
        if not ssml.strip().startswith("<speak"):
            ssml = f"<speak>{ssml}</speak>"
        
        try:
            # Parse XML
            root = ET.fromstring(ssml)
            
            # Get default attributes from <speak>
            doc.default_language = root.get("xml:lang", "en")
            
            # Process recursively
            self._process_element(root, doc, SSMLSegment(text=""))
            
        except ET.ParseError as e:
            logger.warning(f"SSML parse error: {e}, treating as plain text")
            # Fallback: strip tags and use as plain text
            plain = re.sub(r'<[^>]+>', '', ssml)
            doc.segments.append(SSMLSegment(text=plain.strip()))
        
        return doc
    
    def _process_element(
        self,
        element: ET.Element,
        doc: SSMLDocument,
        current: SSMLSegment,
    ):
        """Recursively process SSML element."""
        tag = element.tag.lower()
        
        # Handle different element types
        if tag == "speak":
            self._process_children(element, doc, current)
            
        elif tag == "prosody":
            # Apply prosody modifications
            new_segment = SSMLSegment(
                text="",
                rate=self._parse_rate(element.get("rate"), current.rate),
                pitch=self._parse_pitch(element.get("pitch"), current.pitch),
                volume=self._parse_volume(element.get("volume"), current.volume),
            )
            self._process_children(element, doc, new_segment)
            
        elif tag == "break":
            # Add pause
            pause_ms = self._parse_break(element)
            if doc.segments:
                doc.segments[-1].pause_after_ms += pause_ms
            else:
                current.pause_before_ms += pause_ms
                
        elif tag == "emphasis":
            # Emphasis level
            level = element.get("level", "moderate")
            new_segment = SSMLSegment(
                text="",
                rate=current.rate,
                pitch=current.pitch,
                volume=current.volume,
                emphasis=level,
            )
            self._process_children(element, doc, new_segment)
            
        elif tag == "say-as":
            # Interpret-as
            interpret_as = element.get("interpret-as", "")
            text = self._interpret_text(element.text or "", interpret_as)
            if text:
                seg = SSMLSegment(
                    text=text,
                    rate=current.rate,
                    pitch=current.pitch,
                    volume=current.volume,
                    say_as=interpret_as,
                )
                doc.segments.append(seg)
                
        elif tag == "phoneme":
            # Phoneme override
            phoneme = element.get("ph", "")
            text = element.text or ""
            if text:
                seg = SSMLSegment(
                    text=text,
                    rate=current.rate,
                    pitch=current.pitch,
                    volume=current.volume,
                    phoneme=phoneme,
                )
                doc.segments.append(seg)
                
        elif tag == "voice":
            # Voice switching
            voice_id = element.get("name")
            language = element.get("xml:lang")
            new_segment = SSMLSegment(
                text="",
                rate=current.rate,
                pitch=current.pitch,
                volume=current.volume,
                voice_id=voice_id,
                language=language,
            )
            self._process_children(element, doc, new_segment)
            
        elif tag == "sub":
            # Substitution
            alias = element.get("alias", element.text or "")
            if alias:
                seg = SSMLSegment(
                    text=alias,
                    rate=current.rate,
                    pitch=current.pitch,
                    volume=current.volume,
                )
                doc.segments.append(seg)
                
        elif tag in ("p", "s"):
            # Paragraph/sentence - add pause after
            self._process_children(element, doc, current)
            pause = 400 if tag == "p" else 200
            if doc.segments:
                doc.segments[-1].pause_after_ms += pause
                
        else:
            # Unknown tag - process children
            self._process_children(element, doc, current)
        
        # Handle text content
        if element.text and element.text.strip():
            seg = SSMLSegment(
                text=element.text.strip(),
                rate=current.rate,
                pitch=current.pitch,
                volume=current.volume,
                emphasis=current.emphasis,
                voice_id=current.voice_id,
                language=current.language,
            )
            doc.segments.append(seg)
        
        # Handle tail text (text after closing tag)
        if element.tail and element.tail.strip():
            seg = SSMLSegment(
                text=element.tail.strip(),
                rate=current.rate,
                pitch=current.pitch,
                volume=current.volume,
            )
            doc.segments.append(seg)
    
    def _process_children(
        self,
        element: ET.Element,
        doc: SSMLDocument,
        current: SSMLSegment,
    ):
        """Process child elements."""
        for child in element:
            self._process_element(child, doc, current)
    
    def _parse_rate(self, value: Optional[str], default: float) -> float:
        """Parse rate value."""
        if not value:
            return default
        
        value = value.lower().strip()
        
        if value in self.RATE_VALUES:
            return self.RATE_VALUES[value]
        
        # Handle percentage (e.g., "150%")
        if value.endswith("%"):
            try:
                return float(value[:-1]) / 100
            except ValueError:
                pass
        
        # Handle relative (+10%, -20%)
        if value.startswith("+") or value.startswith("-"):
            try:
                delta = float(value.rstrip("%")) / 100
                return default + delta
            except ValueError:
                pass
        
        return default
    
    def _parse_pitch(self, value: Optional[str], default: float) -> float:
        """Parse pitch value."""
        if not value:
            return default
        
        value = value.lower().strip()
        
        if value in self.PITCH_VALUES:
            return self.PITCH_VALUES[value]
        
        # Handle semitones (e.g., "+2st", "-3st")
        if value.endswith("st"):
            try:
                return float(value[:-2])
            except ValueError:
                pass
        
        # Handle Hz (e.g., "+50Hz")
        if value.endswith("hz"):
            try:
                # Approximate: 1 semitone ≈ 6% frequency change
                hz = float(value[:-2])
                return hz / 20  # Rough conversion
            except ValueError:
                pass
        
        # Handle percentage
        if value.endswith("%"):
            try:
                pct = float(value.rstrip("%"))
                # Convert percentage to semitones
                return (pct - 100) / 10
            except ValueError:
                pass
        
        return default
    
    def _parse_volume(self, value: Optional[str], default: float) -> float:
        """Parse volume value."""
        if not value:
            return default
        
        value = value.lower().strip()
        
        if value in self.VOLUME_VALUES:
            return self.VOLUME_VALUES[value]
        
        # Handle dB (e.g., "+6dB", "-3dB")
        if value.endswith("db"):
            try:
                db = float(value[:-2])
                return default * (10 ** (db / 20))
            except ValueError:
                pass
        
        return default
    
    def _parse_break(self, element: ET.Element) -> int:
        """Parse break element to milliseconds."""
        # Check for time attribute
        time = element.get("time")
        if time:
            # Parse duration (e.g., "500ms", "1s")
            if time.endswith("ms"):
                try:
                    return int(time[:-2])
                except ValueError:
                    pass
            elif time.endswith("s"):
                try:
                    return int(float(time[:-1]) * 1000)
                except ValueError:
                    pass
        
        # Check for strength attribute
        strength = element.get("strength", "medium")
        return self.BREAK_STRENGTHS.get(strength, 400)
    
    def _interpret_text(self, text: str, interpret_as: str) -> str:
        """Interpret text based on say-as type."""
        if interpret_as == "characters":
            # Spell out characters
            return " ".join(text)
        
        elif interpret_as == "spell-out":
            return " ".join(text)
        
        elif interpret_as == "cardinal":
            # Number as cardinal
            try:
                import inflect
                p = inflect.engine()
                return p.number_to_words(int(text))
            except:
                return text
        
        elif interpret_as == "ordinal":
            # Number as ordinal
            try:
                import inflect
                p = inflect.engine()
                return p.ordinal(int(text))
            except:
                return text
        
        elif interpret_as == "date":
            # Parse and speak date
            return text  # Would need date parsing
        
        elif interpret_as == "time":
            # Parse and speak time
            return text
        
        elif interpret_as == "telephone":
            # Spell out phone number
            return " ".join(text.replace("-", " ").replace("(", "").replace(")", ""))
        
        return text


def parse_ssml(ssml: str) -> SSMLDocument:
    """Convenience function to parse SSML."""
    parser = SSMLParser()
    return parser.parse(ssml)


def ssml_to_plain(ssml: str) -> str:
    """Strip SSML markup and return plain text."""
    return parse_ssml(ssml).to_plain_text()
