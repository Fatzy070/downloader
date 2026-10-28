# Fatzy — Personal Universal Video Downloader

A clean, fast, self-hosted personal media downloader for **TikTok**, **Instagram**, **X (formerly Twitter)**, and **direct HTTPS media links**. Built as an open-source monorepo with a **React + Vite + TypeScript + Tailwind CSS** frontend (`client/`) and a **Node.js + Express + TypeScript** backend (`server/`) powered by **`yt-dlp`** and **FFmpeg**.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [Technology Stack](#3-technology-stack)
4. [Monorepo Structure](#4-monorepo-structure)
5. [Prerequisites & Installation](#5-prerequisites--installation)
6. [Environment Variables](#6-environment-variables)
7. [Commands to Run, Test, and Build](#7-commands-to-run-test-and-build)
8. [Deployment Guide (Vercel + Render + Docker)](#8-deployment-guide-vercel--render--docker)
9. [API Overview](#9-api-overview)
10. [Troubleshooting & Updating `yt-dlp`](#10-troubleshooting--updating-yt-dlp)
11. [License](#11-license)
12. [Author & Attribution](#12-author--attribution)

---

## 1. Project Overview

**Fatzy** allows you to paste a supported public media link, inspect its metadata (title, creator/uploader, duration, thumbnail, and available format options), and stream the media file directly to your device through your browser—without third-party advertisements, misleading download buttons, pop-ups, or unnecessary redirects.

### Supported Platforms

- **TikTok** (`tiktok.com`, `www.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`, `m.tiktok.com`) — automatically detects and selects legitimate **watermark-free** streams when provided by the source, and clearly badges when only a watermarked stream is available.
- **Instagram** (`instagram.com`, `www.instagram.com`, `instagr.am`) — public Reels and video posts.
- **X / Twitter** (`x.com`, `www.x.com`, `twitter.com`, `www.twitter.com`, `mobile.x.com`, `t.co`) — public video posts.
- **Direct HTTPS Media Links** — direct public links ending in `.mp4`, `.webm`, `.mov`, `.m4v`, `.mp3`, `.m4a`, `.ogg`, or `.wav`.

### Extraction Engine & Platform Compatibility

This project uses the open-source [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) CLI (with `curl-cffi` TLS impersonation in Docker) as its extraction engine, paired with **FFmpeg** when stream handling or audio extraction is required. No paid third-party extraction API or API key is required.

Because social platforms frequently change their internal APIs, rate limits, and authentication requirements, platform compatibility depends on the installed version of `yt-dlp` and the public accessibility of the source post. Private accounts, login-only posts, paywalled media, and geo-restricted content are not bypassed and will return a clear error message.

### Personal Use & Open-Source License

- **License:** This project is free and open-source software released under the [MIT License](./LICENSE).
- **Responsible Use:** This tool is intended strictly for personal use (such as archiving your own content or saving publicly shared clips where permitted). Users are solely responsible for complying with applicable copyright laws, creator rights, privacy rules, and each platform's terms of service.

---

## 2. Features

- **URL Submission & Validation:** Client-side and server-side validation enforcing `https://` URLs, strict domain boundary checks, and SSRF protection against localhost, private IPv4/IPv6 ranges, and link-local/cloud metadata endpoints.
- **Media Metadata Retrieval (`POST /api/info`):** Fetches and normalizes video title, thumbnail URL, duration, creator/uploader handle, platform badge, and available download quality options.
- **Watermark-Free TikTok Detection:** Inspects extractor format metadata on TikTok URLs to offer a clean (`nowatermark`) MP4 stream when legitimately available from the source.
- **Video Preview & Format Selection:** Responsive preview card with thumbnail fallback, duration badge, creator attribution, estimated file size, and format selector (`No Watermark`, `Best Quality`, `1080p`, `720p`, `480p`, `Audio Only M4A`).
- **Direct Browser Streaming (`GET /api/download`):** Streams media directly from `yt-dlp` standard output to the HTTP response without buffering full video files in Node.js memory.
- **First-Byte Stream Gate:** Waits for the first media chunk before sending `200 OK` headers so extraction failures return clean JSON HTTP status codes (`400`, `403`, `404`, `422`, `504`) instead of broken 0-byte downloads.
- **Automatic Child-Process Cleanup:** Terminates spawned `yt-dlp` processes on client disconnect, timeout, size-limit violation, or server shutdown.
- **Modern React UI:** Built with React 19, Vite 6, TypeScript, Tailwind CSS (with persistent light/dark mode toggle), and TanStack Query v5.

---

## 3. Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend (`client/`)** | React 19, Vite 6, TypeScript 5.7, Tailwind CSS 3.4, TanStack Query v5 (`@tanstack/react-query`), Lucide React |
| **Backend (`server/`)** | Node.js (v20+), Express 4, TypeScript 5.7, Zod, CORS, Express Rate Limit (`express-rate-limit`) |
| **Media Extraction** | `yt-dlp` CLI (`yt-dlp[default,curl-cffi]` in Docker), FFmpeg (system `ffmpeg` in Docker or bundled `ffmpeg-static` in local development) |
| **Automated Testing** | Vitest 3, Supertest (backend HTTP/unit tests), React Testing Library + JSDOM + `@testing-library/user-event` (frontend tests) |
| **Deployment** | Vercel (Frontend from `client/`), Render Docker Web Service (Backend from `server/`) |

---

## 4. Monorepo Structure

Both applications maintain independent `package.json` and `package-lock.json` files so they can be developed, tested, built, and deployed independently without workspace overhead:

```text
downloader/
├── client/                          # React + Vite + TypeScript + Tailwind frontend (deployed on Vercel)
│   ├── public/
│   ├── src/
│   ├── .env.example
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   ├── README.md                    # Frontend-specific documentation
│   ├── vercel.json                  # Vercel SPA rewrite configuration
│   └── vite.config.ts
├── server/                          # Express + TypeScript backend API (deployed on Render via Docker)
│   ├── src/
│   ├── tests/
│   ├── .dockerignore
│   ├── .env.example
│   ├── Dockerfile                   # Multi-stage Docker build with Python 3, FFmpeg, and yt-dlp[default,curl-cffi]
│   ├── package.json
│   ├── package-lock.json
│   ├── README.md                    # Backend-specific architecture & API reference
│   └── tsconfig.json
├── docker-compose.yml               # Local Docker Compose configuration for the backend service
├── .gitignore
├── LICENSE                          # MIT License
└── README.md                        # Root monorepo documentation
```

For detailed layer-specific documentation, see:
- **Frontend Documentation:** [`client/README.md`](./client/README.md)
- **Backend Documentation:** [`server/README.md`](./server/README.md)

---

## 5. Prerequisites & Installation

### Required Software

1. **Git** (`>= 2.25`)
2. **Node.js** (`>= 20.0.0`) and **npm** (`>= 10.0.0`)
3. **Python 3** (`>= 3.10`) — required on the host machine by `yt-dlp` when running outside Docker
4. **`yt-dlp`** — installed in `~/.local/bin/yt-dlp`, `/usr/local/bin/yt-dlp`, or system `PATH`
5. **FFmpeg** — optional on the host because `server/package.json` includes `ffmpeg-static` as an automatic fallback, or install system `ffmpeg`

### Clone and Install

```bash
git clone https://github.com/Fatzy070/downloader.git
cd downloader

# Install backend dependencies
cd server
npm install

# Install frontend dependencies
cd ../client
npm install
```

### Install `yt-dlp` Locally (Linux / macOS)

```bash
mkdir -p ~/.local/bin
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp
chmod a+rx ~/.local/bin/yt-dlp
```

---

## 6. Environment Variables

Local `.env` files are ignored by Git. Copy the tracked `.env.example` templates before running locally:

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

### Backend (`server/.env`)

| Variable | Purpose | Local Default |
| :--- | :--- | :--- |
| `PORT` | TCP port on which the Express backend listens. | `3001` |
| `CLIENT_ORIGIN` | Comma-separated list of allowed frontend origins for CORS. | `http://localhost:5173,https://downloader.pxxlspace.cv` |
| `NODE_ENV` | Runtime environment (`development`, `production`, or `test`). | `development` |
| `EXTRACTION_TIMEOUT_MS` | Maximum time (in ms) allowed for `yt-dlp` metadata extraction (`POST /api/info`). | `30000` |
| `DOWNLOAD_TIMEOUT_MS` | Maximum time (in ms) allowed for streaming a download (`GET /api/download`). | `120000` |
| `MAX_DOWNLOAD_SIZE_MB` | Maximum permitted media download size in megabytes. | `200` |
| `RATE_LIMIT_WINDOW_MS` | Rate-limiter sliding window duration in milliseconds. | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Maximum requests allowed per IP within `RATE_LIMIT_WINDOW_MS`. | `20` |
| `YTDLP_PATH` | Optional explicit path to the `yt-dlp` binary. | *(auto-detected)* |
| `FFMPEG_PATH` | Optional explicit path to the `ffmpeg` binary. | *(auto-detected)* |

### Frontend (`client/.env`)

| Variable | Purpose | Local Default |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Base URL of the Express backend API (without a trailing slash). | `http://localhost:3001` |

---

## 7. Commands to Run, Test, and Build

### Backend (`server/`)

```bash
cd server

# Start development server with hot reload on http://localhost:3001
npm run dev

# Run TypeScript typechecking
npm run typecheck

# Run backend unit & integration tests (Vitest + Supertest)
npm test

# Compile TypeScript to server/dist/
npm run build

# Start compiled production server
npm start
```

### Frontend (`client/`)

```bash
cd client

# Start Vite development server on http://localhost:5173
npm run dev

# Run TypeScript typechecking
npm run typecheck

# Run frontend unit & component tests (Vitest + React Testing Library)
npm test

# Build production static bundle to client/dist/
npm run build
```

---

## 8. Deployment Guide (Vercel + Render + Docker)

Both applications deploy independently from this single `Fatzy070/downloader` monorepo:

### 1. Frontend Deployment on Vercel (`client/`)
- **Repository:** `Fatzy070/downloader`
- **Root Directory:** `client`
- **Framework Preset:** `Vite`
- **Build Command:** `npm run build`
- **Output Directory:** `dist`
- **Environment Variable:**
  - `VITE_API_BASE_URL` = `https://<your-render-backend>.onrender.com` *(no trailing slash)*

### 2. Backend Deployment on Render (`server/`)
- **Repository:** `Fatzy070/downloader`
- **Root Directory:** `server`
- **Runtime / Environment:** `Docker`
- **Dockerfile Path:** `./Dockerfile`
- **Health Check Path:** `/api/health`
- **Environment Variables:**
  - `NODE_ENV=production`
  - `CLIENT_ORIGIN=http://localhost:5173,https://<your-vercel-domain>.vercel.app`
  - `EXTRACTION_TIMEOUT_MS=30000`
  - `DOWNLOAD_TIMEOUT_MS=120000`
  - `MAX_DOWNLOAD_SIZE_MB=200`
  - `RATE_LIMIT_WINDOW_MS=60000`
  - `RATE_LIMIT_MAX_REQUESTS=20`

### 3. Local Docker / Docker Compose (`server/`)

From `server/`:
```bash
docker build -t fatzy-server .
docker run --rm -p 3001:3001 --env-file .env fatzy-server
```

Or from the monorepo root (`downloader/`):
```bash
docker compose up --build
```

---

## 9. API Overview

- **`GET /api/health`** — Returns service status, uptime, and detected `yt-dlp` version.
- **`POST /api/info`** — Validates `{ "url": "https://..." }`, resolves short links safely, and returns normalized metadata (`id`, `title`, `uploader`, `duration`, `thumbnail`, `platform`, `watermarkFreeAvailable`, `options`, `resolvedUrl`).
- **`GET /api/download?url=...&option=...&title=...`** — Streams the selected format directly from `yt-dlp` to the browser with a sanitized `Content-Disposition` attachment filename.

See [`server/README.md`](./server/README.md) for full request/response schemas and status codes.

---

## 10. Troubleshooting & Updating `yt-dlp`

- **CORS Errors (`403 CORS_NOT_ALLOWED`):** Ensure your exact frontend origin (e.g. `https://<your-vercel-app>.vercel.app` without a trailing slash) is listed in the backend's `CLIENT_ORIGIN` environment variable.
- **Updating `yt-dlp` in Production (Render):** Trigger **Manual Deploy → Clear build cache & deploy** on Render so Docker rebuilds Stage 2 with the latest `yt-dlp[default,curl-cffi]` release.

---

## 11. License

This project is licensed under the **MIT License**. See the [LICENSE](./LICENSE) file for details.

---

## 12. Author & Attribution

Created by **Faruk**  
Follow my updates on X: [@fatzy_tech](https://x.com/fatzy_tech)
