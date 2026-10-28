import { extractMediaInfo } from '../adapters/ytdlp.adapter.js';
import {
  AppError,
  type DownloadOption,
  type RawYtDlpFormat,
  type RawYtDlpInfo,
  type SupportedPlatform,
  type VideoMetadata,
} from '../types/downloader.js';
import {
  isDisallowedHost,
  verifyNetworkSafetyAndRedirects,
} from '../validators/download.validator.js';

function sanitizeHttpsThumbnail(rawInfo: RawYtDlpInfo): string | null {
  const candidates: Array<string | undefined> = [rawInfo.thumbnail];

  if (Array.isArray(rawInfo.thumbnails)) {
    for (let i = rawInfo.thumbnails.length - 1; i >= 0; i--) {
      candidates.push(rawInfo.thumbnails[i]?.url);
    }
  }

  for (const candidate of candidates) {
    if (!candidate || typeof candidate !== 'string') continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'https:' && !isDisallowedHost(parsed.hostname)) {
        return parsed.toString();
      }
    } catch {
      // skip invalid URLs ok
    }
  }

  return null;
}

function isVideoFormat(fmt: RawYtDlpFormat): boolean {
  if (fmt.vcodec && fmt.vcodec !== 'none') return true;
  if (typeof fmt.height === 'number' && fmt.height > 0) return true;
  if (fmt.ext && ['mp4', 'webm', 'mov'].includes(fmt.ext.toLowerCase()) && fmt.acodec !== 'only') {
    return true;
  }
  return false;
}

function isWatermarkedTikTokFormat(fmt: RawYtDlpFormat): boolean {
  const id = (fmt.format_id || '').toLowerCase();
  const note = (fmt.format_note || '').toLowerCase();
  return id === 'download' || id.includes('watermark') || note.includes('watermark');
}

function estimateSize(fmt?: RawYtDlpFormat, fallback?: number | null): number | null {
  if (fmt) {
    if (typeof fmt.filesize === 'number' && fmt.filesize > 0) return fmt.filesize;
    if (typeof fmt.filesize_approx === 'number' && fmt.filesize_approx > 0) {
      return fmt.filesize_approx;
    }
  }
  if (typeof fallback === 'number' && fallback > 0) return fallback;
  return null;
}

