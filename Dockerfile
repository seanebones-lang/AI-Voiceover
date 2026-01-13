# Multi-stage Dockerfile for Railway deployment
# Lightweight build with optional XTTS

# Stage 1: Node.js application
FROM node:22-alpine AS node-builder

WORKDIR /app

COPY package*.json ./
COPY tsconfig.json ./
COPY next.config.js ./

RUN npm ci --legacy-peer-deps

COPY . .

RUN npm run build

# Stage 2: Python sidecar (lightweight)
FROM python:3.11-slim AS python-builder

WORKDIR /app

# Install minimal build dependencies
RUN apt-get update \
    && DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
    build-essential \
    libsndfile1-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY services/xtts/requirements.txt ./services/xtts/
RUN pip install --no-cache-dir -r services/xtts/requirements.txt

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

# Copy Python dependencies
COPY --from=python-builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=python-builder /usr/local/bin /usr/local/bin

# Copy Node.js app
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

# Expose ports
EXPOSE 8080 8081

# Entrypoint
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
