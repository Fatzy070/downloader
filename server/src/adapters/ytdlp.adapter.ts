import { spawn, execFile, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import ffmpegStatic from 'ffmpeg-static';
import {
  AppError,
  type DownloadOptionId,
  type DownloadStreamHandle,
  type RawYtDlpInfo,
  type SupportedPlatform,
} from '../types/downloader.js';

const activeProcesses = new Set<ChildProcess>();

let cachedYtDlpVersion: { version: string; fetchedAt: number } | null = null;
const VERSION_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Resolves the path to the yt-dlp binary across Docker, local user installs, and system PATH.
 */
export function resolveYtDlpBinary(): string {
  if (process.env.YTDLP_PATH && process.env.YTDLP_PATH.trim().length > 0) {
    return process.env.YTDLP_PATH.trim();
  }

  const candidatePaths = [
    '/opt/venv/bin/yt-dlp',
    '/usr/local/bin/yt-dlp',
    '/usr/bin/yt-dlp',
    path.join(os.homedir(), '.local', 'bin', 'yt-dlp'),
  ];

  for (const candidate of candidatePaths) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore fs access errors
    }
  }

  return 'yt-dlp';
}

/**
 * Resolves the path to the FFmpeg binary across environment config, system paths, and ffmpeg-static.
 */
export function resolveFfmpegBinary(): string | null {
  if (process.env.FFMPEG_PATH && process.env.FFMPEG_PATH.trim().length > 0) {
    return process.env.FFMPEG_PATH.trim();
  }

  const systemCandidates = ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
  for (const candidate of systemCandidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }

  const staticPath = ffmpegStatic as unknown as string | null;
  if (typeof staticPath === 'string' && staticPath.length > 0) {
    try {
      if (fs.existsSync(staticPath)) {
        return staticPath;
      }
    } catch {
      // ignore
    }
  }

  return null;
}

/**
 * Safely terminates a child process with SIGTERM and escalates to SIGKILL if needed.
 */
export function terminateChildProcess(proc: ChildProcess | null | undefined): void {
  if (!proc || proc.killed || proc.exitCode !== null) {
    if (proc) activeProcesses.delete(proc);
    return;
  }

  try {
    proc.kill('SIGTERM');
    const forceKillTimer = setTimeout(() => {
      try {
        if (!proc.killed && proc.exitCode === null) {
          proc.kill('SIGKILL');
        }
      } catch {
        // Process already exited
      } finally {
        activeProcesses.delete(proc);
      }
    }, 2000);
    forceKillTimer.unref();
  } catch {
    activeProcesses.delete(proc);
  }
}

/**
 * Terminates all currently tracked child processes (used during graceful shutdown).
 */
export function terminateAllActiveProcesses(): void {
  for (const proc of activeProcesses) {
    terminateChildProcess(proc);
  }
  activeProcesses.clear();
}

/**
 * Sanitizes a raw stderr string for safe server-side operational logging
 * without exposing query tokens, credentials, or multi-line stack traces.
 */
function sanitizeStderrForLog(stderr: string): string {
  return stderr
    .replace(/https?:\/\/[^\s"'<>]+/gi, (match) => {
      try {
        const parsed = new URL(match);
        return `${parsed.origin}${parsed.pathname}`;
      } catch {
        return '[redacted-url]';
      }
    })
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(-4)
    .join(' | ')
    .slice(0, 500);
}

/**
 * Maps raw yt-dlp stderr messages into safe, user-friendly AppError instances
 * without leaking internal paths or sensitive details.
 */
