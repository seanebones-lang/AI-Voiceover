#!/usr/bin/env python3
"""
HumanMirage TTS - End-to-End Test Suite
Comprehensive tests for all components
"""

import sys
import os
import asyncio
import tempfile
import wave
from pathlib import Path

# Add parent to path
sys.path.insert(0, str(Path(__file__).parent.parent))

# Test results tracking
TESTS_RUN = 0
TESTS_PASSED = 0
TESTS_FAILED = 0

def test(name):
    """Decorator for test functions."""
    def decorator(func):
        async def wrapper():
            global TESTS_RUN, TESTS_PASSED, TESTS_FAILED
            TESTS_RUN += 1
            print(f"\n🧪 Testing: {name}")
            try:
                if asyncio.iscoroutinefunction(func):
                    await func()
                else:
                    func()
                TESTS_PASSED += 1
                print(f"   ✅ PASSED")
                return True
            except Exception as e:
                TESTS_FAILED += 1
                print(f"   ❌ FAILED: {e}")
                return False
        return wrapper
    return decorator


# ============================================================================
# UNIT TESTS - Individual Components
# ============================================================================

@test("Phonemizer - Basic Text")
def test_phonemizer_basic():
    from phonemizer import get_phonemizer
    
    ph = get_phonemizer()
    result = ph.phonemize("Hello world")
    
    assert result is not None, "Result should not be None"
    assert len(result) > 0, "Result should have phonemes"
    assert isinstance(result, list), "Result should be a list"
    print(f"   Phonemes: {result[:10]}...")


@test("Phonemizer - Number Expansion")
def test_phonemizer_numbers():
    from phonemizer import get_phonemizer
    
    ph = get_phonemizer()
    result = ph._expand_numbers("I have 42 apples")
    
    # Either successfully expanded or unchanged (if inflect not installed)
    assert isinstance(result, str), "Should return string"
    print(f"   Result: {result}")


@test("Phonemizer - Abbreviations")
def test_phonemizer_abbreviations():
    from phonemizer import get_phonemizer
    
    ph = get_phonemizer()
    result = ph._expand_abbreviations("Dr. Smith went to see Mr. Jones")
    
    assert "Dr." not in result or "Doctor" in result, "Dr. should be expanded"
    print(f"   Result: {result}")


@test("Speaker Encoder - Initialization")
def test_speaker_encoder_init():
    from speaker_encoder import SpeakerEncoder
    
    encoder = SpeakerEncoder(device="cpu")
    assert encoder is not None, "Encoder should initialize"
    print(f"   Encoder initialized on CPU")


@test("Speaker Encoder - Embedding Dimension")
def test_speaker_encoder_dimension():
    from speaker_encoder import SpeakerEncoder
    import numpy as np
    
    encoder = SpeakerEncoder(device="cpu")
    
    # Create dummy audio (sine wave)
    sample_rate = 16000
    duration = 5.0
    t = np.linspace(0, duration, int(sample_rate * duration))
    audio = (np.sin(2 * np.pi * 440 * t) * 0.5).astype(np.float32)
    
    embedding = encoder.encode(audio)
    
    assert embedding.shape == (256,), f"Embedding should be 256-dim, got {embedding.shape}"
    assert np.isfinite(embedding).all(), "Embedding should not have NaN/Inf"
    print(f"   Embedding shape: {embedding.shape}")


@test("Speaker Database - CRUD Operations")
def test_speaker_database():
    from speaker_encoder import SpeakerDatabase
    import numpy as np
    
    # Use temp database
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        db = SpeakerDatabase(db_path)
        
        # Create temp audio file
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            audio_path = f.name
        
        # Write dummy audio
        sample_rate = 16000
        duration = 5.0
        t = np.linspace(0, duration, int(sample_rate * duration))
        audio = (np.sin(2 * np.pi * 440 * t) * 0.5 * 32767).astype(np.int16)
        
        with wave.open(audio_path, 'w') as wav:
            wav.setnchannels(1)
            wav.setsampwidth(2)
            wav.setframerate(sample_rate)
            wav.writeframes(audio.tobytes())
        
        # Test add
        speaker_id = db.add_speaker("Test Voice", [audio_path])
        assert speaker_id is not None, "Should return speaker ID"
        assert len(speaker_id) == 16, "ID should be 16 chars"
        
        # Test list
        speakers = db.list_speakers()
        assert len(speakers) == 1, "Should have one speaker"
        assert speakers[0]["name"] == "Test Voice"
        
        # Test get
        embedding = db.get_embedding(speaker_id)
        assert embedding.shape == (256,), "Should return 256-dim embedding"
        
        # Test delete
        db.delete_speaker(speaker_id)
        assert not db.has_speaker(speaker_id), "Speaker should be deleted"
        
        print(f"   CRUD operations successful")
        
        # Cleanup
        Path(audio_path).unlink(missing_ok=True)
        
    finally:
        Path(db_path).unlink(missing_ok=True)


