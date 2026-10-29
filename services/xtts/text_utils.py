"""
Text preparation for local synthesis: cleanup, pronunciation lexicon, pause markers,
and language-aware chunking that respects each engine's per-request limits.
"""

import re
from dataclasses import dataclass
from typing import Dict, List, Optional

# XTTS v2 tokenizer char limits per language (TTS/tts/layers/xtts/tokenizer.py). Going over
# them truncates audio, so chunks stay ~10% under.
XTTS_CHAR_LIMITS = {
    "en": 250, "de": 253, "fr": 273, "es": 239, "it": 213, "pt": 203, "pl": 224,
    "zh": 82, "ar": 166, "cs": 186, "ru": 182, "nl": 251, "tr": 226, "ja": 71,
    "hu": 224, "ko": 95, "hi": 150,
}

CJK_LANGS = {"zh", "ja"}

# Silence inserted for explicit [pause] markers and at structural boundaries (seconds).
PAUSE_SECONDS = {"short": 0.25, "medium": 0.5, "long": 0.9}
SENTENCE_GAP_S = 0.2
CLAUSE_GAP_S = 0.12
PARAGRAPH_GAP_S = 0.55

_IPA_RE = re.compile(r"\[ipa:([^|\]]+)\|([^\]]+)\]", re.IGNORECASE)
_PAUSE_RE = re.compile(r"\[pause(?::(short|medium|long))?\]", re.IGNORECASE)
_EMOJI_RE = re.compile(
    "[\U0001F300-\U0001FAFF\U00002700-\U000027BF\U0001F000-\U0001F2FF\U00002600-\U000026FF️‍]+"
)
_SENTENCE_END_RE = re.compile(r"(?<=[.!?…])[\"')\]]*\s+|(?<=[。！？])")
_CLAUSE_RE = re.compile(r"(?<=[;:,—])\s+|(?<=[，、；：])")


@dataclass
class Segment:
    """A piece of text to synthesize, followed by `pause_after` seconds of silence."""

    text: str
    pause_after: float


def apply_lexicon(text: str, overrides: Optional[Dict[str, str]]) -> str:
    """
    Deterministic whole-word replacements in a single pass (longest source wins), so one
    rule never rewrites the output of another.
    """
    if not text or not overrides or not isinstance(overrides, dict):
        return text
    pairs = {}
    for k, v in overrides.items():
        src, dst = str(k).strip(), str(v).strip()
        if src and dst:
            pairs[src.lower()] = dst
    if not pairs:
        return text
    alternation = "|".join(re.escape(s) for s in sorted(pairs, key=len, reverse=True))
    pattern = re.compile(rf"(?<!\w)({alternation})(?!\w)", re.IGNORECASE)
    parts = re.split(r"(\[ipa:[^\]]+\])", text, flags=re.IGNORECASE)
    return "".join(
        p if p.lower().startswith("[ipa:") else pattern.sub(lambda m: pairs[m.group(1).lower()], p) for p in parts
    )


def render_ipa_markup(text: str, supports_phonemes: bool) -> str:
    """
    `[ipa:word|fəˈniːm]` → Kokoro/misaki inline phonemes `[word](/fəˈniːm/)`, or the plain
    word for engines that cannot read IPA (reading raw IPA symbols aloud produces garbage).
    """
    if supports_phonemes:
        return _IPA_RE.sub(lambda m: f"[{m.group(1).strip()}](/{m.group(2).strip()}/)", text)
    return _IPA_RE.sub(lambda m: m.group(1).strip(), text)


def clean_text(text: str, for_xtts: bool) -> str:
    """Remove things TTS models read badly (markdown, emoji, odd quotes) without changing words."""
    if not text:
        return ""
    t = text.replace("\r\n", "\n").replace("\r", "\n")
    t = _EMOJI_RE.sub(" ", t)
    t = re.sub(r"^\s{0,3}#{1,6}\s+", "", t, flags=re.MULTILINE)  # markdown headings
    t = re.sub(r"^\s*[-*•]\s+", "", t, flags=re.MULTILINE)  # bullets
    t = re.sub(r"(\*\*|__|`)", "", t)
    t = re.sub(r"(?<!\w)\*(?!\s)([^*\n]+)(?<!\s)\*(?!\w)", r"\1", t)  # *emphasis*
    t = t.replace("“", '"').replace("”", '"').replace("‘", "'").replace("’", "'")
    t = t.replace("…", "...")
    if for_xtts:
        # XTTS often swallows or vocalises dashes and ellipses; commas give the same pause.
        t = re.sub(r"\s*[—–]\s*", ", ", t)
        t = re.sub(r"\s+-\s+", ", ", t)
        t = re.sub(r"\.{3,}", ",", t)
        t = re.sub(r",\s*([,.!?])", r"\1", t)
        t = t.replace('"', "")
    t = re.sub(r"[ \t]+", " ", t)
    t = re.sub(r" +([.,!?;:])", r"\1", t)
    t = re.sub(r" *\n *", "\n", t)
    t = re.sub(r"\n{3,}", "\n\n", t)
    return t.strip()