export function normalizeMediaMetadata(
  rawInfo: RawYtDlpInfo,
  originalUrl: string,
  platform: SupportedPlatform
): VideoMetadata {
  const formats = Array.isArray(rawInfo.formats) ? rawInfo.formats : [];
  const videoFormats = formats.filter(isVideoFormat);

  // If extractor returned neither video formats nor direct media ext, reject
  if (videoFormats.length === 0 && !rawInfo.ext && !rawInfo.url) {
    throw new AppError(
      'No downloadable video stream was found at this URL.',
      422,
      'NO_VIDEO_FORMATS'
    );
  }

  const heights = videoFormats
    .map((f) => (typeof f.height === 'number' ? f.height : 0))
    .filter((h) => h > 0);
  const maxHeight = heights.length > 0 ? Math.max(...heights) : null;

  const fallbackSize = rawInfo.filesize ?? rawInfo.filesize_approx ?? null;

  let watermarkFreeAvailable = platform !== 'tiktok';
  let cleanTikTokFormats: RawYtDlpFormat[] = [];

  if (platform === 'tiktok') {
    cleanTikTokFormats = videoFormats.filter((f) => !isWatermarkedTikTokFormat(f));
    watermarkFreeAvailable = cleanTikTokFormats.length > 0;
  }

  const options: DownloadOption[] = [];

  if (platform === 'tiktok' && watermarkFreeAvailable) {
    const bestClean = cleanTikTokFormats.reduce<RawYtDlpFormat | undefined>((best, cur) => {
      const bestH = best?.height ?? 0;
      const curH = cur.height ?? 0;
      return curH >= bestH ? cur : best;
    }, undefined);

    const cleanHeight = bestClean?.height ? `${bestClean.height}p` : 'Original';

    options.push({
      id: 'nowatermark',
      label: 'MP4 (No Watermark)',
      quality: `${cleanHeight} Clean`,
      ext: 'mp4',
      watermarkFree: true,
      hasAudio: true,
      filesizeApprox: estimateSize(bestClean, fallbackSize),
    });
  }

  const bestFormat = videoFormats.reduce<RawYtDlpFormat | undefined>((best, cur) => {
    const bestH = best?.height ?? 0;
    const curH = cur.height ?? 0;
    return curH >= bestH ? cur : best;
  }, undefined);

  options.push({
    id: 'best',
    label:
      platform === 'tiktok' && !watermarkFreeAvailable
        ? 'Best Available (MP4 · Watermarked)'
        : 'Best Quality (MP4)',
    quality: maxHeight ? `${maxHeight}p` : 'Best Available',
    ext: 'mp4',
    watermarkFree: platform === 'tiktok' ? watermarkFreeAvailable : undefined,
    hasAudio: true,
    filesizeApprox: estimateSize(bestFormat, fallbackSize),
  });

  if (heights.some((h) => h >= 1080)) {
    const fmt1080 = videoFormats.find((f) => (f.height ?? 0) >= 1080 && (f.height ?? 0) <= 1200);
    options.push({
      id: 'hd_1080p',
      label: 'Full HD 1080p (MP4)',
      quality: '1080p',
      ext: 'mp4',
      hasAudio: true,
      filesizeApprox: estimateSize(fmt1080, null),
    });
  }

  if (heights.some((h) => h >= 720 && h < 1080) || (maxHeight && maxHeight > 720)) {
    const fmt720 = videoFormats.find((f) => (f.height ?? 0) >= 700 && (f.height ?? 0) <= 780);
    options.push({
      id: 'hd_720p',
      label: 'HD 720p (MP4)',
      quality: '720p',
      ext: 'mp4',
      hasAudio: true,
      filesizeApprox: estimateSize(fmt720, null),
    });
  }

  if (heights.some((h) => h > 0 && h <= 576)) {
    const fmtSd = videoFormats.find((f) => (f.height ?? 0) > 0 && (f.height ?? 0) <= 576);
    options.push({
      id: 'sd_480p',
      label: 'Standard Definition (MP4)',
      quality: fmtSd?.height ? `${fmtSd.height}p` : '480p',
      ext: 'mp4',
      hasAudio: true,
      filesizeApprox: estimateSize(fmtSd, null),
    });
  }

  if (platform !== 'direct' || !originalUrl.toLowerCase().endsWith('.mp4')) {
    const audioFormat = formats.find(
      (f) => f.acodec && f.acodec !== 'none' && (!f.vcodec || f.vcodec === 'none')
    );
    options.push({
      id: 'audio',
      label: 'Audio Only (M4A)',
      quality: 'Best Audio',
      ext: 'm4a',
      hasAudio: true,
      filesizeApprox: estimateSize(audioFormat, null),
    });
  }

  const rawTitle =
    rawInfo.title?.trim() ||
    rawInfo.fulltitle?.trim() ||
    rawInfo.description?.trim().split('\n')[0]?.slice(0, 90) ||
    `${platform.toUpperCase()} Video`;

  const uploader =
    rawInfo.uploader?.trim() ||
    rawInfo.creator?.trim() ||
    rawInfo.channel?.trim() ||
    (rawInfo.uploader_id ? `@${rawInfo.uploader_id.replace(/^@/, '')}` : null);

  const duration =
    typeof rawInfo.duration === 'number' &&
    Number.isFinite(rawInfo.duration) &&
    rawInfo.duration >= 0
      ? Math.round(rawInfo.duration)
      : null;

  return {
    id: String(rawInfo.id || Date.now()),
    url: originalUrl,
    resolvedUrl: rawInfo.webpage_url || originalUrl,
    title: rawTitle,
    thumbnail: sanitizeHttpsThumbnail(rawInfo),
    duration,
    uploader: uploader || null,
    platform,
    extractor: rawInfo.extractor_key || rawInfo.extractor || platform,
    watermarkFreeAvailable,
    options,
  };
}

export async function getMediaInfoForUrl(rawUrl: string): Promise<VideoMetadata> {
  const validated = await verifyNetworkSafetyAndRedirects(rawUrl);
  const rawInfo = await extractMediaInfo(validated.url);

  if (rawInfo.webpage_url) {
    try {
      const resolvedParsed = new URL(rawInfo.webpage_url);
      if (
        resolvedParsed.protocol !== 'https:' ||
        isDisallowedHost(resolvedParsed.hostname)
      ) {
        throw new AppError(
          'Resolved media destination points to an unsafe or disallowed host.',
          400,
          'UNSAFE_RESOLVED_URL'
        );
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
    }
  }

  return normalizeMediaMetadata(rawInfo, validated.url, validated.platform);
}