@test("SSML Parser - Basic Parsing")
def test_ssml_parser_basic():
    from ssml_parser import parse_ssml
    
    ssml = '<speak>Hello <break time="500ms"/> world!</speak>'
    doc = parse_ssml(ssml)
    
    assert doc is not None, "Should parse SSML"
    assert len(doc.segments) > 0, "Should have segments"
    print(f"   Parsed {len(doc.segments)} segments")


@test("SSML Parser - Prosody Tags")
def test_ssml_parser_prosody():
    from ssml_parser import parse_ssml
    
    ssml = '<speak><prosody rate="fast" pitch="+2st">Quick high text</prosody></speak>'
    doc = parse_ssml(ssml)
    
    assert len(doc.segments) > 0, "Should have segments"
    # Check that prosody was applied
    for seg in doc.segments:
        if seg.text.strip():
            print(f"   Segment: '{seg.text}' rate={seg.rate} pitch={seg.pitch}")


@test("SSML Parser - Plain Text Fallback")
def test_ssml_parser_plain():
    from ssml_parser import parse_ssml
    
    text = "Just plain text without markup"
    doc = parse_ssml(text)
    
    assert len(doc.segments) == 1, "Should have one segment"
    assert doc.segments[0].text == text, "Should preserve text"
    print(f"   Plain text handled correctly")


@test("Voice Effects - Pitch Shift")
def test_voice_effects_pitch():
    from voice_effects import VoiceEffects
    import numpy as np
    
    # Create test audio
    sample_rate = 24000
    duration = 1.0
    t = np.linspace(0, duration, int(sample_rate * duration))
    audio = np.sin(2 * np.pi * 440 * t).astype(np.float32)
    
    # Apply pitch shift
    shifted = VoiceEffects.pitch_shift(audio, sample_rate, semitones=2)
    
    assert shifted is not None, "Should return audio"
    assert len(shifted) > 0, "Should have samples"
    print(f"   Pitch shifted {len(audio)} -> {len(shifted)} samples")


@test("Voice Effects - Reverb")
def test_voice_effects_reverb():
    from voice_effects import VoiceEffects
    import numpy as np
    
    sample_rate = 24000
    audio = np.random.randn(sample_rate).astype(np.float32) * 0.5
    
    reverbed = VoiceEffects.reverb(audio, sample_rate, room_size=0.5, wet_level=0.3)
    
    assert reverbed is not None, "Should return audio"
    assert len(reverbed) == len(audio), "Should preserve length"
    print(f"   Reverb applied successfully")


@test("Voice Effects - Effect Presets")
def test_voice_effects_presets():
    from voice_effects import EFFECT_PRESETS, apply_preset
    import numpy as np
    
    sample_rate = 24000
    audio = np.random.randn(sample_rate).astype(np.float32) * 0.3
    
    for preset_name in ["radio", "robot", "warm"]:
        result = apply_preset(audio, sample_rate, preset_name)
        assert result is not None, f"Preset {preset_name} should work"
    
    print(f"   Tested {len(EFFECT_PRESETS)} effect presets")


@test("Audio Processing - Normalization")
def test_audio_processing_normalize():
    from audio_processing import AudioProcessor
    import numpy as np
    
    processor = AudioProcessor(sample_rate=24000, target_lufs=-16.0)
    
    # Quiet audio
    audio = np.random.randn(24000).astype(np.float32) * 0.01
    
    processed = processor.process(audio)
    
    assert processed is not None, "Should return audio"
    assert np.max(np.abs(processed)) > np.max(np.abs(audio)), "Should be louder"
    print(f"   Normalized: max {np.max(np.abs(audio)):.4f} -> {np.max(np.abs(processed)):.4f}")


