import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import text_utils as tu  # noqa: E402


def texts(segments):
    return [s.text for s in segments]


def test_chunks_never_exceed_xtts_limits_for_any_language():
    samples = {
        "en": "This is a long sentence that keeps going and going without any punctuation at all " * 6,
        "zh": "这是一个非常长的句子用来测试中文的分割功能是否能够正常工作因为中文没有空格所以需要按字符来切分" * 4,
        "ja": "これはとても長い文章で日本語の分割が正しく動作するかどうかを確認するためのものです" * 4,
        "ko": "이것은 한국어 분할이 제대로 작동하는지 확인하기 위한 아주 긴 문장입니다 " * 5,
    }
    for lang, text in samples.items():
        limit = tu.xtts_chunk_limit(lang)
        assert limit < tu.XTTS_CHAR_LIMITS[lang]
        segs = tu.chunk_text(tu.clean_text(text, for_xtts=True), lang, max_chars=limit)
        assert segs, lang
        assert all(0 < len(s.text) <= limit for s in segs), (lang, [len(s.text) for s in segs])


def test_cjk_sentences_split_on_full_width_punctuation():
    segs = tu.chunk_text("今天天气很好。我们去公园吧！你觉得呢？", "zh", max_chars=8)
    assert texts(segs) == ["今天天气很好。", "我们去公园吧！", "你觉得呢？"]


def test_pause_markers_become_silence_and_paragraphs_get_longer_gaps():
    segs = tu.chunk_text("Hello there. [pause:long] Next part.\n\nNew paragraph here. Last one.", "en", max_chars=200)
    assert texts(segs) == ["Hello there.", "Next part.", "New paragraph here. Last one."]
    assert segs[0].pause_after == tu.PAUSE_SECONDS["long"]
    assert segs[1].pause_after == tu.PARAGRAPH_GAP_S
    assert segs[-1].pause_after == 0.0


def test_unpacked_mode_gives_one_sentence_per_segment_but_merges_fragments():
    segs = tu.chunk_text("Wait. Stop. Did you hear that? I think someone is outside the door.", "en",
                         max_chars=200, min_chars=12, pack=False)
    assert all(len(s.text) >= 12 for s in segs[:-1])
    assert "Wait. Stop." in texts(segs)[0]


def test_clean_text_removes_markdown_and_emoji_and_softens_dashes_for_xtts():
    out = tu.clean_text("## Title\n**Bold** move 🚀 — really… *yes*", for_xtts=True)
    assert out == "Title\nBold move, really, yes"
    assert "—" in tu.clean_text("a — b", for_xtts=False)


def test_lexicon_is_whole_word_case_insensitive_and_longest_first():
    out = tu.apply_lexicon("NextEleven and nexteleven-ai; Eleven", {"NextEleven": "Next Eleven", "Eleven": "11"})
    assert out == "Next Eleven and Next Eleven-ai; 11"


def test_ipa_markup_per_engine():
    s = "Say [ipa:tomato|təˈmɑːtoʊ] now"
    assert tu.render_ipa_markup(s, supports_phonemes=True) == "Say [tomato](/təˈmɑːtoʊ/) now"
    assert tu.render_ipa_markup(s, supports_phonemes=False) == "Say tomato now"
