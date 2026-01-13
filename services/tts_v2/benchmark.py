"""
HumanMirage TTS - Benchmarking Suite
Measures latency, throughput, and quality metrics
"""

import asyncio
import time
import statistics
import argparse
from typing import List, Dict, Any
from dataclasses import dataclass, field
from pathlib import Path
import json

import numpy as np


@dataclass
class BenchmarkResult:
    """Results from a single benchmark run."""
    text_length: int
    audio_duration: float  # seconds
    generation_time: float  # seconds
    first_chunk_latency: float  # seconds (for streaming)
    real_time_factor: float  # generation_time / audio_duration
    memory_usage_mb: float = 0.0


@dataclass
class BenchmarkSuite:
    """Collection of benchmark results."""
    results: List[BenchmarkResult] = field(default_factory=list)
    
    @property
    def avg_latency(self) -> float:
        return statistics.mean(r.generation_time for r in self.results)
    
    @property
    def p95_latency(self) -> float:
        times = sorted(r.generation_time for r in self.results)
        idx = int(len(times) * 0.95)
        return times[idx] if times else 0
    
    @property
    def avg_rtf(self) -> float:
        return statistics.mean(r.real_time_factor for r in self.results)
    
    @property
    def avg_first_chunk(self) -> float:
        return statistics.mean(r.first_chunk_latency for r in self.results)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_runs": len(self.results),
            "avg_latency_ms": self.avg_latency * 1000,
            "p95_latency_ms": self.p95_latency * 1000,
            "avg_rtf": self.avg_rtf,
            "avg_first_chunk_ms": self.avg_first_chunk * 1000,
            "results": [
                {
                    "text_length": r.text_length,
                    "audio_duration": r.audio_duration,
                    "generation_time": r.generation_time,
                    "rtf": r.real_time_factor,
                }
                for r in self.results
            ]
        }


# Test sentences of varying lengths
TEST_SENTENCES = {
    "short": [
        "Hello world.",
        "How are you?",
        "Nice to meet you.",
        "Good morning!",
        "Thank you very much.",
    ],
    "medium": [
        "The quick brown fox jumps over the lazy dog near the riverbank.",
        "Artificial intelligence is transforming how we interact with technology.",
        "Please remember to bring your identification when you visit the office.",
        "The weather forecast predicts sunny skies with a chance of afternoon showers.",
        "Learning a new language opens doors to understanding different cultures.",
    ],
    "long": [
        "In the heart of the bustling city, where skyscrapers touch the clouds and streets pulse with life, there exists a small cafe that has been serving the community for over fifty years, its walls adorned with photographs of generations past.",
        "The advancement of neural networks and deep learning has revolutionized the field of natural language processing, enabling machines to understand and generate human language with unprecedented accuracy and fluency.",
        "As the sun set over the mountains, painting the sky in brilliant shades of orange and purple, the travelers finally reached their destination, weary but exhilarated by the journey they had undertaken.",
    ],
}


async def benchmark_synthesis(
    engine,
    text: str,
    emotion: str = "neutral",
) -> BenchmarkResult:
    """Benchmark a single synthesis."""
    from pipeline import Emotion
    
    start_time = time.perf_counter()
    
    audio = await engine.synthesize(
        text=text,
        emotion=Emotion(emotion),
    )
    
    end_time = time.perf_counter()
    generation_time = end_time - start_time
    
    # Calculate audio duration
    sample_rate = engine.config.sample_rate
    audio_duration = len(audio) / sample_rate
    
    # RTF = generation time / audio duration
    # RTF < 1 means faster than real-time
    rtf = generation_time / audio_duration if audio_duration > 0 else float('inf')
    
    return BenchmarkResult(
        text_length=len(text),
        audio_duration=audio_duration,
        generation_time=generation_time,
        first_chunk_latency=generation_time,  # For non-streaming
        real_time_factor=rtf,
    )


async def benchmark_streaming(
    engine,
    text: str,
    emotion: str = "neutral",
) -> BenchmarkResult:
    """Benchmark streaming synthesis."""
    from pipeline import Emotion
    
    start_time = time.perf_counter()
    first_chunk_time = None
    total_samples = 0
    
    async for chunk in engine.synthesize_stream(
        text=text,
        emotion=Emotion(emotion),
    ):
        if first_chunk_time is None:
            first_chunk_time = time.perf_counter()
        total_samples += len(chunk) // 2  # int16 = 2 bytes
    
    end_time = time.perf_counter()
    
    generation_time = end_time - start_time
    first_chunk_latency = (first_chunk_time - start_time) if first_chunk_time else generation_time
    
    sample_rate = engine.config.sample_rate
    audio_duration = total_samples / sample_rate
    rtf = generation_time / audio_duration if audio_duration > 0 else float('inf')
    
    return BenchmarkResult(
        text_length=len(text),
        audio_duration=audio_duration,
        generation_time=generation_time,
        first_chunk_latency=first_chunk_latency,
        real_time_factor=rtf,
    )