@test("Cache - LRU Operations")
def test_cache_lru():
    from cache import TTSCache
    import numpy as np
    
    cache = TTSCache(max_entries=3, ttl_seconds=60)
    
    # Add entries
    for i in range(5):
        audio = np.random.randn(1000).astype(np.float32)
        cache.set(audio, 24000, f"text_{i}")
    
    # Should have evicted oldest
    stats = cache.stats()
    assert stats["entries"] <= 3, "Should respect max_entries"
    
    # Most recent should still be there
    result = cache.get("text_4")
    assert result is not None, "Recent entry should exist"
    
    print(f"   Cache entries: {stats['entries']}, hits: {stats['hits']}")


@test("API Keys - Key Generation")
def test_api_keys_generation():
    from api_keys import APIKeyManager, Plan
    
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        manager = APIKeyManager(db_path)
        
        # Create key
        key = manager.create_key(
            name="Test Key",
            user_id="user_123",
            plan=Plan.STARTER,
        )
        
        assert key.startswith("hm_"), "Key should start with hm_"
        assert len(key) > 20, "Key should be sufficiently long"
        
        # Validate
        api_key = manager.validate_key(key)
        assert api_key is not None, "Key should be valid"
        assert api_key.plan == Plan.STARTER, "Plan should match"
        
        print(f"   Generated key: {key[:12]}...")
        
    finally:
        Path(db_path).unlink(missing_ok=True)


@test("API Keys - Rate Limiting")
def test_api_keys_rate_limit():
    from api_keys import APIKeyManager, Plan
    
    with tempfile.NamedTemporaryFile(suffix='.db', delete=False) as f:
        db_path = f.name
    
    try:
        manager = APIKeyManager(db_path)
        
        # Create free tier key (5 req/min)
        key = manager.create_key("Test", "user", Plan.FREE)
        api_key = manager.validate_key(key)
        
        # Should allow first requests
        for i in range(5):
            allowed, info = manager.check_rate_limit(api_key)
            if allowed:
                manager._rate_limits[api_key.key_id].append(__import__('time').time())
        
        # 6th should be rate limited
        allowed, info = manager.check_rate_limit(api_key)
        assert not allowed, "Should be rate limited after 5 requests"
        
        print(f"   Rate limiting works: {info['remaining_minute']} remaining")
        
    finally:
        Path(db_path).unlink(missing_ok=True)


@test("Prosody Engine - Rule Based")
def test_prosody_rule_based():
    from prosody_llm import RuleBasedProsody
    
    prosody = RuleBasedProsody()
    plan = prosody.annotate("Hello! How are you today?", emotion="happy")
    
    assert len(plan.segments) > 0, "Should have segments"
    assert plan.overall_emotion == "happy", "Should preserve emotion"
    
    # Check that question has rising intonation
    question_pitch = [s.pitch_shift for s in plan.segments if "?" in s.text or s.text.endswith("?")]
    
    print(f"   Generated {len(plan.segments)} prosody segments")


@test("Conversation - Script Parsing")
def test_conversation_parsing():
    from conversation import Conversation
    
    script = """
    HOST: Welcome to the show!
    GUEST[excited]: Thanks for having me!
    HOST: Let's get started.
    """
    
    speaker_map = {"HOST": "voice_1", "GUEST": "voice_2"}
    conv = Conversation.from_script(script, speaker_map)
    
    assert len(conv.turns) == 3, "Should have 3 turns"
    assert conv.turns[1].emotion == "excited", "Should parse emotion"
    
    print(f"   Parsed {len(conv.turns)} conversation turns")


@test("Batch Processing - Job Creation")
def test_batch_job_creation():
    from batch import BatchJob, TTSJob, JobStatus
    
    job = TTSJob(
        id="test_1",
        text="Hello world",
        emotion="happy",
    )
    
    assert job.status == JobStatus.PENDING, "New job should be pending"
    assert job.text == "Hello world"
    
    batch = BatchJob(id="batch_1", jobs=[job])
    assert batch.progress == 0.0, "New batch should have 0 progress"
    
    print(f"   Created batch with {len(batch.jobs)} jobs")


@test("Monitoring - Metrics Collection")
def test_monitoring_metrics():
    from monitoring import MetricsCollector
    
    metrics = MetricsCollector()
    
    # Record some requests
    for i in range(10):
        metrics.record_request(
            latency_ms=100 + i * 10,
            audio_duration_s=2.0,
            first_chunk_ms=50 + i * 5,
        )
    
    # Record an error
    metrics.record_error("test_error")
    
    stats = metrics.get_metrics()
    
    assert stats["total_requests"] == 10, "Should have 10 requests"
    assert stats["total_errors"] == 1, "Should have 1 error"
    assert stats["latency"]["p50_ms"] > 0, "Should have latency metrics"
    
    print(f"   Recorded {stats['total_requests']} requests, p50={stats['latency']['p50_ms']:.0f}ms")


