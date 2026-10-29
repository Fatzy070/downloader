# Stage 1: Build TypeScript backend
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production runtime with Python3, FFmpeg, and yt-dlp (with curl-cffi TLS impersonation)
FROM node:20-bookworm-slim AS runtime

# Install Python 3, venv, FFmpeg, curl, and CA certificates required by yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-venv \
    ffmpeg \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Install yt-dlp with default extras and curl-cffi (required by TikTok extractor for browser TLS impersonation)
ARG YTDLP_CACHE_BUST=latest
RUN python3 -m venv /opt/venv \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/venv/bin/pip install --no-cache-dir --upgrade "yt-dlp[default,curl-cffi]" \
  && ln -sf /opt/venv/bin/yt-dlp /usr/local/bin/yt-dlp \
  && chmod -R a+rX /opt/venv

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV YTDLP_PATH=/usr/local/bin/yt-dlp
ENV FFMPEG_PATH=/usr/bin/ffmpeg

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Run as non-root user for security
USER node

EXPOSE 3001

CMD ["node", "dist/index.js"]