def _split_long(piece: str, limit: int, cjk: bool) -> List[str]:
    """Split one sentence that is over `limit`: clauses first, then words (or characters for CJK)."""
    if len(piece) <= limit:
        return [piece]
    clauses = [c.strip() for c in _CLAUSE_RE.split(piece) if c and c.strip()]
    if len(clauses) > 1:
        out: List[str] = []
        cur = ""
        for c in clauses:
            joiner = "" if cjk else " "
            cand = f"{cur}{joiner}{c}".strip() if cur else c
            if len(cand) <= limit:
                cur = cand
            else:
                if cur:
                    out.append(cur)
                if len(c) > limit:
                    out.extend(_split_long_hard(c, limit, cjk))
                    cur = ""
                else:
                    cur = c
        if cur:
            out.append(cur)
        return out
    return _split_long_hard(piece, limit, cjk)


def _split_long_hard(piece: str, limit: int, cjk: bool) -> List[str]:
    if cjk:
        return [piece[i : i + limit] for i in range(0, len(piece), limit)]
    out: List[str] = []
    cur: List[str] = []
    for w in piece.split():
        cand = " ".join([*cur, w])
        if cur and len(cand) > limit:
            out.append(" ".join(cur))
            cur = [w]
        else:
            cur.append(w)
    if cur:
        out.append(" ".join(cur))
    return out


def _sentences(paragraph: str) -> List[str]:
    return [s.strip() for s in _SENTENCE_END_RE.split(paragraph) if s and s.strip()]


def chunk_text(
    text: str, language: str, max_chars: int, min_chars: int = 0, pack: bool = True
) -> List[Segment]:
    """
    Split text into synthesis segments with the silence that should follow each one.

    - Explicit `[pause]`, `[pause:short|medium|long]` markers become real silence.
    - Paragraph breaks get a longer gap than sentence breaks.
    - With `pack`, whole sentences are packed together up to `max_chars`; otherwise each
      sentence is its own segment. Fragments shorter than `min_chars` are merged with a
      neighbour (XTTS rushes or garbles one- or two-word inputs).
    """
    lang = (language or "en").split("-")[0].lower()
    cjk = lang in CJK_LANGS
    segments: List[Segment] = []

    pieces = _PAUSE_RE.split(text or "")
    # re.split with one group yields: text, kind, text, kind, ...
    blocks: List[tuple] = []
    for i in range(0, len(pieces), 2):
        body = pieces[i]
        kind = pieces[i + 1] if i + 1 < len(pieces) else None
        explicit_pause = PAUSE_SECONDS[(kind or "medium").lower()] if i + 1 < len(pieces) else None
        blocks.append((body, explicit_pause))

    for body, explicit_pause in blocks:
        paragraphs = [p.strip() for p in re.split(r"\n\s*\n|\n", body) if p.strip()]
        for p_idx, para in enumerate(paragraphs):
            packed: List[str] = []
            cur = ""
            for sent in _sentences(para):
                for part in _split_long(sent, max_chars, cjk):
                    joiner = "" if cjk else " "
                    cand = f"{cur}{joiner}{part}" if cur else part
                    fits = len(cand) <= max_chars
                    if fits and (pack or not cur or len(cur) < min_chars):
                        cur = cand
                    else:
                        packed.append(cur)
                        cur = part
            if cur:
                packed.append(cur)
            if min_chars and len(packed) > 1 and len(packed[-1]) < min_chars:
                joiner = "" if cjk else " "
                merged = f"{packed[-2]}{joiner}{packed[-1]}"
                if len(merged) <= max_chars:
                    packed[-2:] = [merged]
            for j, chunk in enumerate(packed):
                last_in_para = j == len(packed) - 1
                if not last_in_para:
                    gap = SENTENCE_GAP_S if re.search(r"[.!?。！？…]$", chunk) else CLAUSE_GAP_S
                elif p_idx < len(paragraphs) - 1:
                    gap = PARAGRAPH_GAP_S
                else:
                    gap = SENTENCE_GAP_S
                segments.append(Segment(chunk, gap))
        if explicit_pause is not None:
            if segments:
                segments[-1].pause_after = max(segments[-1].pause_after, explicit_pause)
            else:
                segments.append(Segment("", explicit_pause))

    if segments:
        segments[-1].pause_after = 0.0
    return segments


def xtts_chunk_limit(language: str, override: Optional[int] = None) -> int:
    lang = (language or "en").split("-")[0].lower()
    hard = XTTS_CHAR_LIMITS.get(lang, 250)
    target = int(hard * 0.9)
    if override:
        target = min(target, override)
    return max(40 if lang not in CJK_LANGS else 20, target)