async def run_benchmark(
    num_runs: int = 10,
    streaming: bool = False,
    emotions: List[str] = None,
    device: str = "cuda",
) -> Dict[str, BenchmarkSuite]:
    """Run full benchmark suite."""
    from pipeline import HumanMirageTTS
    
    print("=" * 60)
    print("HumanMirage TTS Benchmark Suite")
    print("=" * 60)
    print(f"Device: {device}")
    print(f"Mode: {'Streaming' if streaming else 'Batch'}")
    print(f"Runs per sentence: {num_runs}")
    print()
    
    # Initialize engine
    print("Loading TTS engine...")
    engine = HumanMirageTTS(device=device)
    print("✓ Engine ready\n")
    
    emotions = emotions or ["neutral"]
    results: Dict[str, BenchmarkSuite] = {}
    
    benchmark_fn = benchmark_streaming if streaming else benchmark_synthesis
    
    for category, sentences in TEST_SENTENCES.items():
        print(f"\n[{category.upper()} SENTENCES]")
        suite = BenchmarkSuite()
        
        for i, text in enumerate(sentences):
            print(f"  {i+1}/{len(sentences)}: '{text[:40]}...'")
            
            for emotion in emotions:
                for run in range(num_runs):
                    result = await benchmark_fn(engine, text, emotion)
                    suite.results.append(result)
                    
                    # Progress indicator
                    print(f"    Run {run+1}: {result.generation_time*1000:.0f}ms (RTF: {result.real_time_factor:.2f})")
        
        results[category] = suite
        
        print(f"  → Avg: {suite.avg_latency*1000:.0f}ms | P95: {suite.p95_latency*1000:.0f}ms | RTF: {suite.avg_rtf:.2f}")
    
    return results


def print_summary(results: Dict[str, BenchmarkSuite]):
    """Print benchmark summary."""
    print("\n" + "=" * 60)
    print("BENCHMARK SUMMARY")
    print("=" * 60)
    
    print(f"\n{'Category':<12} {'Avg Latency':<14} {'P95 Latency':<14} {'Avg RTF':<10} {'First Chunk':<12}")
    print("-" * 62)
    
    for category, suite in results.items():
        print(f"{category:<12} {suite.avg_latency*1000:>10.0f} ms  {suite.p95_latency*1000:>10.0f} ms  {suite.avg_rtf:>8.2f}  {suite.avg_first_chunk*1000:>8.0f} ms")
    
    print("-" * 62)
    
    # Overall
    all_results = [r for suite in results.values() for r in suite.results]
    overall_avg = statistics.mean(r.generation_time for r in all_results)
    overall_rtf = statistics.mean(r.real_time_factor for r in all_results)
    
    print(f"{'OVERALL':<12} {overall_avg*1000:>10.0f} ms  {'-':>13}  {overall_rtf:>8.2f}")
    
    print("\n" + "=" * 60)
    
    # Quality assessment
    if overall_rtf < 0.5:
        print("✅ EXCELLENT: Running at >2x real-time")
    elif overall_rtf < 1.0:
        print("✅ GOOD: Running faster than real-time")
    else:
        print("⚠️ NEEDS OPTIMIZATION: Running slower than real-time")
    
    print("=" * 60)


async def main():
    parser = argparse.ArgumentParser(description="Benchmark HumanMirage TTS")
    parser.add_argument("--runs", type=int, default=5, help="Runs per sentence")
    parser.add_argument("--streaming", action="store_true", help="Benchmark streaming mode")
    parser.add_argument("--device", default="cuda", help="Device (cuda/cpu)")
    parser.add_argument("--output", type=str, help="Save results to JSON file")
    
    args = parser.parse_args()
    
    results = await run_benchmark(
        num_runs=args.runs,
        streaming=args.streaming,
        device=args.device,
    )
    
    print_summary(results)
    
    if args.output:
        output_data = {
            category: suite.to_dict()
            for category, suite in results.items()
        }
        
        with open(args.output, 'w') as f:
            json.dump(output_data, f, indent=2)
        
        print(f"\n📊 Results saved to {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
