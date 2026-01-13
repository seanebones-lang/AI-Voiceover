#!/usr/bin/env python3
"""
HumanMirage TTS - Command Line Interface
Quick testing and management tool
"""

import asyncio
import argparse
import sys
from pathlib import Path
import json


def cmd_synthesize(args):
    """Generate speech from text."""
    from pipeline import HumanMirageTTS, Emotion
    import numpy as np
    import wave
    
    print(f"🎤 Generating speech...")
    print(f"   Text: '{args.text[:50]}{'...' if len(args.text) > 50 else ''}'")
    print(f"   Emotion: {args.emotion}")
    print(f"   Output: {args.output}")
    print()
    
    # Initialize engine
    engine = HumanMirageTTS(device=args.device)
    
    # Generate
    async def generate():
        return await engine.synthesize(
            text=args.text,
            speaker_id=args.voice,
            emotion=Emotion(args.emotion),
            language=args.language,
        )
    
    audio = asyncio.run(generate())
    
    # Save to WAV
    audio_int16 = (audio * 32767).astype(np.int16)
    
    with wave.open(args.output, 'w') as wav:
        wav.setnchannels(1)
        wav.setsampwidth(2)
        wav.setframerate(engine.config.sample_rate)
        wav.writeframes(audio_int16.tobytes())
    
    duration = len(audio) / engine.config.sample_rate
    print(f"✅ Generated {duration:.2f}s of audio")
    print(f"   Saved to: {args.output}")
    
    # Play if requested
    if args.play:
        import subprocess
        if sys.platform == "darwin":
            subprocess.run(["afplay", args.output])
        elif sys.platform == "linux":
            subprocess.run(["aplay", args.output])
        else:
            print("   (Auto-play not supported on this platform)")


def cmd_clone(args):
    """Clone a voice from audio files."""
    from speaker_encoder import get_speaker_database
    
    print(f"🎭 Cloning voice...")
    print(f"   Name: {args.name}")
    print(f"   Files: {', '.join(args.files)}")
    print()
    
    # Validate files
    for f in args.files:
        if not Path(f).exists():
            print(f"❌ File not found: {f}")
            sys.exit(1)
    
    # Clone
    db = get_speaker_database()
    speaker_id = db.add_speaker(
        name=args.name,
        audio_files=args.files,
        description=args.description,
    )
    
    print(f"✅ Voice cloned successfully!")
    print(f"   Speaker ID: {speaker_id}")
    print(f"   Use with: --voice {speaker_id}")


def cmd_voices(args):
    """List available voices."""
    from speaker_encoder import get_speaker_database
    
    db = get_speaker_database()
    speakers = db.list_speakers()
    
    print("📋 Available Voices")
    print("=" * 50)
    
    if not speakers:
        print("   No cloned voices yet.")
        print("   Use 'clone' command to create one.")
    else:
        for s in speakers:
            print(f"\n   {s['name']}")
            print(f"   ID: {s['id']}")
            if s.get('description'):
                print(f"   Description: {s['description']}")
            print(f"   Created: {s['created_at']}")
    
    print("\n" + "=" * 50)
    print(f"Total: {len(speakers)} voice(s)")


def cmd_delete(args):
    """Delete a cloned voice."""
    from speaker_encoder import get_speaker_database
    
    db = get_speaker_database()
    
    if db.delete_speaker(args.voice_id):
        print(f"✅ Deleted voice: {args.voice_id}")
    else:
        print(f"❌ Voice not found: {args.voice_id}")
        sys.exit(1)


def cmd_server(args):
    """Start the TTS server."""
    import uvicorn
    
    print("🚀 Starting HumanMirage TTS Server...")
    print(f"   Port: {args.port}")
    print(f"   Device: {args.device}")
    print()
    
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=args.port,
        reload=args.reload,
        workers=1,
    )


