# Multi-stage Dockerfile for Railway deployment
# Supports REAL voice cloning via Coqui XTTS

# Stage 1: Node.js application
FROM node:22-alpine AS node-builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY next.config.js ./

RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build

# Stage 2: Python with TTS dependencies
FROM python:3.11-slim AS python-builder

WORKDIR /app

# Install build dependencies for audio processing
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential \
    git \
    curl \
    libsndfile1 \
    libsndfile1-dev \
    ffmpeg \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python requirements
COPY services/xtts/requirements.txt ./services/xtts/

# Install PyTorch CPU-only version first (smaller than full version)
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu

# Install other requirements
RUN pip install --no-cache-dir -r services/xtts/requirements.txt || \
    pip install --no-cache-dir fastapi uvicorn python-multipart edge-tts aiofiles numpy

# Stage 3: Final production image
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    ffmpeg \
    libsndfile1 \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies from builder
COPY --from=python-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-builder /usr/local/bin /usr/local/bin

# Copy Node.js app from builder
COPY --from=node-builder /app/node_modules ./node_modules
COPY --from=node-builder /app/.next ./.next
COPY --from=node-builder /app/public ./public
COPY --from=node-builder /app/package*.json ./
COPY --from=node-builder /app/next.config.js ./
COPY --from=node-builder /app/tsconfig.json ./

# Copy source files
COPY app ./app
COPY components ./components
COPY lib ./lib
COPY models ./models
COPY scripts ./scripts

# Copy Python sidecar
COPY services/xtts ./services/xtts

# Create directories
RUN mkdir -p models/piper models/xtts uploads cloned_voices

# Pre-download XTTS model during build (optional, makes startup faster)
# Disabled by default as it's ~2GB - will download on first use instead
# RUN python -c "from TTS.api import TTS; TTS('tts_models/multilingual/multi-dataset/xtts_v2')" || echo "XTTS pre-download skipped"

# Expose ports
EXPOSE 8080 8081

# Entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Set environment for optimal performance
ENV PYTORCH_ENABLE_MPS_FALLBACK=1
ENV OMP_NUM_THREADS=4

ENTRYPOINT ["/docker-entrypoint.sh"]