export function mapExtractorStderrToAppError(stderr: string): AppError {
  const lower = stderr.toLowerCase();

  if (
    lower.includes('private video') ||
    lower.includes('private account') ||
    lower.includes('login required') ||
    lower.includes('sign in to confirm') ||
    lower.includes('logged-in') ||
    lower.includes('authentication') ||
    lower.includes('cookies') ||
    lower.includes('only available for registered users')
  ) {
    return new AppError(
      'This content is private or requires platform authentication and cannot be downloaded.',
      403,
      'CONTENT_PRIVATE_OR_RESTRICTED'
    );
  }

  if (
    lower.includes('ip address is blocked') ||
    lower.includes('blocked from accessing') ||
    lower.includes('status code 10204')
  ) {
    return new AppError(
      'The source platform temporarily blocked access from the server network. Please try again shortly.',
      403,
      'UPSTREAM_ACCESS_BLOCKED'
    );
  }

  if (
    lower.includes('video unavailable') ||
    lower.includes('post unavailable') ||
    lower.includes('status is unavailable') ||
    lower.includes('no video could be found') ||
    lower.includes('there is no video in this') ||
    lower.includes('404') ||
    lower.includes('not found') ||
    lower.includes('has been removed') ||
    lower.includes('deleted')
  ) {
    return new AppError(
      'Media could not be found. The post may have been deleted, contains no video, or is unavailable.',
      404,
      'MEDIA_NOT_FOUND'
    );
  }

  if (
    lower.includes('geo') ||
    lower.includes('not available in your country') ||
    lower.includes('region')
  ) {
    return new AppError(
      'This media is restricted in the server region and cannot be accessed.',
      403,
      'GEO_RESTRICTED'
    );
  }

  if (lower.includes('too many requests') || lower.includes('429') || lower.includes('rate limit')) {
    return new AppError(
      'The source platform is temporarily rate-limiting requests. Please try again in a few moments.',
      429,
      'UPSTREAM_RATE_LIMIT'
    );
  }

  if (lower.includes('unsupported url') || lower.includes('no suitable extractor')) {
    return new AppError(
      'This URL is not supported by the media extractor or does not contain downloadable media.',
      422,
      'UNSUPPORTED_MEDIA_URL'
    );
  }

  if (lower.includes('file is larger than max-filesize') || lower.includes('max-filesize')) {
    return new AppError(
      'The requested media file exceeds the maximum allowed download size.',
      413,
      'FILE_TOO_LARGE'
    );
  }

  return new AppError(
    'Unable to extract media from this URL. The post may be unavailable, restricted, or unsupported.',
    422,
    'EXTRACTION_FAILED'
  );
}

/**
 * Returns the installed yt-dlp version string (cached for health checks).
 */
export async function getYtDlpVersion(): Promise<string | null> {
  const now = Date.now();
  if (cachedYtDlpVersion && now - cachedYtDlpVersion.fetchedAt < VERSION_CACHE_TTL_MS) {
    return cachedYtDlpVersion.version;
  }

  const binary = resolveYtDlpBinary();

  return new Promise((resolve) => {
    execFile(binary, ['--version'], { timeout: 4000 }, (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
        return;
      }
      const version = stdout.trim().split('\n')[0] || null;
      if (version) {
        cachedYtDlpVersion = { version, fetchedAt: Date.now() };
      }
      resolve(version);
    });
  });
}

/**
 * Builds the yt-dlp format selector string for a given server-defined DownloadOptionId.
 */
export function buildFormatSelector(
  option: DownloadOptionId,
  platform: SupportedPlatform
): { formatSelector: string; extension: 'mp4' | 'm4a'; contentType: string } {
  if (option === 'audio') {
    return {
      formatSelector: 'bestaudio[ext=m4a]/bestaudio/best',
      extension: 'm4a',
      contentType: 'audio/mp4',
    };
  }

  if (option === 'nowatermark' && platform === 'tiktok') {
    return {
      // Exclude TikTok's watermarked 'download' format_id when clean play streams exist
      formatSelector:
        'best[format_id!=download][format_note!*=?watermarked][ext=mp4]/best[format_id!=download][ext=mp4]/best[ext=mp4]/best',
      extension: 'mp4',
      contentType: 'video/mp4',
    };
  }

  if (option === 'hd_1080p') {
    return {
      formatSelector:
        'best[height<=1080][ext=mp4][vcodec!=none][acodec!=none]/best[height<=1080][ext=mp4]/best[ext=mp4]/best',
      extension: 'mp4',
      contentType: 'video/mp4',
    };
  }

  if (option === 'hd_720p') {
    return {
      formatSelector:
        'best[height<=720][ext=mp4][vcodec!=none][acodec!=none]/best[height<=720][ext=mp4]/best[ext=mp4]/best',
      extension: 'mp4',
      contentType: 'video/mp4',
    };
  }

  if (option === 'sd_480p') {
    return {
      formatSelector:
        'best[height<=480][ext=mp4][vcodec!=none][acodec!=none]/best[height<=480][ext=mp4]/best[ext=mp4]/best',
      extension: 'mp4',
      contentType: 'video/mp4',
    };
  }

  // Default 'best'
  return {
    formatSelector:
      'best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]/best[vcodec!=none][acodec!=none]/best',
    extension: 'mp4',
    contentType: 'video/mp4',
  };
}

