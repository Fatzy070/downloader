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

function sanitizeSafeHttpsUrl(candidate?: string | null): string | null {
  if (!candidate || typeof candidate !== 'string') return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'https:' && !isDisallowedHost(parsed.hostname)) {
      return parsed.toString();
    }
  } catch {
    // ignore invalid URL
  }
  return null;
}

/**
 * Selects a direct, progressive HTTPS video URL suitable for native browser <video> playback
 * when available without session-cookie requirements or backend proxy overhead.
 */
function selectBrowserPlayablePreviewUrl(
  rawInfo: RawYtDlpInfo,
  videoFormats: RawYtDlpFormat[],
  originalUrl: string,
  platform: SupportedPlatform
): string | null {
  // TikTok CDN stream URLs require session cookies (ttwid/_wafchallengeid) and Referer headers
  // bound to the yt-dlp process, returning 403 Forbidden if loaded directly in a browser <video>.
  if (platform === 'tiktok') {
    return null;
  }

  const playableCandidates = videoFormats.filter((fmt) => {
    if (!fmt.url || fmt.cookies) return false;
    const protocol = (fmt.protocol || 'https').toLowerCase();
    if (protocol !== 'https' && protocol !== 'http') return false;

    const ext = (fmt.ext || '').toLowerCase();
    if (!['mp4', 'webm', 'mov'].includes(ext)) return false;

    const hasVideo = Boolean(fmt.vcodec && fmt.vcodec !== 'none');
    const hasAudio = Boolean(fmt.acodec && fmt.acodec !== 'none');
    return hasVideo && hasAudio && Boolean(sanitizeSafeHttpsUrl(fmt.url));
  });

  if (playableCandidates.length > 0) {
    // Prefer H.264 (avc1/h264) progressive MP4 up to 720p/1080p for fast, universal browser playback
    const sorted = [...playableCandidates].sort((a, b) => {
      const aH264 = /avc1|h264/i.test(a.vcodec || '') ? 1 : 0;
      const bH264 = /avc1|h264/i.test(b.vcodec || '') ? 1 : 0;
      if (aH264 !== bH264) return bH264 - aH264;
      return (b.height ?? 0) - (a.height ?? 0);
    });

    return sanitizeSafeHttpsUrl(sorted[0]?.url);
  }

  if (platform === 'direct') {
    const directCandidate = sanitizeSafeHttpsUrl(rawInfo.url) ?? sanitizeSafeHttpsUrl(originalUrl);
    if (
      directCandidate &&
      /\.(mp4|webm|mov|m4v)(\?|$)/i.test(directCandidate)
    ) {
      return directCandidate;
    }
  }

  // Handle single-stream extractors (such as SnapchatSpotlight) that populate top-level rawInfo.url + rawInfo.ext
  const topLevelExt = (rawInfo.ext || '').toLowerCase();
  if (rawInfo.url && ['mp4', 'webm', 'mov'].includes(topLevelExt)) {
    return sanitizeSafeHttpsUrl(rawInfo.url);
  }

  return null;
}

export function normalizeMediaMetadata(
  rawInfo: RawYtDlpInfo,
  originalUrl: string,
  platform: SupportedPlatform
): VideoMetadata {
  // If extractor returned a playlist of entries (e.g., generic extractor on Snapchat public stories),
  // select the video entry that contains downloadable video formats or an mp4 stream
  let effectiveInfo = rawInfo;
  if (Array.isArray(rawInfo.entries) && rawInfo.entries.length > 0) {
    const videoEntry =
      rawInfo.entries.find((e) =>
        e.ext === 'mp4' ||
        e.formats?.some((f) => f.ext === 'mp4' || (f.vcodec && f.vcodec !== 'none'))
      ) || rawInfo.entries[0];

    if (videoEntry) {
      effectiveInfo = {
        ...rawInfo,
        ...videoEntry,
        title: rawInfo.title || videoEntry.title,
        thumbnail: videoEntry.thumbnail || rawInfo.thumbnail,
      };
    }
  }

  const formats = Array.isArray(effectiveInfo.formats) ? effectiveInfo.formats : [];
  const videoFormats = formats.filter(isVideoFormat);

  // If extractor returned neither video formats nor direct media ext, reject
  if (videoFormats.length === 0 && !effectiveInfo.ext && !effectiveInfo.url) {
    throw new AppError(
      'No downloadable video stream was found at this URL.',
      422,
      'NO_VIDEO_FORMATS'
    );
  }

  const heights = videoFormats
    .map((f) => (typeof f.height === 'number' ? f.height : 0))
    .filter((h) => h > 0);
  const maxHeight =
    heights.length > 0
      ? Math.max(...heights)
      : typeof effectiveInfo.height === 'number' && effectiveInfo.height > 0
        ? effectiveInfo.height
        : null;

  const fallbackSize = effectiveInfo.filesize ?? effectiveInfo.filesize_approx ?? null;

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
    effectiveInfo.title?.trim() ||
    effectiveInfo.fulltitle?.trim() ||
    effectiveInfo.description?.trim().split('\n')[0]?.slice(0, 90) ||
    `${platform.toUpperCase()} Video`;

  const parsedOriginal = (() => {
    try {
      return new URL(originalUrl);
    } catch {
      return null;
    }
  })();
  const urlCreatorMatch = parsedOriginal?.pathname.match(/^\/@([^/]+)/);

  const uploader =
    effectiveInfo.uploader?.trim() ||
    effectiveInfo.creator?.trim() ||
    effectiveInfo.channel?.trim() ||
    (effectiveInfo.uploader_id ? `@${effectiveInfo.uploader_id.replace(/^@/, '')}` : null) ||
    (urlCreatorMatch ? urlCreatorMatch[1] : null);

  const duration =
    typeof effectiveInfo.duration === 'number' &&
    Number.isFinite(effectiveInfo.duration) &&
    effectiveInfo.duration >= 0
      ? Math.round(effectiveInfo.duration)
      : null;

  const previewUrl = selectBrowserPlayablePreviewUrl(
    effectiveInfo,
    videoFormats,
    originalUrl,
    platform
  );

  return {
    id: String(effectiveInfo.id || Date.now()),
    url: originalUrl,
    resolvedUrl: effectiveInfo.webpage_url || originalUrl,
    previewUrl,
    title: rawTitle,
    thumbnail: sanitizeHttpsThumbnail(effectiveInfo),
    duration,
    uploader: uploader || null,
    platform,
    extractor: effectiveInfo.extractor_key || effectiveInfo.extractor || platform,
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
