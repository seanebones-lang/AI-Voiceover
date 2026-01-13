"""
HumanMirage TTS - Multi-Speaker Conversation Synthesis
Generate realistic dialogues with multiple voices
"""

import asyncio
from typing import List, Dict, Optional, AsyncGenerator
from dataclasses import dataclass, field
import json
import re
import logging

import numpy as np

logger = logging.getLogger(__name__)


@dataclass
class DialogueTurn:
    """Single turn in a conversation."""
    speaker_id: str
    speaker_name: str
    text: str
    emotion: str = "neutral"
    
    # Generated audio (filled after synthesis)
    audio: Optional[np.ndarray] = None
    duration: float = 0.0


@dataclass
class Conversation:
    """Complete conversation script."""
    turns: List[DialogueTurn] = field(default_factory=list)
    title: str = ""
    description: str = ""
    
    # Timing settings
    turn_gap_ms: int = 500      # Gap between speakers
    same_speaker_gap_ms: int = 200  # Gap for same speaker continuing
    
    def add_turn(
        self,
        speaker_id: str,
        speaker_name: str,
        text: str,
        emotion: str = "neutral",
    ):
        """Add a turn to the conversation."""
        self.turns.append(DialogueTurn(
            speaker_id=speaker_id,
            speaker_name=speaker_name,
            text=text,
            emotion=emotion,
        ))
    
    def to_script(self) -> str:
        """Convert to human-readable script format."""
        lines = []
        for turn in self.turns:
            emotion_tag = f"[{turn.emotion}]" if turn.emotion != "neutral" else ""
            lines.append(f"{turn.speaker_name}{emotion_tag}: {turn.text}")
        return "\n".join(lines)
    
    @classmethod
    def from_script(cls, script: str, speaker_map: Dict[str, str]) -> "Conversation":
        """
        Parse script format into Conversation.
        
        Format:
            Speaker Name[emotion]: Text to speak
            
        speaker_map: {speaker_name: speaker_id}
        """
        conv = cls()
        
        # Pattern: "Name[optional_emotion]: text"
        pattern = r'^([^:\[\]]+)(?:\[(\w+)\])?\s*:\s*(.+)$'
        
        for line in script.strip().split('\n'):
            line = line.strip()
            if not line:
                continue
            
            match = re.match(pattern, line)
            if match:
                name = match.group(1).strip()
                emotion = match.group(2) or "neutral"
                text = match.group(3).strip()
                
                speaker_id = speaker_map.get(name, name.lower().replace(' ', '_'))
                
                conv.add_turn(
                    speaker_id=speaker_id,
                    speaker_name=name,
                    text=text,
                    emotion=emotion,
                )
        
        return conv
    
    def total_duration(self) -> float:
        """Get total audio duration."""
        return sum(turn.duration for turn in self.turns)