/**
 * Extracts raw JSON metadata for a validated URL using yt-dlp --dump-single-json.
 */
export async function extractMediaInfo(
  url: string,
  timeoutMs = Number(process.env.EXTRACTION_TIMEOUT_MS) || 30000
): Promise<RawYtDlpInfo> {
  const binary = resolveYtDlpBinary();
  const ffmpegPath = resolveFfmpegBinary();

  const args: string[] = [
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--no-cache-dir',
    '--geo-bypass',
    '--socket-timeout',
    '15',
  ];

  if (ffmpegPath) {
    args.push('--ffmpeg-location', ffmpegPath);
  }

  // Argument separator prevents any URL from being interpreted as an option flag
  args.push('--', url);

  return new Promise<RawYtDlpInfo>((resolve, reject) => {
    const MAX_STDOUT_BYTES = 10 * 1024 * 1024; // 10MB metadata cap
    let stdoutBytes = 0;
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    activeProcesses.add(child);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      terminateChildProcess(child);
      reject(
        new AppError(
          'Metadata extraction timed out. The source platform may be slow or unresponsive.',
          504,
          'EXTRACTION_TIMEOUT'
        )
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > MAX_STDOUT_BYTES) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          terminateChildProcess(child);
          reject(
            new AppError(
              'Metadata response exceeded maximum allowed size.',
              413,
              'METADATA_TOO_LARGE'
            )
          );
        }
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrChunks.length < 32) {
        stderrChunks.push(chunk);
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeProcesses.delete(child);
      if (err.code === 'ENOENT') {
        reject(
          new AppError(
            'Media extraction engine (yt-dlp) is not available on the server.',
            503,
            'EXTRACTOR_UNAVAILABLE'
          )
        );
        return;
      }
      reject(
        new AppError(
          'Failed to start media extraction process.',
          500,
          'EXTRACTOR_SPAWN_ERROR'
        )
      );
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activeProcesses.delete(child);

      const stderrText = Buffer.concat(stderrChunks).toString('utf8');
      if (code !== 0) {
        const mappedError = mapExtractorStderrToAppError(stderrText);
        if (process.env.NODE_ENV !== 'test') {
          console.error(
            `[yt-dlp:info] exited with code ${String(code)} (${mappedError.code}): ${sanitizeStderrForLog(stderrText)}`
          );
        }
        reject(mappedError);
        return;
      }

      const stdoutText = Buffer.concat(stdoutChunks).toString('utf8').trim();
      if (!stdoutText) {
        reject(
          new AppError(
            'Extractor returned empty metadata for this URL.',
            422,
            'EMPTY_METADATA'
          )
        );
        return;
      }

      try {
        const parsed = JSON.parse(stdoutText) as RawYtDlpInfo;
        resolve(parsed);
      } catch {
        reject(
          new AppError(
            'Failed to parse media metadata from extractor.',
            502,
            'INVALID_EXTRACTOR_JSON'
          )
        );
      }
    });
  });
}

/**
 * Starts a yt-dlp download process streaming to stdout, waiting for the first media chunk
 * before resolving so pre-stream extraction failures can be returned as proper HTTP status codes.
 */
