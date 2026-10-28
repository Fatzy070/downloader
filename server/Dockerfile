# Stage 1: Build TypeScript backend
FROM node:20-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Stage 2: Production runtime with Python3, FFmpeg, and yt-dlp
FROM node:20-bookworm-slim AS runtime

# Install Python 3, FFmpeg, curl, and CA certificates required by yt-dlp
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    ffmpeg \
    ca-certificates \
    curl \
  && rm -rf /var/lib/apt/lists/*

# Install latest stable yt-dlp release binary
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp

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