class ConversationSynthesizer:
    """
    Synthesize multi-speaker conversations.
    
    Features:
    - Multiple speakers with different voices
    - Emotion control per turn
    - Natural timing with pauses
    - Parallel synthesis for speed
    - Streaming output
    """
    
    def __init__(self, tts_engine):
        self.tts = tts_engine
        self.default_gap_ms = 500
    
    async def synthesize(
        self,
        conversation: Conversation,
        parallel: bool = True,
    ) -> np.ndarray:
        """
        Synthesize complete conversation.
        
        Args:
            conversation: Conversation object with turns
            parallel: Whether to synthesize turns in parallel
            
        Returns:
            Combined audio as numpy array
        """
        if parallel:
            # Synthesize all turns in parallel
            tasks = [
                self._synthesize_turn(turn)
                for turn in conversation.turns
            ]
            await asyncio.gather(*tasks)
        else:
            # Sequential synthesis
            for turn in conversation.turns:
                await self._synthesize_turn(turn)
        
        # Combine with appropriate gaps
        return self._combine_turns(conversation)
    
    async def synthesize_stream(
        self,
        conversation: Conversation,
    ) -> AsyncGenerator[bytes, None]:
        """
        Stream conversation synthesis.
        Yields audio chunks as turns are generated.
        """
        prev_speaker = None
        
        for turn in conversation.turns:
            # Synthesize this turn
            await self._synthesize_turn(turn)
            
            # Add gap
            if prev_speaker is not None:
                gap_ms = (
                    conversation.same_speaker_gap_ms 
                    if prev_speaker == turn.speaker_id 
                    else conversation.turn_gap_ms
                )
                gap_samples = int(gap_ms * self.tts.config.sample_rate / 1000)
                silence = np.zeros(gap_samples, dtype=np.float32)
                yield (silence * 32767).astype(np.int16).tobytes()
            
            # Yield turn audio
            if turn.audio is not None:
                yield (turn.audio * 32767).astype(np.int16).tobytes()
            
            prev_speaker = turn.speaker_id
    
    async def _synthesize_turn(self, turn: DialogueTurn):
        """Synthesize a single turn."""
        from pipeline import Emotion
        
        try:
            audio = await self.tts.synthesize(
                text=turn.text,
                speaker_id=turn.speaker_id,
                emotion=Emotion(turn.emotion),
            )
            
            turn.audio = audio
            turn.duration = len(audio) / self.tts.config.sample_rate
            
        except Exception as e:
            logger.error(f"Failed to synthesize turn: {e}")
            turn.audio = np.zeros(1000, dtype=np.float32)
            turn.duration = 0
    
    def _combine_turns(self, conversation: Conversation) -> np.ndarray:
        """Combine turns with gaps into single audio."""
        from audio_processing import concatenate_audio
        
        segments = []
        prev_speaker = None
        
        for turn in conversation.turns:
            if turn.audio is None:
                continue
            
            # Add gap before this turn
            if prev_speaker is not None:
                gap_ms = (
                    conversation.same_speaker_gap_ms
                    if prev_speaker == turn.speaker_id
                    else conversation.turn_gap_ms
                )
                gap_samples = int(gap_ms * self.tts.config.sample_rate / 1000)
                segments.append(np.zeros(gap_samples, dtype=np.float32))
            
            segments.append(turn.audio)
            prev_speaker = turn.speaker_id
        
        if not segments:
            return np.zeros(1000, dtype=np.float32)
        
        return concatenate_audio(
            segments,
            sample_rate=self.tts.config.sample_rate,
            crossfade_ms=10,
        )
    
    def export_timeline(self, conversation: Conversation) -> List[Dict]:
        """
        Export timeline with timestamps for each turn.
        Useful for generating subtitles.
        """
        timeline = []
        current_time = 0.0
        prev_speaker = None
        
        for turn in conversation.turns:
            # Add gap
            if prev_speaker is not None:
                gap_ms = (
                    conversation.same_speaker_gap_ms
                    if prev_speaker == turn.speaker_id
                    else conversation.turn_gap_ms
                )
                current_time += gap_ms / 1000
            
            timeline.append({
                "speaker_id": turn.speaker_id,
                "speaker_name": turn.speaker_name,
                "text": turn.text,
                "emotion": turn.emotion,
                "start_time": current_time,
                "end_time": current_time + turn.duration,
                "duration": turn.duration,
            })
            
            current_time += turn.duration
            prev_speaker = turn.speaker_id
        
        return timeline
    
    def export_subtitles_srt(self, conversation: Conversation) -> str:
        """Export subtitles in SRT format."""
        timeline = self.export_timeline(conversation)
        
        def format_time(seconds: float) -> str:
            h = int(seconds // 3600)
            m = int((seconds % 3600) // 60)
            s = int(seconds % 60)
            ms = int((seconds % 1) * 1000)
            return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"
        
        lines = []
        for i, entry in enumerate(timeline, 1):
            lines.append(str(i))
            lines.append(f"{format_time(entry['start_time'])} --> {format_time(entry['end_time'])}")
            lines.append(f"[{entry['speaker_name']}] {entry['text']}")
            lines.append("")
        
        return "\n".join(lines)
    
    def export_subtitles_vtt(self, conversation: Conversation) -> str:
        """Export subtitles in WebVTT format."""
        timeline = self.export_timeline(conversation)
        
        def format_time(seconds: float) -> str:
            h = int(seconds // 3600)
            m = int((seconds % 3600) // 60)
            s = int(seconds % 60)
            ms = int((seconds % 1) * 1000)
            return f"{h:02d}:{m:02d}:{s:02d}.{ms:03d}"
        
        lines = ["WEBVTT", ""]
        for i, entry in enumerate(timeline, 1):
            lines.append(f"{i}")
            lines.append(f"{format_time(entry['start_time'])} --> {format_time(entry['end_time'])}")
            lines.append(f"<v {entry['speaker_name']}>{entry['text']}")
            lines.append("")
        
        return "\n".join(lines)


# Example usage and parsing helpers
def parse_podcast_script(script: str) -> Conversation:
    """
    Parse a podcast-style script.
    
    Format:
        HOST: Welcome to the show!
        GUEST[excited]: Thanks for having me!
        HOST: Let's dive in.
    """
    # Extract speaker names
    speaker_pattern = r'^([A-Z][A-Z_\s]+)(?:\[\w+\])?\s*:'
    speakers = set(re.findall(speaker_pattern, script, re.MULTILINE))
    
    # Create speaker map (name -> id)
    speaker_map = {name.strip(): name.strip().lower().replace(' ', '_') for name in speakers}
    
    return Conversation.from_script(script, speaker_map)


def parse_audiobook_chapter(text: str, narrator_voice: str) -> Conversation:
    """
    Parse audiobook chapter with dialogue detection.
    
    Detects:
    - Narration (default voice)
    - Dialogue in quotes (alternating voices)
    """
    conv = Conversation()
    
    # Pattern for dialogue
    dialogue_pattern = r'"([^"]+)"'
    
    parts = re.split(dialogue_pattern, text)
    dialogue_speaker = 0
    
    for i, part in enumerate(parts):
        part = part.strip()
        if not part:
            continue
        
        if i % 2 == 0:
            # Narration
            conv.add_turn(
                speaker_id=narrator_voice,
                speaker_name="Narrator",
                text=part,
                emotion="neutral",
            )
        else:
            # Dialogue (alternate between two speakers)
            speaker_num = dialogue_speaker % 2
            conv.add_turn(
                speaker_id=f"character_{speaker_num}",
                speaker_name=f"Character {speaker_num + 1}",
                text=part,
                emotion="neutral",
            )
            dialogue_speaker += 1
    
    return conv
