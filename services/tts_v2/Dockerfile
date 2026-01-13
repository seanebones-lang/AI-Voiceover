# HumanMirage TTS v3 - Production Docker Image
# Optimized for NVIDIA GPU inference

FROM nvidia/cuda:12.2-cudnn8-runtime-ubuntu22.04

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    python3.11 \
    python3.11-venv \
    python3-pip \
    espeak-ng \
    libespeak-ng1 \
    libsndfile1 \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set Python 3.11 as default
RUN update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1
RUN update-alternatives --install /usr/bin/python python /usr/bin/python3.11 1

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip3 install --no-cache-dir --upgrade pip
RUN pip3 install --no-cache-dir -r requirements.txt

# Install TTS (Coqui)
RUN pip3 install --no-cache-dir TTS

# Pre-download XTTS v2 model (optional, speeds up first run)
# RUN python3 -c "from TTS.api import TTS; TTS('tts_models/multilingual/multi-dataset/xtts_v2')"

# Copy application code
COPY *.py ./

# Create data directory for speaker database
RUN mkdir -p /app/data

# Expose port
EXPOSE 8082

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=3 \
    CMD curl -f http://localhost:8082/health || exit 1

# Run server
CMD ["python3", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8082"]
