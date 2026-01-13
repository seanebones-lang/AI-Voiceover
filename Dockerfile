# Dockerfile for REAL Voice Cloning with XTTS
# Build time: ~10-15 minutes
# RAM required: ~4GB

FROM python:3.11-slim AS python-stage

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    ffmpeg \
    libsndfile1 \
    git \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies (including PyTorch + XTTS)
COPY services/xtts/requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

# Pre-download XTTS model during build (saves startup time)
RUN python -c "from TTS.api import TTS; TTS('tts_models/multilingual/multi-dataset/xtts_v2')" || echo "Model will download on first use"

# Final stage
FROM python:3.11-slim

WORKDIR /app

# Install runtime dependencies + Node.js
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    libsndfile1 \
    curl \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Copy Python packages from build stage
COPY --from=python-stage /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-stage /usr/local/bin /usr/local/bin

# Copy pre-downloaded model
COPY --from=python-stage /root/.local/share/tts /root/.local/share/tts

# Install Node.js dependencies
COPY package*.json ./
RUN npm ci --legacy-peer-deps

# Copy source and build Next.js
COPY . .
RUN npm run build

# Create directories
RUN mkdir -p cloned_voices uploads logs

# Setup entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

EXPOSE 8080

ENTRYPOINT ["/docker-entrypoint.sh"]
