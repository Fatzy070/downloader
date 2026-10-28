# PulseDL Backend (`server/`)

The Express + TypeScript backend API for **PulseDL**, responsible for validating incoming media URLs, enforcing network/SSRF safety, extracting normalized video metadata via `yt-dlp`, and streaming media directly to the client browser without buffering full files in Node.js memory.

For the full monorepo overview and frontend setup, see the [root README](../README.md).

---

## Table of Contents

1. [Backend Overview](#1-backend-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture and Project Structure](#3-architecture-and-project-structure)
4. [Prerequisites](#4-prerequisites)
5. [Installation and Setup](#5-installation-and-setup)
6. [Environment Variables](#6-environment-variables)
7. [Running the Backend](#7-running-the-backend)
8. [API Documentation](#8-api-documentation)
9. [CORS Configuration](#9-cors-configuration)
10. [Download Processing Pipeline](#10-download-processing-pipeline)
11. [Error Handling and Security](#11-error-handling-and-security)
12. [Testing and Build Verification](#12-testing-and-build-verification)
13. [Docker](#13-docker)
14. [Deployment (Render)](#14-deployment-render)
15. [Troubleshooting](#15-troubleshooting)

---

## 1. Backend Overview

The backend is a stateless HTTP service built with **Node.js**, **Express**, and **TypeScript**. It acts as a secure, rate-limited gateway around the open-source **`yt-dlp`** CLI and **FFmpeg**, exposing three endpoints under `/api`:

- **`GET /api/health`** — Reports service health, uptime, and the installed `yt-dlp` version (cached for 5 minutes).
- **`POST /api/info`** — Validates a user-submitted URL, verifies network safety, invokes `yt-dlp --dump-single-json`, and returns normalized metadata and server-defined format options (including watermark-free TikTok detection).
- **`GET /api/download`** — Validates the URL and selected format option, spawns `yt-dlp` streaming to `stdout` (`-o -`), waits for the first media chunk before sending `200 OK` headers, and pipes the media stream directly to the HTTP response with a sanitized `Content-Disposition` filename.

No database, Redis instance, background queue, or paid third-party extraction API is required.

---

## 2. Tech Stack

| Category | Package / Tool | Version / Notes |
| :--- | :--- | :--- |
| **Runtime** | Node.js | `>= 20.0.0` (ES2022 / NodeNext ESM) |
| **Web Framework** | `express` | `^4.21.2` |
| **Language** | `typescript` | `^5.7.3` (`strict: true`) |
| **Validation** | `zod` | `^3.24.2` (request body & query schema validation) |
| **CORS** | `cors` | `^2.8.5` (dynamic allowlist origin validation) |
| **Rate Limiting** | `express-rate-limit` | `^7.5.0` (sliding window IP rate limiter) |
| **Environment** | `dotenv` | `^16.4.7` |
| **Media Engine** | `yt-dlp` CLI | Invoked via `child_process.spawn` / `execFile` |
| **Media Processing** | `ffmpeg` / `ffmpeg-static` | System `ffmpeg` in Docker; `ffmpeg-static` (`^5.2.0`) fallback locally |
| **Dev Runner** | `tsx` | `^4.19.3` (`tsx watch` for local development) |
| **Testing** | `vitest`, `supertest` | `^3.0.6` / `^7.0.0` (unit & HTTP integration tests) |

---

## 3. Architecture and Project Structure

```text
server/
├── src/
│   ├── adapters/
│   │   └── ytdlp.adapter.ts              # Binary discovery, child_process spawning, timeouts, stderr mapping, process cleanup
│   ├── controllers/
│   │   └── download.controller.ts        # Express handlers for /api/health, /api/info, and /api/download
│   ├── middleware/
│   │   ├── error.middleware.ts           # 404 handler and centralized error handler (prevents leaking internal stack traces)
│   │   └── validate-request.middleware.ts # Zod validation middleware for req.body and req.query
│   ├── routes/
│   │   └── download.routes.ts            # Router definition and rate-limiter attachment
│   ├── services/
│   │   ├── downloader.service.ts         # Coordinates network safety verification and download stream creation
│   │   └── media-info.service.ts         # Normalizes raw yt-dlp JSON, filters formats, and detects clean TikTok streams
│   ├── types/
│   │   └── downloader.ts                 # Shared TypeScript interfaces, DownloadOptionId enum, and AppError class
│   ├── utils/
│   │   └── filename.ts                   # Sanitizes titles into portable ASCII + RFC 5987 UTF-8 Content-Disposition headers
│   ├── validators/
│   │   └── download.validator.ts         # URL parsing, HTTPS enforcement, domain boundary checks, SSRF/DNS/redirect validation
│   ├── app.ts                            # Express app factory, multi-origin CORS parser, JSON body limit, middleware wiring
│   └── index.ts                          # Server entry point and SIGINT/SIGTERM graceful shutdown handler
├── tests/
│   └── download.test.ts                  # Vitest + Supertest suite (URL safety, normalization, endpoints, streaming, CORS)
├── .dockerignore                         # Excludes node_modules, dist, tests, and .env from Docker build context
├── .env.example                          # Documented environment variable template
├── .gitignore                            # Backend Git ignore rules
├── Dockerfile                            # Multi-stage Node 20 + Python 3 + FFmpeg + yt-dlp container definition
├── package.json                          # Backend scripts and dependencies
└── tsconfig.json                         # TypeScript compiler configuration (NodeNext -> dist/)
```

---

## 4. Prerequisites

- **Node.js** `>= 20.0.0` and **npm** `>= 10.0.0`
- **Python 3** (`python3`, required by the standalone `yt-dlp` release script)
- **`yt-dlp`**:
  - **In Docker:** Automatically downloaded from official GitHub releases into `/usr/local/bin/yt-dlp` during `docker build`.
  - **Locally:** Auto-detected from `YTDLP_PATH`, `/usr/local/bin/yt-dlp`, `/usr/bin/yt-dlp`, `~/.local/bin/yt-dlp`, or system `PATH`.
- **FFmpeg**:
  - **In Docker:** Installed via `apt-get install ffmpeg` at `/usr/bin/ffmpeg`.
  - **Locally:** Auto-detected from `FFMPEG_PATH`, `/usr/bin/ffmpeg`, `/usr/local/bin/ffmpeg`, or automatically provided by the bundled `ffmpeg-static` npm package.

---

## 5. Installation and Setup

### 1. Install Dependencies

From the `server/` directory:

```bash
cd server
npm install
```

*(Or from the repository root: `npm run install:all`)*

If your environment blocks npm postinstall scripts by default, ensure the `ffmpeg-static` and `esbuild` binaries are unpacked:

```bash
node node_modules/ffmpeg-static/install.js
node node_modules/esbuild/install.js
```

### 2. Install `yt-dlp` (Local Non-Docker Development)

If `yt-dlp` is not already installed on your host machine:

```bash
mkdir -p ~/.local/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp
chmod a+rx ~/.local/bin/yt-dlp
~/.local/bin/yt-dlp --version
```

### 3. Configure Environment File

Copy `.env.example` to `.env` inside `server/`:

```bash
cp .env.example .env
```

---

## 6. Environment Variables

All supported variables are documented in [`server/.env.example`](./.env.example):

| Variable | Required | Default | Description |
| :--- | :--- | :--- | :--- |
| `PORT` | No | `3001` | Port on which the Express HTTP server listens. Render sets `PORT` automatically in production. |
| `CLIENT_ORIGIN` | No | `http://localhost:5173,https://downloader.pxxlspace.cv` | Comma-separated allowlist of permitted frontend origins for CORS. |
| `NODE_ENV` | No | `development` | Runtime mode (`development`, `production`, or `test`). |
| `EXTRACTION_TIMEOUT_MS` | No | `30000` | Maximum time in milliseconds allowed for `yt-dlp` metadata extraction (`POST /api/info`). |
| `DOWNLOAD_TIMEOUT_MS` | No | `120000` | Maximum time in milliseconds allowed for streaming a media download (`GET /api/download`). |
| `MAX_DOWNLOAD_SIZE_MB` | No | `200` | Maximum allowed download size in megabytes (enforced both via `--max-filesize` and stream byte counting). |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Duration of the rate-limiting window in milliseconds (default: 60 seconds). |
| `RATE_LIMIT_MAX_REQUESTS` | No | `20` | Maximum number of `/api/info` and `/api/download` requests per IP within `RATE_LIMIT_WINDOW_MS`. |
| `YTDLP_PATH` | No | *(auto-detected)* | Optional explicit filesystem path to the `yt-dlp` executable. |
| `FFMPEG_PATH` | No | *(auto-detected)* | Optional explicit filesystem path to the `ffmpeg` executable. |

Example `server/.env`:

```dotenv
PORT=3001
CLIENT_ORIGIN=http://localhost:5173,https://downloader.pxxlspace.cv
NODE_ENV=development
EXTRACTION_TIMEOUT_MS=30000
DOWNLOAD_TIMEOUT_MS=120000
MAX_DOWNLOAD_SIZE_MB=200
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=20
YTDLP_PATH=
FFMPEG_PATH=
```

---

## 7. Running the Backend

### Commands Inside `server/`

```bash
# Start in watch mode for local development (tsx watch src/index.ts)
npm run dev

# Run TypeScript typechecking without emitting files (tsc --noEmit)
npm run typecheck

# Compile TypeScript to server/dist/ (tsc)
npm run build

# Start compiled production server (node dist/index.js)
npm run start

# Run automated test suite (vitest run)
npm test
```

### Equivalent Commands from the Repository Root (`downloader/`)

```bash
npm run dev:server
npm run typecheck
npm run build:server
npm run start:server
npm run test:server
```

---

## 8. API Documentation

### 1. Health Check — `GET /api/health`

Reports whether the API is online and whether `yt-dlp` is accessible. Does not run a live media extraction or count against the extraction rate limit.

**Example Request:**
```bash
curl -i http://localhost:3001/api/health
```

**Success Response (`200 OK`):**
```json
{
  "status": "ok",
  "service": "universal-video-downloader-api",
  "timestamp": "2026-10-28T18:00:00.000Z",
  "uptimeSeconds": 18,
  "extractor": {
    "engine": "yt-dlp",
    "available": true,
    "version": "2026.10.26"
  }
}
```

---

### 2. Retrieve Media Metadata — `POST /api/info`

Validates a media URL, verifies DNS/redirect safety, extracts metadata via `yt-dlp`, and returns normalized video details and available download options.

**Validation Rules:**
- Request body must be JSON (`<= 16kb`) containing `{ "url": "<string>" }`.
- `url` must be `<= 2048` characters, use `https:`, contain no embedded credentials (`user:pass`), not target a private/loopback/internal host, and match a supported platform (`tiktok`, `instagram`, `x`, or `direct` media file extension).

**Example Request:**
```bash
curl -X POST http://localhost:3001/api/info \
  -H "Content-Type: application/json" \
  -d '{"url":"https://www.tiktok.com/@tiktok/video/7106594312292453675"}'
```

**Success Response (`200 OK`):**
```json
{
  "data": {
    "id": "7106594312292453675",
    "url": "https://www.tiktok.com/@tiktok/video/7106594312292453675",
    "resolvedUrl": "https://www.tiktok.com/@tiktok/video/7106594312292453675",
    "title": "how many frogs did you find? 🐸 check out tiktok’s #Minecraft communit...",
    "thumbnail": "https://p16-common-sign.tiktokcdn.com/...",
    "duration": 24,
    "uploader": "tiktok",
    "platform": "tiktok",
    "extractor": "TikTok",
    "watermarkFreeAvailable": true,
    "options": [
      {
        "id": "nowatermark",
        "label": "MP4 (No Watermark)",
        "quality": "1920p Clean",
        "ext": "mp4",
        "watermarkFree": true,
        "hasAudio": true,
        "filesizeApprox": 3360445
      },
      {
        "id": "best",
        "label": "Best Quality (MP4)",
        "quality": "1920p",
        "ext": "mp4",
        "watermarkFree": true,
        "hasAudio": true,
        "filesizeApprox": 3360445
      },
      {
        "id": "hd_1080p",
        "label": "Full HD 1080p (MP4)",
        "quality": "1080p",
        "ext": "mp4",
        "hasAudio": true,
        "filesizeApprox": null
      },
      {
        "id": "hd_720p",
        "label": "HD 720p (MP4)",
        "quality": "720p",
        "ext": "mp4",
        "hasAudio": true,
        "filesizeApprox": null
      },
      {
        "id": "audio",
        "label": "Audio Only (M4A)",
        "quality": "Best Audio",
        "ext": "m4a",
        "hasAudio": true,
        "filesizeApprox": null
      }
    ]
  }
}
```

---

### 3. Stream Media Download — `GET /api/download`

Starts the `yt-dlp` download stream for the requested URL and format option and pipes the binary output directly to the HTTP response.

**Query Parameters:**
- `url` *(required)*: Validated HTTPS media URL.
- `option` *(optional, defaults to `best`)*: Must be one of the server-defined `DownloadOptionId` values:
  - `best` — Best available MP4 video + audio stream
  - `nowatermark` — Unwatermarked TikTok MP4 stream (falls back to best MP4 if non-TikTok)
  - `hd_1080p` — MP4 up to 1080p height
  - `hd_720p` — MP4 up to 720p height
  - `sd_480p` — MP4 up to 480p height
  - `audio` — Best audio stream (`audio/mp4` `.m4a`)
- `title` *(optional, max 200 chars)*: Base title used to construct the sanitized download filename.

**Example Request:**
```bash
curl -L -o video.mp4 \
  "http://localhost:3001/api/download?url=https%3A%2F%2Fwww.w3schools.com%2Fhtml%2Fmov_bbb.mp4&option=best&title=Sample%20Clip"
```

**Success Response (`200 OK`):**
- `Content-Type`: `video/mp4` (or `audio/mp4` for `option=audio`)
- `Content-Disposition`: `attachment; filename="Sample-Clip.mp4"; filename*=UTF-8''Sample%20Clip.mp4`
- `Cache-Control`: `no-store, no-transform`
- `X-Content-Type-Options`: `nosniff`
- Body: Streamed media bytes.

---

### Error Responses

All errors return a structured JSON payload:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Only secure HTTPS URLs are supported."
  }
}
```

| Status Code | Error Code(s) | Cause |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR`, `INVALID_JSON`, `MALFORMED_URL`, `UNSUPPORTED_PROTOCOL`, `FORBIDDEN_HOST`, `FORBIDDEN_RESOLVED_IP`, `UNSUPPORTED_PLATFORM`, `MISSING_MEDIA_PATH` | Invalid JSON, missing/invalid parameters, non-HTTPS URL, private/internal host or resolved IP, or unsupported platform domain. |
| `403` | `CORS_NOT_ALLOWED`, `CONTENT_PRIVATE_OR_RESTRICTED`, `GEO_RESTRICTED` | Unlisted `Origin` header, private account/post requiring login, or region-locked media. |
| `404` | `MEDIA_NOT_FOUND`, `NOT_FOUND` | Deleted/non-existent media post, post without video, or unknown API route. |
| `413` | `PAYLOAD_TOO_LARGE`, `METADATA_TOO_LARGE`, `FILE_TOO_LARGE` | Request body `> 16kb`, metadata JSON `> 10MB`, or media stream `> MAX_DOWNLOAD_SIZE_MB`. |
| `422` | `EXTRACTION_FAILED`, `UNSUPPORTED_MEDIA_URL`, `EMPTY_METADATA`, `NO_VIDEO_FORMATS`, `EMPTY_MEDIA_STREAM` | Extractor could not extract a playable video stream from the URL. |
| `429` | `RATE_LIMIT_EXCEEDED`, `UPSTREAM_RATE_LIMIT` | Client exceeded `RATE_LIMIT_MAX_REQUESTS` or source platform rate-limited the server IP. |
| `502` | `INVALID_EXTRACTOR_JSON` | Extractor returned malformed JSON output. |
| `503` | `EXTRACTOR_UNAVAILABLE` | `yt-dlp` binary is missing on the server (`ENOENT`). |
| `504` | `EXTRACTION_TIMEOUT`, `DOWNLOAD_TIMEOUT` | Metadata extraction or download streaming exceeded its timeout. |

---

## 9. CORS Configuration

CORS is configured in [`src/app.ts`](./src/app.ts) using `parseAllowedOrigins()`.

```dotenv
CLIENT_ORIGIN=http://localhost:5173,https://downloader.pxxlspace.cv
```

### How Origin Validation Works
1. **Comma-Separated Allowlist:** `CLIENT_ORIGIN` is split on commas (`,`), whitespace around each entry is trimmed, trailing slashes are stripped, and empty strings are removed.
2. **Wildcard Rejection:** Wildcard entries (`*`) are explicitly filtered out so the server never allows unrestricted cross-origin browser access.
3. **Browser Origin Matching:** When an incoming request includes an `Origin` header, the normalized origin is compared against the parsed allowlist:
   - If matched (e.g., `http://localhost:5173` or `https://downloader.pxxlspace.cv`), the `cors` middleware reflects that specific origin in `Access-Control-Allow-Origin`.
   - If not matched, the request is rejected with `403 Forbidden` (`CORS_NOT_ALLOWED`).
4. **Requests Without an `Origin` Header:** Requests that do not carry an `Origin` header (such as `curl` commands, Render `/api/health` probes, or direct top-level browser navigations) are permitted (`if (!origin) callback(null, true)`). Standard browser `fetch`/`XHR` calls from another origin always attach an `Origin` header and remain strictly enforced against the allowlist.

---

## 10. Download Processing Pipeline

1. **URL & Network Verification (`verifyNetworkSafetyAndRedirects`):**
   - Validates `https:` protocol, rejects embedded credentials, checks hostname boundaries (`matchesDomainBoundary`), and verifies that DNS `A`/`AAAA` lookups do not resolve to private/loopback/link-local/CGNAT IPv4 or IPv6 addresses.
   - For short links (`vm.tiktok.com`, `vt.tiktok.com`, `t.co`, `instagr.am`) and direct media links, performs a manual `HEAD` pre-flight check (`redirect: 'manual'`, up to 5 hops) validating each redirect target against the same SSRF rules.
2. **Metadata Extraction (`extractMediaInfo`):**
   - Spawns `yt-dlp` with `['--dump-single-json', '--no-playlist', '--no-warnings', '--no-progress', '--no-cache-dir', '--geo-bypass', '--socket-timeout', '15', '--', url]`.
   - Enforces a `10MB` stdout buffer cap and `EXTRACTION_TIMEOUT_MS` timeout.
3. **Normalization & Watermark Inspection (`normalizeMediaMetadata`):**
   - Filters `formats` for video streams and inspects TikTok formats for watermark indicators (`format_id === 'download'` or `format_note` containing `watermark`).
   - Exposes `nowatermark` only when at least one unwatermarked video stream exists on a TikTok post; otherwise sets `watermarkFreeAvailable: false`.
   - Sanitizes thumbnail URLs to ensure only valid public `https:` URLs are returned.
4. **Direct Streaming & First-Byte Gate (`createMediaDownloadStream`):**
   - Spawns `yt-dlp` with `-o -` (standard output), `--no-part`, `--max-filesize <MAX_DOWNLOAD_SIZE_MB>M`, `-f <formatSelector>`, and `--ffmpeg-location <ffmpegPath>` (when available).
   - No temporary media files are written to disk (`--no-cache-dir --no-part -o -`).
   - **First-Byte Gate:** The Promise returned by `createMediaDownloadStream()` waits to resolve until `child.stdout` emits its **first `data` chunk**.
     - If `yt-dlp` exits with an error before producing any media bytes, the Promise rejects and Express returns a clean HTTP error status (`403`, `404`, `422`, `504`) before response headers are sent.
     - Once the first chunk arrives, the controller writes `200 OK` headers (`Content-Type`, `Content-Disposition`) and pipes the `PassThrough` stream to `res` with backpressure control (`child.stdout.pause()` / `passThrough.once('drain')`).
5. **Process Cleanup (`terminateChildProcess`):**
   - Active child processes are tracked in an in-memory `Set<ChildProcess>`.
   - If the client closes the connection early (`req.on('close')`), the download exceeds `DOWNLOAD_TIMEOUT_MS` or `MAX_DOWNLOAD_SIZE_MB`, or the server receives `SIGINT`/`SIGTERM`, the child process is sent `SIGTERM` followed by `SIGKILL` after 2 seconds if still alive.

---

## 11. Error Handling and Security

### Implemented Safeguards
- **No Shell Interpolation:** `yt-dlp` is invoked exclusively via `spawn` and `execFile` with argument arrays and `--` before the URL, eliminating shell injection and option-flag injection.
- **SSRF & Private Network Blocking:** Blocks `localhost`, `.local`, `.internal`, `.arpa`, single-label hosts, numeric/hex IP obfuscations, and private/reserved IPv4 (`0.0.0.0/8`, `10.0.0.0/8`, `100.64.0.0/10`, `127.0.0.0/8`, `169.254.0.0/16`, `172.16.0.0/12`, `192.168.0.0/16`, `224.0.0.0/4`) and IPv6 (`::1`, `fc00::/7`, `fe80::/10`, `::ffff:...`) ranges across both URL hostnames and DNS lookup results.
- **Rate Limiting:** `express-rate-limit` restricts each client IP to `RATE_LIMIT_MAX_REQUESTS` (default `20`) per `RATE_LIMIT_WINDOW_MS` (default `60000` ms) on `/api/info` and `/api/download`.
- **Payload & Stream Caps:** `express.json({ limit: '16kb' })` protects against large JSON bodies; metadata stdout is capped at `10MB`; media streams are capped at `MAX_DOWNLOAD_SIZE_MB` (default `200MB`).
- **Sanitized Error Responses:** [`error.middleware.ts`](./src/middleware/error.middleware.ts) and [`mapExtractorStderrToAppError`](./src/adapters/ytdlp.adapter.ts) translate internal errors and raw `yt-dlp` stderr into safe client messages without exposing filesystem paths, environment variables, or stack traces.

### Known Limitations
- **In-Memory Rate Limiting:** `express-rate-limit` uses its default in-memory store, which resets on server restart and is per-process.
- **No Global Process Queue:** Concurrent `yt-dlp` child processes are bounded by the per-IP rate limiter and timeouts rather than a fixed global worker pool; this is designed for personal/single-user usage rather than high-concurrency multi-tenant traffic.

---

## 12. Testing and Build Verification

Run the automated test suite and build checks from `server/`:

```bash
# Run all 19 unit and integration tests
npm test

# Run TypeScript typecheck
npm run typecheck

# Compile production build to dist/
npm run build
```

### What `tests/download.test.ts` Covers
- Valid URL classification for TikTok, `vm.tiktok.com`, Instagram Reels, X (`x.com` / `twitter.com`), and direct HTTPS `.mp4` links.
- Rejection of empty, malformed, `http://`, `ftp://`, `javascript:`, credential-embedded, and homepage-only URLs.
- Hostname boundary enforcement (rejecting lookalike domains like `evil-tiktok.com` and `tiktok.com.attacker.com`).
- Private/loopback/link-local IPv4 & IPv6 blocking (`127.0.0.1`, `10.0.0.1`, `172.16.5.4`, `192.168.1.100`, `169.254.169.254`, `::1`, `::ffff:127.0.0.1`, `fe80::1`, `fc00::1`).
- Filename sanitization and RFC 5987 `Content-Disposition` header formatting.
- TikTok watermark-free format detection (`watermarkFreeAvailable: true` vs `false`).
- `GET /api/health`, `POST /api/info`, and `GET /api/download` HTTP status codes, headers, streaming payload, error mapping, and `terminateChildProcess` cleanup.
- Multi-origin CORS allowlist parsing, acceptance of `http://localhost:5173` and `https://downloader.pxxlspace.cv`, handling of missing `Origin` headers, and `403 CORS_NOT_ALLOWED` rejection of unlisted origins.

---

## 13. Docker

The backend includes a multi-stage [`Dockerfile`](./Dockerfile) based on `node:20-bookworm-slim` that compiles TypeScript in Stage 1 and installs `python3`, `ffmpeg`, `ca-certificates`, `curl`, and `/usr/local/bin/yt-dlp` in Stage 2, running under the non-root `node` user.

### Build and Run with Docker CLI

From `server/`:

```bash
docker build -t pulsedl-server .
docker run --rm -p 3001:3001 --env-file .env pulsedl-server
```

### Build and Run with Docker Compose

From the repository root (`downloader/`):

```bash
docker compose up --build
```

---

## 14. Deployment (Render)

To deploy the backend as a Docker Web Service on **Render**:

1. Create a new **Web Service** in the Render Dashboard connected to your GitHub repository.
2. Configure the service settings:
   - **Root Directory:** `server`
   - **Language / Runtime:** `Docker`
   - **Dockerfile Path:** `./Dockerfile`
   - **Health Check Path:** `/api/health`
3. Configure the **Environment Variables** in Render:
   ```dotenv
   NODE_ENV=production
   CLIENT_ORIGIN=http://localhost:5173,https://downloader.pxxlspace.cv
   EXTRACTION_TIMEOUT_MS=30000
   DOWNLOAD_TIMEOUT_MS=120000
   MAX_DOWNLOAD_SIZE_MB=200
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX_REQUESTS=20
   ```
   *(Render automatically injects `PORT` at runtime.)*
4. On your deployed frontend (e.g., Vercel or `https://downloader.pxxlspace.cv`), set `VITE_API_BASE_URL` to your Render service's HTTPS URL (without a trailing slash) and redeploy the frontend.

---

## 15. Troubleshooting

- **`503 EXTRACTOR_UNAVAILABLE` (`Media extraction engine (yt-dlp) is not available`):**
  - `yt-dlp` was not found in `YTDLP_PATH`, `/usr/local/bin/yt-dlp`, `/usr/bin/yt-dlp`, `~/.local/bin/yt-dlp`, or `PATH`. Install the binary (see [Installation and Setup](#5-installation-and-setup)) or set `YTDLP_PATH` in `server/.env`.
- **`403 CORS_NOT_ALLOWED` in Browser DevTools:**
  - Confirm that the exact browser origin (scheme + hostname + port, without a trailing path) is included in `CLIENT_ORIGIN` in `server/.env` (or in your Render environment settings) and restart/redeploy the backend.
- **`403 CONTENT_PRIVATE_OR_RESTRICTED` or `422 EXTRACTION_FAILED` on Valid Social Links:**
  - The post may be private, age-restricted, or blocked by an upstream platform login wall/rate limit on datacenter IPs.
  - If an upstream platform changed its extractor layout, update `yt-dlp` locally (`curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp`) or trigger **Clear build cache & deploy** on Render to fetch the latest `yt-dlp` release.
- **`504 EXTRACTION_TIMEOUT` / `504 DOWNLOAD_TIMEOUT`:**
  - Increase `EXTRACTION_TIMEOUT_MS` or `DOWNLOAD_TIMEOUT_MS` in `server/.env`. Note that free Render instances spin down after inactivity and may take 30–50 seconds to wake on the first request.
