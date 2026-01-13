# Multi-stage Dockerfile for Railway deployment
# Stage 1: Node.js application
FROM node:22-alpine AS node-builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./
COPY next.config.js ./

# Install dependencies
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build Next.js app
RUN npm run build

# Stage 2: Python XTTS sidecar
FROM python:3.11-slim AS python-builder

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Copy Python requirements
COPY services/xtts/requirements.txt ./services/xtts/
RUN pip install --no-cache-dir -r services/xtts/requirements.txt

# Stage 3: Final production image
FROM python:3.11-slim

WORKDIR /app

# Install Node.js for Next.js runtime
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
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

# Create directories for models and uploads
RUN mkdir -p models/piper models/xtts uploads

# Download models (optional - can be done at runtime)
# RUN npm run download-models || true

# Expose ports
EXPOSE 3000 8000

# Start both services
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
