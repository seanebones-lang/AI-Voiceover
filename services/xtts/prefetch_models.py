"""
Download every model the service needs into the local caches, so the running container
works with no network access (the Dockerfiles set HF_HUB_OFFLINE=1 at runtime).

Run at image build time:  python prefetch_models.py
"""

import json
import os
from pathlib import Path

from huggingface_hub import hf_hub_download

HERE = Path(__file__).resolve().parent
KOKORO_REPO = os.getenv("KOKORO_REPO_ID", "hexgrad/Kokoro-82M")


def main() -> None:
    for name in ("config.json", "kokoro-v1_0.pth"):
        print("kokoro:", hf_hub_download(KOKORO_REPO, name))
    with open(HERE / "stock_voices.json", encoding="utf-8") as f:
        catalog = json.load(f)["voices"]
    for voice in sorted({v["voice"] for v in catalog if v["engine"] == "kokoro"}):
        hf_hub_download(KOKORO_REPO, f"voices/{voice}.pt")
        print("kokoro voice:", voice)

    from xtts_engine import ensure_model_files, resolve_model_dir

    print("xtts:", ensure_model_files(resolve_model_dir()))


if __name__ == "__main__":
    main()
