"""
English text normalization for voiceover scripts: money, percentages, clock times, numeric
dates, decimals and common abbreviations become the words a narrator would say. Both
engines get the same spoken form, so stock and cloned voices read scripts identically.
"""

import re

from num2words import num2words

MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
_MONTH_ABBR = {m[:3].lower(): m for m in MONTHS}
_MONTH_ABBR["sept"] = "September"

_SCALES = {
    "k": "thousand", "thousand": "thousand",
    "m": "million", "mm": "million", "million": "million",
    "b": "billion", "bn": "billion", "billion": "billion",
    "t": "trillion", "tn": "trillion", "trillion": "trillion",
}
_CURRENCIES = {"$": ("dollar", "dollars", "cent", "cents"), "€": ("euro", "euros", "cent", "cents"),
               "£": ("pound", "pounds", "penny", "pence")}

_ABBREVIATIONS = [
    (r"\be\.g\.", "for example"),
    (r"\bi\.e\.", "that is"),
    (r"\betc\.", "et cetera"),
    (r"\bvs\.?(?=\s)", "versus"),
    (r"\bapprox\.", "approximately"),
    (r"\bw/(?=\s)", "with"),
    (r"\bw/o\b", "without"),
    (r"\band/or\b", "and or"),
]


def _words(n) -> str:
    return num2words(n).replace(" and ", " ").replace(",", "")


def _year(y: int) -> str:
    return num2words(y, to="year").replace(" and ", " ")


def _decimal(int_part: str, frac: str) -> str:
    digits = " ".join("oh" if d == "0" and len(frac) == 1 else _words(int(d)) for d in frac)
    return f"{_words(int(int_part.replace(',', '')))} point {digits}"


def _number(raw: str) -> str:
    raw = raw.replace(",", "")
    if "." in raw:
        a, b = raw.split(".", 1)
        return _decimal(a or "0", b)
    return _words(int(raw))


def _money(m: re.Match) -> str:
    symbol, amount, scale = m.group(1), m.group(2), (m.group(3) or "").lower()
    one, many, sub_one, sub_many = _CURRENCIES[symbol]
    clean = amount.replace(",", "")
    if scale:
        return f"{_number(clean)} {_SCALES[scale]} {many}"
    whole, _, cents = clean.partition(".")
    whole_n = int(whole or 0)
    parts = []
    if whole_n or not cents:
        parts.append(f"{_words(whole_n)} {one if whole_n == 1 else many}")
    if cents:
        c = int((cents + "0")[:2])
        if c:
            parts.append(f"{_words(c)} {sub_one if c == 1 else sub_many}")
    return " and ".join(parts)


def _percent(m: re.Match) -> str:
    return f"{_number(m.group(1))} percent"


def _time(m: re.Match) -> str:
    h, mins, ampm = int(m.group(1)), int(m.group(2)), (m.group(3) or "").lower()
    if h > 24 or mins > 59:
        return m.group(0)
    suffix = f" {ampm[0].upper()}M" if ampm else ""
    # "a.m." at a sentence end also ends the sentence; keep that period.
    end = "." if ampm and m.group(0).endswith(".") else ""
    if mins == 0:
        return f"{_words(h)}{suffix}{end}" if ampm else f"{_words(h)} o'clock"
    minute = f"oh {_words(mins)}" if mins < 10 else _words(mins)
    return f"{_words(h)} {minute}{suffix}{end}"


def _date(m: re.Match) -> str:
    a, b, y = int(m.group(1)), int(m.group(2)), m.group(3)
    month, day = (a, b) if a <= 12 else (b, a)  # US order unless the first field can't be a month
    if not (1 <= month <= 12 and 1 <= day <= 31):
        return m.group(0)
    year = int(y) + (2000 if len(y) == 2 else 0)
    return f"{MONTHS[month - 1]} {num2words(day, to='ordinal')}, {_year(year)}"


def _month_abbr(m: re.Match) -> str:
    return _MONTH_ABBR.get(m.group(1).lower(), m.group(0))


def normalize_english(text: str) -> str:
    if not text:
        return text
    t = text
    for pattern, repl in _ABBREVIATIONS:
        t = re.sub(pattern, repl, t, flags=re.IGNORECASE)
    t = re.sub(r"\b(Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.(?=\s+\d)", _month_abbr, t)
    t = re.sub(r"([$€£])\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|mm|m|bn|b|tn|t|thousand|million|billion|trillion)\b)?",
               _money, t, flags=re.IGNORECASE)
    t = re.sub(r"(\d[\d,]*(?:\.\d+)?)\s?%", _percent, t)
    t = re.sub(r"\b(\d{1,2}):(\d{2})(?:\s?([ap])\.?\s?m\b\.?)?", _time, t, flags=re.IGNORECASE)
    t = re.sub(r"\b(\d{1,2})/(\d{1,2})/(\d{4}|\d{2})\b", _date, t)
    t = re.sub(r"\b[vV](\d+(?:\.\d+)+)\b", lambda m: "version " + m.group(1), t)
    # Plain decimals (not dotted sequences like 1.2.3 or IPs): "4.0" → "four point oh".
    t = re.sub(r"(?<![\d.])(\d+)\.(\d+)(?![\d.])", lambda m: _decimal(m.group(1), m.group(2)), t)
    t = re.sub(r"\s&\s", " and ", t)
    t = re.sub(r"#(\d+)\b", lambda m: f"number {_words(int(m.group(1)))}", t)
    return t
