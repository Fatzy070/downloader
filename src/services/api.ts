import type {
  ApiErrorPayload,
  DownloadOptionId,
  HealthResponse,
  VideoMetadata,
} from '../types/downloader';

const RAW_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

// Normalize trailing slashes and strip any accidental trailing /api suffix
export const API_BASE_URL = RAW_BASE_URL.replace(/\/+$/, '').replace(
  /\/api$/,
  ''
);

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code: string;

  constructor(message: string, statusCode = 500, code = 'API_ERROR') {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Fetches normalized media metadata for a user-submitted URL from POST /api/info.
 */
export async function fetchVideoInfo(url: string): Promise<VideoMetadata> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/info`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ url: url.trim() }),
    });
  } catch {
    throw new ApiClientError(
      'Unable to reach the downloader server. Please check that the backend is running.',
      0,
      'NETWORK_ERROR'
    );
  }

  let body: { data?: VideoMetadata } & ApiErrorPayload = {};
  try {
    body = (await response.json()) as { data?: VideoMetadata } & ApiErrorPayload;
  } catch {
    // Non-JSON response
  }

  if (!response.ok || !body.data) {
    const message =
      body.error?.message ||
      `Failed to retrieve media information (HTTP ${response.status}).`;
    const code = body.error?.code || 'EXTRACTION_FAILED';
    throw new ApiClientError(message, response.status, code);
  }

  return body.data;
}

/**
 * Builds the direct streaming download URL for GET /api/download so the browser
 * handles the download stream natively without buffering the file into memory.
 */
export function buildDownloadUrl(params: {
  url: string;
  option: DownloadOptionId;
  title?: string;
}): string {
  const searchParams = new URLSearchParams({
    url: params.url.trim(),
    option: params.option,
  });

  if (params.title && params.title.trim().length > 0) {
    searchParams.set('title', params.title.trim().slice(0, 120));
  }

  return `${API_BASE_URL}/api/download?${searchParams.toString()}`;
}

/**
 * Checks backend health status via GET /api/health.
 */
export async function fetchHealthStatus(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/api/health`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new ApiClientError('Backend health check failed.', response.status);
  }

  return (await response.json()) as HealthResponse;
}