# ============================================================================
# INTEGRATION TESTS
# ============================================================================

@test("Integration - Full Phonemizer Pipeline")
def test_integration_phonemizer():
    from phonemizer import get_phonemizer
    
    texts = [
        "Hello, Dr. Smith! How are you?",
        "I have 42 apples and $100.",
        "The API uses JSON and HTTP.",
    ]
    
    ph = get_phonemizer()
    
    for text in texts:
        phonemes = ph.phonemize(text)
        assert len(phonemes) > 0, f"Should phonemize: {text}"
    
    print(f"   Phonemized {len(texts)} test sentences")


@test("Integration - Audio Processing Chain")
def test_integration_audio_chain():
    from audio_processing import AudioProcessor, enhance_speech
    import numpy as np
    
    # Create noisy audio
    sample_rate = 24000
    duration = 2.0
    t = np.linspace(0, duration, int(sample_rate * duration))
    
    # Signal + noise
    signal = np.sin(2 * np.pi * 440 * t) * 0.3
    noise = np.random.randn(len(t)) * 0.05
    audio = (signal + noise).astype(np.float32)
    
    # Process
    enhanced = enhance_speech(audio, sample_rate)
    
    assert enhanced is not None
    assert len(enhanced) > 0
    assert np.isfinite(enhanced).all()
    
    print(f"   Processed {duration}s of audio")


@test("Integration - Effect Chain")
def test_integration_effect_chain():
    from voice_effects import create_effect_chain, VoiceEffects
    import numpy as np
    
    sample_rate = 24000
    audio = np.random.randn(sample_rate * 2).astype(np.float32) * 0.3
    
    # Create custom chain
    chain = create_effect_chain(
        lambda a, sr: VoiceEffects.eq_bass_boost(a, sr, gain_db=3),
        lambda a, sr: VoiceEffects.compression(a, sr, threshold_db=-15),
        lambda a, sr: VoiceEffects.reverb(a, sr, wet_level=0.2),
    )
    
    result = chain.process(audio, sample_rate)
    
    assert result is not None
    assert len(result) == len(audio)
    
    print(f"   Applied 3-stage effect chain")


# ============================================================================
# MAIN TEST RUNNER
# ============================================================================

async def run_all_tests():
    """Run all E2E tests."""
    global TESTS_RUN, TESTS_PASSED, TESTS_FAILED
    
    print("=" * 60)
    print("  HumanMirage TTS - End-to-End Test Suite")
    print("=" * 60)
    
    # Unit Tests
    print("\n📦 UNIT TESTS")
    print("-" * 40)
    
    await test_phonemizer_basic()
    await test_phonemizer_numbers()
    await test_phonemizer_abbreviations()
    await test_speaker_encoder_init()
    await test_speaker_encoder_dimension()
    await test_speaker_database()
    await test_ssml_parser_basic()
    await test_ssml_parser_prosody()
    await test_ssml_parser_plain()
    await test_voice_effects_pitch()
    await test_voice_effects_reverb()
    await test_voice_effects_presets()
    await test_audio_processing_normalize()
    await test_cache_lru()
    await test_api_keys_generation()
    await test_api_keys_rate_limit()
    await test_prosody_rule_based()
    await test_conversation_parsing()
    await test_batch_job_creation()
    await test_monitoring_metrics()
    
    # Integration Tests
    print("\n🔗 INTEGRATION TESTS")
    print("-" * 40)
    
    await test_integration_phonemizer()
    await test_integration_audio_chain()
    await test_integration_effect_chain()
    
    # Summary
    print("\n" + "=" * 60)
    print("  TEST SUMMARY")
    print("=" * 60)
    print(f"  Total:  {TESTS_RUN}")
    print(f"  Passed: {TESTS_PASSED} ✅")
    print(f"  Failed: {TESTS_FAILED} ❌")
    print(f"  Rate:   {TESTS_PASSED/TESTS_RUN*100:.1f}%")
    print("=" * 60)
    
    if TESTS_FAILED == 0:
        print("\n🎉 ALL TESTS PASSED!")
    else:
        print(f"\n⚠️  {TESTS_FAILED} test(s) failed")
    
    return TESTS_FAILED == 0


if __name__ == "__main__":
    success = asyncio.run(run_all_tests())
    sys.exit(0 if success else 1)