export async function createMediaDownloadStream(
  url: string,
  option: DownloadOptionId,
  platform: SupportedPlatform,
  options?: {
    timeoutMs?: number;
    maxSizeMb?: number;
  }
): Promise<DownloadStreamHandle> {
  const binary = resolveYtDlpBinary();
  const ffmpegPath = resolveFfmpegBinary();

  const timeoutMs =
    options?.timeoutMs ?? (Number(process.env.DOWNLOAD_TIMEOUT_MS) || 120000);
  const maxSizeMb =
    options?.maxSizeMb ?? (Number(process.env.MAX_DOWNLOAD_SIZE_MB) || 200);
  const maxBytes = maxSizeMb * 1024 * 1024;

  const { formatSelector, extension, contentType } = buildFormatSelector(option, platform);

  const args: string[] = [
    '--no-playlist',
    '--no-warnings',
    '--no-progress',
    '--no-cache-dir',
    '--no-part',
    '--geo-bypass',
    '--socket-timeout',
    '15',
    '--max-filesize',
    `${maxSizeMb}M`,
    '-f',
    formatSelector,
  ];

  if (ffmpegPath) {
    args.push('--ffmpeg-location', ffmpegPath);
  }

  args.push('-o', '-', '--', url);

  return new Promise<DownloadStreamHandle>((resolve, reject) => {
    const passThrough = new PassThrough();
    const stderrChunks: Buffer[] = [];
    let firstChunkReceived = false;
    let settled = false;
    let totalBytesStreamed = 0;

    const child = spawn(binary, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    activeProcesses.add(child);

    const cleanup = () => {
      clearTimeout(timer);
      terminateChildProcess(child);
      if (!passThrough.destroyed) {
        passThrough.destroy();
      }
    };

    const timer = setTimeout(() => {
      const timeoutError = new AppError(
        'Media download timed out before completion.',
        504,
        'DOWNLOAD_TIMEOUT'
      );
      if (!firstChunkReceived && !settled) {
        settled = true;
        cleanup();
        reject(timeoutError);
      } else {
        passThrough.destroy(timeoutError);
        terminateChildProcess(child);
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      totalBytesStreamed += chunk.length;

      if (totalBytesStreamed > maxBytes) {
        const sizeError = new AppError(
          `Media file exceeds the ${maxSizeMb}MB size limit.`,
          413,
          'FILE_TOO_LARGE'
        );
        if (!firstChunkReceived && !settled) {
          settled = true;
          cleanup();
          reject(sizeError);
        } else {
          passThrough.destroy(sizeError);
          terminateChildProcess(child);
        }
        return;
      }

      if (!firstChunkReceived) {
        firstChunkReceived = true;
        settled = true;
        resolve({
          stream: passThrough,
          process: child,
          contentType,
          extension,
          cleanup,
        });
      }

      if (!passThrough.destroyed) {
        const canContinue = passThrough.write(chunk);
        if (!canContinue) {
          child.stdout.pause();
          passThrough.once('drain', () => {
            if (!child.killed) {
              child.stdout.resume();
            }
          });
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderrChunks.length < 32) {
        stderrChunks.push(chunk);
      }
    });

    child.on('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      activeProcesses.delete(child);
      const appErr =
        err.code === 'ENOENT'
          ? new AppError(
              'Media extraction engine (yt-dlp) is not available on the server.',
              503,
              'EXTRACTOR_UNAVAILABLE'
            )
          : new AppError(
              'Failed to start media download process.',
              500,
              'DOWNLOAD_SPAWN_ERROR'
            );

      if (!firstChunkReceived && !settled) {
        settled = true;
        passThrough.destroy();
        reject(appErr);
      } else if (!passThrough.destroyed) {
        passThrough.destroy(appErr);
      }
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      activeProcesses.delete(child);

      const stderrText = Buffer.concat(stderrChunks).toString('utf8');

      if (!firstChunkReceived) {
        if (!settled) {
          settled = true;
          passThrough.destroy();
          if (code !== 0) {
            const mappedError = mapExtractorStderrToAppError(stderrText);
            if (process.env.NODE_ENV !== 'test') {
              console.error(
                `[yt-dlp:download] exited with code ${String(code)} (${mappedError.code}): ${sanitizeStderrForLog(stderrText)}`
              );
            }
            reject(mappedError);
          } else {
            reject(
              new AppError(
                'No downloadable media stream was produced for this URL.',
                422,
                'EMPTY_MEDIA_STREAM'
              )
            );
          }
        }
        return;
      }

      if (code !== 0 && !passThrough.destroyed) {
        passThrough.destroy(mapExtractorStderrToAppError(stderrText));
      } else if (!passThrough.destroyed) {
        passThrough.end();
      }
    });
  });
}
