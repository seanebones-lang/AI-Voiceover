# Local voice service (CPU). All inference runs in this container: Kokoro-82M for stock
# voices and XTTS v2 for cloned/studio voices. Model weights are baked in at build time and
# the runtime is forced offline, so no request ever leaves the box.
FROM python:3.11-slim-trixie

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    HF_HOME=/models/hf \
    TTS_HOME=/models/tts \
    HF_HUB_DISABLE_TELEMETRY=1

WORKDIR /app

COPY requirements.txt requirements-common.txt ./
# build-essential/cmake are only needed to compile pyopenjtalk (Japanese G2P); removed afterwards.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg build-essential cmake \
    && pip install --upgrade pip \
    && pip install -r requirements.txt \
    && (pip uninstall -y unidic || true) \
    && apt-get purge -y build-essential cmake \
    && apt-get autoremove -y \
    && rm -rf /var/lib/apt/lists/*

# XTTS v2 weights are released under the Coqui Public Model License (non-commercial terms).
# Building this image downloads them and accepts that license.
ARG COQUI_TOS_AGREED=1
COPY prefetch_models.py engine_init.py xtts_engine.py audio_utils.py stock_voices.json ./
RUN COQUI_TOS_AGREED=${COQUI_TOS_AGREED} python prefetch_models.py

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    VOICE_OFFLINE=1

COPY *.py ./

EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1 --timeout-keep-alive 75"]
