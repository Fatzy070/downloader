export type SupportedPlatform = 'tiktok' | 'instagram' | 'x' | 'direct';

export type DownloadOptionId =
  | 'best'
  | 'nowatermark'
  | 'hd_1080p'
  | 'hd_720p'
  | 'sd_480p'
  | 'audio';

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

export interface ApiErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

export interface HealthResponse {
  status: string;
  service: string;
  timestamp: string;
  uptimeSeconds: number;
  extractor: {
    engine: string;
    available: boolean;
    version: string | null;
  };
}
