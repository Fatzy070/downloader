import type { ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';

export type SupportedPlatform =
  | 'tiktok'
  | 'instagram'
  | 'x'
  | 'snapchat'
  | 'direct';

export const DOWNLOAD_OPTION_IDS = [
  'best',
  'nowatermark',
  'hd_1080p',
  'hd_720p',
  'sd_480p',
  'audio',
] as const;

export type DownloadOptionId = (typeof DOWNLOAD_OPTION_IDS)[number];

export interface DownloadOption {
  id: DownloadOptionId;
  label: string;
  quality: string;
  ext: 'mp4' | 'm4a' | 'mp3' | 'webm';
  watermarkFree?: boolean;
  hasAudio: boolean;
  filesizeApprox?: number | null;
}

export interface VideoMetadata {
  id: string;
  url: string;
  resolvedUrl?: string;
  previewUrl?: string | null;
  title: string;
  thumbnail: string | null;
  duration: number | null;
  uploader: string | null;
  platform: SupportedPlatform;
  extractor: string;
  watermarkFreeAvailable: boolean;
  options: DownloadOption[];
}

export interface RawYtDlpFormat {
  format_id?: string;
  format_note?: string;
  ext?: string;
  vcodec?: string;
  acodec?: string;
  width?: number | null;
  height?: number | null;
  fps?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  tbr?: number | null;
  protocol?: string;
  url?: string;
  cookies?: string;
}

export interface RawYtDlpInfo {
  id?: string;
  title?: string;
  fulltitle?: string;
  description?: string;
  thumbnail?: string;
  thumbnails?: Array<{ url?: string; width?: number; height?: number }>;
  duration?: number | null;
  uploader?: string | null;
  uploader_id?: string | null;
  creator?: string | null;
  channel?: string | null;
  extractor?: string;
  extractor_key?: string;
  webpage_url?: string;
  original_url?: string;
  url?: string;
  ext?: string;
  width?: number | null;
  height?: number | null;
  filesize?: number | null;
  filesize_approx?: number | null;
  formats?: RawYtDlpFormat[];
  _type?: string;
  entries?: RawYtDlpInfo[];
}

export interface DownloadStreamHandle {
  stream: Readable;
  process: ChildProcess;
  contentType: string;
  extension: string;
  suggestedTitle?: string;
  cleanup: () => void;
}

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 400,
    code = 'BAD_REQUEST',
    details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}