def cmd_benchmark(args):
    """Run benchmarks."""
    from benchmark import run_benchmark, print_summary
    
    results = asyncio.run(run_benchmark(
        num_runs=args.runs,
        streaming=args.streaming,
        device=args.device,
    ))
    
    print_summary(results)
    
    if args.output:
        output_data = {
            category: suite.to_dict()
            for category, suite in results.items()
        }
        with open(args.output, 'w') as f:
            json.dump(output_data, f, indent=2)
        print(f"\n📊 Results saved to {args.output}")


def cmd_health(args):
    """Check service health."""
    import requests
    
    url = f"http://{args.host}:{args.port}/health"
    
    try:
        response = requests.get(url, timeout=5)
        data = response.json()
        
        if data.get("status") == "healthy":
            print("✅ Service is healthy")
        else:
            print("⚠️ Service is not fully healthy")
        
        print(json.dumps(data, indent=2))
        
    except requests.exceptions.ConnectionError:
        print(f"❌ Cannot connect to {url}")
        print("   Is the server running?")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(
        description="HumanMirage TTS - Command Line Interface",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate speech
  python cli.py synthesize "Hello world" -o output.wav --play
  
  # Clone a voice
  python cli.py clone "My Voice" audio1.wav audio2.wav
  
  # List voices
  python cli.py voices
  
  # Start server
  python cli.py server --port 8082
  
  # Run benchmarks
  python cli.py benchmark --runs 10
        """
    )
    
    subparsers = parser.add_subparsers(dest="command", help="Commands")
    
    # Synthesize command
    synth = subparsers.add_parser("synthesize", aliases=["tts", "speak"], help="Generate speech")
    synth.add_argument("text", help="Text to synthesize")
    synth.add_argument("-o", "--output", default="output.wav", help="Output file")
    synth.add_argument("-v", "--voice", help="Voice/speaker ID")
    synth.add_argument("-e", "--emotion", default="neutral", 
                       choices=["neutral", "happy", "sad", "angry", "excited", "calm", "whisper", "serious"])
    synth.add_argument("-l", "--language", default="en", help="Language code")
    synth.add_argument("-d", "--device", default="cuda", help="Device (cuda/cpu)")
    synth.add_argument("--play", action="store_true", help="Play audio after generation")
    synth.set_defaults(func=cmd_synthesize)
    
    # Clone command
    clone = subparsers.add_parser("clone", help="Clone a voice")
    clone.add_argument("name", help="Name for the cloned voice")
    clone.add_argument("files", nargs="+", help="Audio files (3-30 seconds each)")
    clone.add_argument("--description", help="Description")
    clone.set_defaults(func=cmd_clone)
    
    # Voices command
    voices = subparsers.add_parser("voices", aliases=["list"], help="List voices")
    voices.set_defaults(func=cmd_voices)
    
    # Delete command
    delete = subparsers.add_parser("delete", help="Delete a voice")
    delete.add_argument("voice_id", help="Voice ID to delete")
    delete.set_defaults(func=cmd_delete)
    
    # Server command
    server = subparsers.add_parser("server", aliases=["serve"], help="Start server")
    server.add_argument("-p", "--port", type=int, default=8082, help="Port")
    server.add_argument("-d", "--device", default="cuda", help="Device")
    server.add_argument("--reload", action="store_true", help="Auto-reload on changes")
    server.set_defaults(func=cmd_server)
    
    # Benchmark command
    bench = subparsers.add_parser("benchmark", aliases=["bench"], help="Run benchmarks")
    bench.add_argument("-r", "--runs", type=int, default=5, help="Runs per test")
    bench.add_argument("-s", "--streaming", action="store_true", help="Benchmark streaming")
    bench.add_argument("-d", "--device", default="cuda", help="Device")
    bench.add_argument("-o", "--output", help="Save results to JSON")
    bench.set_defaults(func=cmd_benchmark)
    
    # Health command
    health = subparsers.add_parser("health", help="Check service health")
    health.add_argument("--host", default="localhost", help="Host")
    health.add_argument("-p", "--port", type=int, default=8082, help="Port")
    health.set_defaults(func=cmd_health)
    
    args = parser.parse_args()
    
    if args.command is None:
        parser.print_help()
        sys.exit(0)
    
    args.func(args)


if __name__ == "__main__":
    main()
