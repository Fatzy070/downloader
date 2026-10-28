# PulseDL — Personal Universal Video Downloader

A clean, fast, self-hosted personal media downloader for **TikTok**, **Instagram**, **X (formerly Twitter)**, and **direct HTTPS media links**. Built with a **React + Vite + TypeScript + Tailwind CSS** frontend and a **Node.js + Express + TypeScript** backend powered by **`yt-dlp`** and **FFmpeg**.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Features](#2-features)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Prerequisites & Installation](#5-prerequisites--installation)
6. [Environment Variables](#6-environment-variables)
7. [Commands to Run, Test, and Build](#7-commands-to-run-test-and-build)
8. [Self-Hosting & Deployment Options](#8-self-hosting--deployment-options)
9. [API Documentation](#9-api-documentation)
10. [Troubleshooting & Updating `yt-dlp`](#10-troubleshooting--updating-yt-dlp)
11. [License](#11-license)
12. [Author & Attribution](#12-author--attribution)

---

## 1. Project Overview

**PulseDL** allows you to paste a supported public media link, inspect its metadata (title, creator/uploader, duration, thumbnail, and available format options), and stream the media file directly to your device through your browser—without third-party advertisements, misleading download buttons, pop-ups, or unnecessary redirects.

### Supported Platforms

- **TikTok** (`tiktok.com`, `www.tiktok.com`, `vm.tiktok.com`, `vt.tiktok.com`, `m.tiktok.com`) — automatically detects and selects legitimate **watermark-free** streams when provided by the source, and clearly badges when only a watermarked stream is available.
- **Instagram** (`instagram.com`, `www.instagram.com`, `instagr.am`) — public Reels and video posts.
- **X / Twitter** (`x.com`, `www.x.com`, `twitter.com`, `www.twitter.com`, `mobile.x.com`, `t.co`) — public video posts.
- **Direct HTTPS Media Links** — direct public links ending in `.mp4`, `.webm`, `.mov`, `.m4v`, `.mp3`, `.m4a`, `.ogg`, or `.wav`.

### Extraction Engine & Platform Compatibility

This project uses the open-source [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) CLI as its extraction engine, paired with **FFmpeg** when stream handling or audio extraction is required. No paid third-party extraction API or API key is required.

Because social platforms frequently change their internal APIs, rate limits, and authentication requirements, platform compatibility depends on the installed version of `yt-dlp` and the public accessibility of the source post. Private accounts, login-only posts, paywalled media, and geo-restricted content are not bypassed and will return a clear error message.

### Personal Use & Open-Source License

- **License:** This project is free and open-source software released under the MIT License.
- **Responsible Use:** This tool is intended strictly for personal use (such as archiving your own content or saving publicly shared clips where permitted). Users are solely responsible for complying with applicable copyright laws, creator rights, privacy rules, and each platform's terms of service.

---

## 2. Features

### Implemented & Verified Features
- **URL Submission & Validation:** Client-side and server-side validation enforcing `https://` URLs, strict domain boundary checks, and SSRF protection against localhost, private IPv4/IPv6 ranges, and link-local/cloud metadata endpoints.
- **Media Metadata Retrieval (`POST /api/info`):** Fetches and normalizes video title, thumbnail URL, duration, creator/uploader handle, platform badge, and available download quality options.
- **Watermark-Free TikTok Detection:** Inspects extractor format metadata on TikTok URLs to offer a clean (`nowatermark`) MP4 stream when legitimately available from the source.
- **Video Preview & Format Selection:** Responsive preview card with thumbnail fallback, duration badge, creator attribution, estimated file size, and format selector (`No Watermark`, `Best Quality`, `1080p`, `720p`, `480p`, `Audio Only M4A`).
- **Direct Browser Streaming (`GET /api/download`):** Streams media directly from `yt-dlp` standard output to the HTTP response without buffering full video files in Node.js memory.
- **First-Byte Stream Gate:** Waits for the first media chunk before sending `200 OK` headers so extraction failures return clean JSON HTTP status codes (`400`, `403`, `404`, `422`, `504`) instead of broken 0-byte downloads.
- **Automatic Child-Process Cleanup:** Terminates spawned `yt-dlp` processes on client disconnect, timeout, size-limit violation, or server shutdown.
- **Modern React UI:** Built with React 19, Vite 6, TypeScript, Tailwind CSS (with persistent light/dark mode toggle), and TanStack Query v5.
- **Zero Paid APIs:** Runs 100% locally or on your own self-hosted server/container.

### Out-of-Scope / Unverified Functionality
- **Private or Login-Wall Bypass:** The application intentionally does not accept user session cookies or bypass private accounts, age gates, or login walls.
- **Playlists / Bulk Account Scraping:** Single-video extraction is enforced (`--no-playlist`) to keep resource usage predictable.

---

## 3. Technology Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend (`client/`)** | React 19, Vite 6, TypeScript 5.7, Tailwind CSS 3.4, TanStack Query v5 (`@tanstack/react-query`), Lucide React |
| **Backend (`server/`)** | Node.js (v20+), Express 4, TypeScript 5.7, Zod, CORS, Express Rate Limit (`express-rate-limit`) |
| **Media Extraction** | `yt-dlp` CLI, FFmpeg (system `ffmpeg` in Docker or bundled `ffmpeg-static` in local development) |
| **Automated Testing** | Vitest 3, Supertest (backend HTTP/unit tests), React Testing Library + JSDOM + `@testing-library/user-event` (frontend tests) |
| **Deployment** | Docker (`node:20-bookworm-slim` multi-stage build), Render (Docker Web Service), Vercel (Static Vite SPA) |

---

## 4. Project Structure

```text
client/                              # React + Vite + TypeScript frontend
├── public/
│   └── favicon.svg                  # Application icon
├── src/
│   ├── components/                  # Reusable UI components
│   │   ├── Downloader.tsx           # URL input form, clipboard paste, validation, and workflow orchestration
│   │   ├── VideoPreview.tsx         # Metadata card, thumbnail fallback, and format/quality selector
│   │   ├── DownloadButton.tsx       # Native browser stream trigger and download feedback
│   │   ├── PlatformBadge.tsx        # Platform badge indicator (TikTok, Instagram, X, Direct)
│   │   └── LoadingState.tsx         # Accessible skeleton state during metadata extraction
│   ├── pages/
│   │   └── Home.tsx                 # Main page layout, header, theme toggle, and feature highlights
│   ├── hooks/
│   │   └── useVideoInfo.ts          # TanStack Query mutation hook and cache reset logic
│   ├── lib/
│   │   └── queryClient.ts           # Shared TanStack QueryClient configuration
│   ├── services/
│   │   └── api.ts                   # Centralized HTTP client for /api/info, /api/download, /api/health
│   ├── types/
│   │   └── downloader.ts            # Shared frontend TypeScript interfaces
│   ├── test/
│   │   ├── setup.ts                 # Vitest + Testing Library setup
│   │   └── Downloader.test.tsx      # Frontend integration tests
│   ├── App.tsx                      # Root component with QueryClientProvider
│   ├── main.tsx                     # React DOM entry point
│   └── index.css                    # Tailwind CSS directives
├── .env.example                     # Frontend environment template (tracked in Git)
├── index.html                       # Vite HTML entry point
├── package.json                     # Frontend dependencies and scripts
├── postcss.config.js                # PostCSS configuration
├── tailwind.config.js               # Tailwind CSS configuration
├── tsconfig.json                    # Frontend TypeScript configuration
├── vercel.json                      # Vercel SPA routing configuration
└── vite.config.ts                   # Vite + Vitest configuration
```

---

## 5. Prerequisites & Installation

### Required Software

1. **Git** (`>= 2.25`)
2. **Node.js** (`>= 20.0.0`)
3. **npm** (`>= 10.0.0`)
4. **Backend API (`downloader-backend`)** running locally on port `3001` or deployed remotely.

### Check Installed Versions

```bash
git --version
node -v
npm -v
```

### Clone and Install the Frontend

```bash
git clone https://github.com/Fatzy070/downloader.git
cd downloader
npm install
```

*(If your npm configuration restricts postinstall scripts, run `node node_modules/esbuild/install.js` once after installing.)*

---

## 6. Environment Variables

Local `.env` files are ignored by Git so your local settings are never committed. A tracked `.env.example` template is included.

### Create Local `.env` File

```bash
cp .env.example .env
```

### Frontend Environment Variables (`.env`)

| Variable | Purpose | Local Default |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Base URL of the Express backend API (without a trailing slash). | `http://localhost:3001` |

> **Security Warning:** Vite embeds any variable prefixed with `VITE_` directly into the public browser JavaScript bundle at build time. Never put secret keys, tokens, or private credentials in `.env`.

### Backend Environment Variables (`server/.env`)

| Variable | Purpose | Local Default |
| :--- | :--- | :--- |
| `PORT` | TCP port on which the Express backend listens. | `3001` |
| `CLIENT_ORIGIN` | Comma-separated list of allowed frontend origins for CORS (whitespace is trimmed and empty values are ignored). | `http://localhost:5173,https://downloader.pxxlspace.cv` |
| `NODE_ENV` | Runtime environment (`development`, `production`, or `test`). | `development` |
| `EXTRACTION_TIMEOUT_MS` | Maximum time (in milliseconds) allowed for `yt-dlp` metadata extraction on `POST /api/info`. | `30000` |
| `DOWNLOAD_TIMEOUT_MS` | Maximum time (in milliseconds) allowed for streaming a download on `GET /api/download`. | `120000` |
| `MAX_DOWNLOAD_SIZE_MB` | Maximum permitted media download size in megabytes. | `200` |
| `RATE_LIMIT_WINDOW_MS` | Rate-limiter sliding window duration in milliseconds. | `60000` |
| `RATE_LIMIT_MAX_REQUESTS` | Maximum extraction/download requests allowed per IP within `RATE_LIMIT_WINDOW_MS`. | `20` |

---

## 7. Commands to Run, Test, and Build

Run these commands inside the frontend directory:

```bash
# 1. Install frontend dependencies
npm install

# 2. Start Vite dev server on http://localhost:5173
npm run dev

# 3. Run TypeScript typechecking
npm run typecheck

# 4. Run frontend Vitest + React Testing Library suite
npm run test

# 5. Typecheck and build production static bundle to dist/
npm run build

# 6. Locally preview the built production frontend
npm run preview
```

---

## 8. Self-Hosting & Deployment Options

### Option A: Run Locally on Your Machine

1. Start the backend server (`npm run dev` in the backend repository on port `3001`).
2. In this frontend repository, copy `.env.example` to `.env` (`cp .env.example .env`).
3. Run `npm install && npm run dev`.
4. Open `http://localhost:5173` in your browser.

### Option B: Deploy Frontend to Vercel / Static Host + Backend to Render

1. **Deploy the Backend (e.g., Render Docker Web Service):**
   - Set `CLIENT_ORIGIN=http://localhost:5173,https://downloader.pxxlspace.cv` (including your deployed frontend domain).
   - Note your backend's public HTTPS URL.
2. **Deploy the Frontend (e.g., Vercel):**
   - Import this repository into Vercel.
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`
   - **Environment Variable:** `VITE_API_BASE_URL=https://your-downloader-api.onrender.com` (your deployed backend URL, without a trailing slash).

---

## 9. API Documentation

The frontend communicates with the backend through three endpoints under `/api`:

### 1. `GET /api/health`
Returns server health status and `yt-dlp` version availability.

### 2. `POST /api/info`
- **Request Body:** `{ "url": "https://www.tiktok.com/@tiktok/video/7106594312292453675" }`
- **Response (`200 OK`):** Normalized `VideoMetadata` object containing `id`, `url`, `title`, `thumbnail`, `duration`, `uploader`, `platform`, `watermarkFreeAvailable`, and `options`.

### 3. `GET /api/download`
- **Query Parameters:** `url` *(required)*, `option` (`best`, `nowatermark`, `hd_1080p`, `hd_720p`, `sd_480p`, `audio`), and `title` *(optional)*.
- **Response (`200 OK`):** Direct media stream (`video/mp4` or `audio/mp4`) with a sanitized `Content-Disposition` attachment filename.

---

## 10. Troubleshooting & Updating `yt-dlp`

- **Frontend Cannot Connect to Backend / CORS Errors:**
  1. Ensure the backend is running and reachable at `/api/health`.
  2. Verify `VITE_API_BASE_URL` in `.env` matches your backend URL (`http://localhost:3001` locally) and restart Vite.
  3. Verify `CLIENT_ORIGIN` on the backend includes your exact browser origin (`http://localhost:5173,https://downloader.pxxlspace.cv`).
- **`esbuild` Binary Error After `npm install`:**
  - Run `node node_modules/esbuild/install.js`.
- **Updating `yt-dlp` on the Backend:**
  - Locally: `curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o ~/.local/bin/yt-dlp && chmod a+rx ~/.local/bin/yt-dlp`
  - On Render: Trigger **Clear build cache & deploy** on the backend service.

---

## 11. License

This project is licensed under the **MIT License**.

---

## 12. Author & Attribution

Created by **Faruk**  
Follow my updates on X: [@fatzy_tech](https://x.com/fatzy_tech)
