import { spawn } from 'node:child_process';
import { PassThrough, Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import {
  AppError,
  type DownloadOptionId,
  type DownloadStreamHandle,
  type RawYtDlpInfo,
} from '../types/downloader.js';
import {
  assertSafeDnsResolution,
  isDisallowedHost,
  matchesDomainBoundary,
} from '../validators/download.validator.js';
import { resolveFfmpegBinary, terminateChildProcess } from './ytdlp.adapter.js';

const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const MAX_HTML_BYTES = 10 * 1024 * 1024;

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_match, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCodePoint(parseInt(hex, 16)));
}

function sanitizeSafeSnapchatCdnUrl(candidate?: string | null): string | null {
  if (!candidate || typeof candidate !== 'string') return null;
  const trimmed = decodeHtmlEntities(candidate.trim());
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      return null;
    }
    if (isDisallowedHost(parsed.hostname)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Parses ISO-8601 duration strings (e.g. "PT26S", "PT1M12.5S") into seconds.
 */
export function parseIsoDurationToSeconds(isoDuration?: string | null): number | null {
  if (!isoDuration || typeof isoDuration !== 'string') return null;
  const match = isoDuration
    .trim()
    .match(/^PT(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i);
  if (!match) return null;

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  const seconds = match[3] ? Number(match[3]) : 0;
  const total = hours * 3600 + minutes * 60 + seconds;
  return Number.isFinite(total) && total > 0 ? total : null;
}

function extractMetaTagContent(html: string, attrName: 'property' | 'name', attrValue: string): string | null {
  const escapedValue = attrValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const tagRegex = new RegExp(
    `<meta\\b[^>]*\\b${attrName}=(["'])${escapedValue}\\1[^>]*>`,
    'i'
  );
  const tagMatch = html.match(tagRegex);
  if (!tagMatch) return null;

  const contentMatch = tagMatch[0].match(/\bcontent=(["'])([\s\S]*?)\1/i);
  if (!contentMatch) return null;
  return decodeHtmlEntities(contentMatch[2].trim());
}

function findVideoObjectInLdJson(node: unknown): Record<string, unknown> | null {
  if (!node || typeof node !== 'object') return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findVideoObjectInLdJson(item);
      if (found) return found;
    }
    return null;
  }

  const record = node as Record<string, unknown>;
  const typeVal = record['@type'];
  const isVideoObject =
    typeVal === 'VideoObject' ||
    (Array.isArray(typeVal) && typeVal.includes('VideoObject'));
  if (isVideoObject && typeof record.contentUrl === 'string') {
    return record;
  }

  if (Array.isArray(record['@graph'])) {
    return findVideoObjectInLdJson(record['@graph']);
  }

  return null;
}

/**
 * Fetches an HTTPS URL safely while enforcing protocol, domain/SSRF checks, and DNS validation
 * on the initial URL and every redirect hop.
 */
async function fetchWithSafeRedirects(
  initialUrl: string,
  opts: {
    allowedDomainSuffix?: string;
    timeoutMs: number;
    maxRedirects?: number;
    acceptHeader?: string;
    signal?: AbortSignal;
  }
): Promise<{ response: Response; finalUrl: string }> {
  let currentUrl = initialUrl;
  const maxRedirects = opts.maxRedirects ?? 5;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(currentUrl);
    } catch {
      throw new AppError('Resolved media destination is malformed.', 400, 'MALFORMED_URL');
    }

    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
      throw new AppError(
        'Only secure HTTPS destinations are supported.',
        400,
        'UNSUPPORTED_PROTOCOL'
      );
    }

    if (isDisallowedHost(parsed.hostname)) {
      throw new AppError(
        'Local, private, and internal network destinations are forbidden.',
        400,
        'FORBIDDEN_HOST'
      );
    }

    if (
      opts.allowedDomainSuffix &&
      !matchesDomainBoundary(parsed.hostname, opts.allowedDomainSuffix)
    ) {
      throw new AppError(
        'Redirect destination escaped the supported platform domain.',
        400,
        'UNSUPPORTED_SNAPCHAT_URL'
      );
    }

    await assertSafeDnsResolution(parsed.hostname);

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort();
    opts.signal?.addEventListener('abort', onExternalAbort, { once: true });
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs);

    let response: Response;
    try {
      response = await fetch(currentUrl, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': BROWSER_USER_AGENT,
          Accept: opts.acceptHeader ?? '*/*',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });
    } finally {
      clearTimeout(timeout);
      opts.signal?.removeEventListener('abort', onExternalAbort);
    }

    if (response.status >= 300 && response.status < 400) {
      await response.body?.cancel().catch(() => {});
      const location = response.headers.get('location');
      if (!location) {
        break;
      }
      currentUrl = new URL(location, currentUrl).toString();
      continue;
    }

    return { response, finalUrl: currentUrl };
  }

  throw new AppError(
    'Too many redirects while resolving Snapchat media.',
    502,
    'EXTRACTION_FAILED'
  );
}

/**
 * Parses a Snapchat Spotlight HTML page (App Router / JSON-LD VideoObject / OpenGraph)
 * into a normalized RawYtDlpInfo structure.
 */
export function parseSnapchatSpotlightHtml(
  html: string,
  pageUrl: string,
  spotlightId: string
): RawYtDlpInfo | null {
  const ldJsonRegex = /<script\b[^>]*type=(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi;
  let videoObject: Record<string, unknown> | null = null;

  for (const match of html.matchAll(ldJsonRegex)) {
    try {
      const parsed = JSON.parse(match[2].trim()) as unknown;
      const found = findVideoObjectInLdJson(parsed);
      if (found) {
        videoObject = found;
        break;
      }
    } catch {
      // Ignore malformed ld+json block
    }
  }

  const ogTitle = extractMetaTagContent(html, 'property', 'og:title');
  const ogDescription = extractMetaTagContent(html, 'property', 'og:description');
  const ogImage = extractMetaTagContent(html, 'property', 'og:image');
  const ogVideo =
    extractMetaTagContent(html, 'property', 'og:video:secure_url') ??
    extractMetaTagContent(html, 'property', 'og:video');
  const ogVideoType = extractMetaTagContent(html, 'property', 'og:video:type');
  const ogWidth = Number(extractMetaTagContent(html, 'property', 'og:video:width') ?? '');
  const ogHeight = Number(extractMetaTagContent(html, 'property', 'og:video:height') ?? '');

  if (videoObject) {
    const contentUrl = sanitizeSafeSnapchatCdnUrl(
      typeof videoObject.contentUrl === 'string' ? videoObject.contentUrl : null
    );
    if (!contentUrl) {
      return null;
    }

    const rawName = typeof videoObject.name === 'string' ? videoObject.name.trim() : '';
    const rawDesc = typeof videoObject.description === 'string' ? videoObject.description.trim() : '';
    const title =
      rawName && rawName.toLowerCase() !== 'spotlight snap'
        ? rawName
        : ogTitle || rawName || 'Spotlight Snap';

    const creator = videoObject.creator as Record<string, unknown> | undefined;
    const uploader =
      (typeof creator?.alternateName === 'string' && creator.alternateName.trim()) ||
      (typeof creator?.name === 'string' && creator.name.trim()) ||
      null;

    const thumbnail =
      sanitizeSafeSnapchatCdnUrl(
        typeof videoObject.thumbnailUrl === 'string' ? videoObject.thumbnailUrl : null
      ) ??
      sanitizeSafeSnapchatCdnUrl(ogImage) ??
      undefined;

    const width =
      typeof videoObject.width === 'number' && videoObject.width > 0
        ? videoObject.width
        : Number.isFinite(ogWidth) && ogWidth > 0
          ? ogWidth
          : null;
    const height =
      typeof videoObject.height === 'number' && videoObject.height > 0
        ? videoObject.height
        : Number.isFinite(ogHeight) && ogHeight > 0
          ? ogHeight
          : null;

    const duration = parseIsoDurationToSeconds(
      typeof videoObject.duration === 'string' ? videoObject.duration : null
    );

    const webpageUrl =
      sanitizeSafeSnapchatCdnUrl(typeof videoObject.url === 'string' ? videoObject.url : null) ??
      pageUrl;

    return {
      id: spotlightId,
      title,
      description: rawDesc || ogDescription || undefined,
      thumbnail,
      duration,
      uploader,
      extractor: 'SnapchatSpotlight',
      extractor_key: 'SnapchatSpotlight',
      webpage_url: webpageUrl,
      original_url: pageUrl,
      url: contentUrl,
      ext: 'mp4',
      width,
      height,
      formats: [
        {
          format_id: 'mp4',
          ext: 'mp4',
          vcodec: 'h264',
          acodec: 'aac',
          width,
          height,
          protocol: 'https',
          url: contentUrl,
        },
      ],
    };
  }

  // Fallback to OpenGraph video metadata if JSON-LD VideoObject is absent
  const safeOgVideo = sanitizeSafeSnapchatCdnUrl(ogVideo);
  if (safeOgVideo && (!ogVideoType || ogVideoType.toLowerCase().startsWith('video/'))) {
    const width = Number.isFinite(ogWidth) && ogWidth > 0 ? ogWidth : null;
    const height = Number.isFinite(ogHeight) && ogHeight > 0 ? ogHeight : null;

    return {
      id: spotlightId,
      title: ogTitle || 'Spotlight Snap',
      description: ogDescription || undefined,
      thumbnail: sanitizeSafeSnapchatCdnUrl(ogImage) ?? undefined,
      duration: null,
      uploader: null,
      extractor: 'SnapchatSpotlight',
      extractor_key: 'SnapchatSpotlight',
      webpage_url: pageUrl,
      original_url: pageUrl,
      url: safeOgVideo,
      ext: 'mp4',
      width,
      height,
      formats: [
        {
          format_id: 'mp4',
          ext: 'mp4',
          vcodec: 'h264',
          acodec: 'aac',
          width,
          height,
          protocol: 'https',
          url: safeOgVideo,
        },
      ],
    };
  }

  return null;
}

interface NextDataStorySnap {
  snapId?: { value?: string };
  snapMediaType?: number;
  snapTitle?: string | null;
  snapUrls?: {
    mediaUrl?: string;
    mediaPreviewUrl?: { value?: string };
  };
}

/**
 * Parses a Snapchat public creator story page (`/@<creator>/<snapId>`) via `__NEXT_DATA__`.
 */
export function parseSnapchatCreatorStoryHtml(
  html: string,
  pageUrl: string,
  targetSnapId: string,
  creatorHandle: string
): RawYtDlpInfo | null {
  const nextDataMatch = html.match(
    /<script\b[^>]*id=(["'])__NEXT_DATA__\1[^>]*>([\s\S]*?)<\/script>/i
  );
  if (!nextDataMatch) {
    return null;
  }

  let nextData: {
    props?: {
      pageProps?: {
        showSnapExpiredToast?: boolean;
        userProfile?: {
          publicProfileInfo?: {
            username?: string;
            title?: string;
          };
        };
        linkPreview?: {
          title?: string;
          description?: string;
        };
        story?: {
          storyTitle?: { value?: string };
          snapList?: NextDataStorySnap[];
        };
      };
    };
  };

  try {
    nextData = JSON.parse(nextDataMatch[2]) as typeof nextData;
  } catch {
    return null;
  }

  const pageProps = nextData.props?.pageProps;
  if (!pageProps) return null;

  const snapList = Array.isArray(pageProps.story?.snapList)
    ? pageProps.story.snapList
    : [];
  const matchedSnap = snapList.find((snap) => snap.snapId?.value === targetSnapId);

  if (!matchedSnap) {
    if (pageProps.showSnapExpiredToast || snapList.length === 0) {
      throw new AppError(
        'This Snapchat story has expired or is no longer available.',
        404,
        'MEDIA_NOT_FOUND'
      );
    }
    throw new AppError(
      'This Snapchat story snap has expired or could not be found.',
      404,
      'MEDIA_NOT_FOUND'
    );
  }

  // snapMediaType: 0 = Image, 1 = Video
  if (typeof matchedSnap.snapMediaType === 'number' && matchedSnap.snapMediaType !== 1) {
    throw new AppError(
      'This Snapchat story is an image post and does not contain a downloadable video.',
      422,
      'NO_VIDEO_FORMATS'
    );
  }

  const mediaUrl = sanitizeSafeSnapchatCdnUrl(matchedSnap.snapUrls?.mediaUrl);
  if (!mediaUrl) {
    throw new AppError(
      'No downloadable video stream was found for this Snapchat story.',
      422,
      'NO_VIDEO_FORMATS'
    );
  }

  const thumbnail =
    sanitizeSafeSnapchatCdnUrl(matchedSnap.snapUrls?.mediaPreviewUrl?.value) ?? undefined;
  const profile = pageProps.userProfile?.publicProfileInfo;
  const uploader = profile?.username?.trim() || creatorHandle.replace(/^@/, '');
  const title =
    matchedSnap.snapTitle?.trim() ||
    pageProps.story?.storyTitle?.value?.trim() ||
    pageProps.linkPreview?.title?.trim() ||
    `Snapchat Story by @${uploader}`;

  return {
    id: targetSnapId,
    title,
    description: pageProps.linkPreview?.description?.trim() || undefined,
    thumbnail,
    duration: null,
    uploader,
    extractor: 'SnapchatStory',
    extractor_key: 'SnapchatStory',
    webpage_url: pageUrl,
    original_url: pageUrl,
    url: mediaUrl,
    ext: 'mp4',
    formats: [
      {
        format_id: 'mp4',
        ext: 'mp4',
        vcodec: 'h264',
        acodec: 'aac',
        protocol: 'https',
        url: mediaUrl,
      },
    ],
  };
}

/**
 * Extracts normalized metadata for a validated Snapchat Spotlight or public creator story URL.
 */
export async function extractSnapchatMediaInfo(
  url: string,
  timeoutMs = Number(process.env.EXTRACTION_TIMEOUT_MS) || 45000
): Promise<RawYtDlpInfo> {
  const { response, finalUrl } = await fetchWithSafeRedirects(url, {
    allowedDomainSuffix: 'snapchat.com',
    timeoutMs: Math.min(timeoutMs, 20000),
    acceptHeader: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  });

  if (response.status === 404) {
    throw new AppError(
      'Media could not be found. The Snapchat video may have been deleted, expired, or is unavailable.',
      404,
      'MEDIA_NOT_FOUND'
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new AppError(
      'This Snapchat content is private or restricted and cannot be downloaded.',
      403,
      'CONTENT_PRIVATE_OR_RESTRICTED'
    );
  }

  if (response.status === 429) {
    throw new AppError(
      'Snapchat is temporarily rate-limiting requests. Please try again in a few moments.',
      429,
      'UPSTREAM_RATE_LIMIT'
    );
  }

  if (!response.ok) {
    throw new AppError(
      'Unable to fetch Snapchat media page.',
      502,
      'EXTRACTION_FAILED'
    );
  }

  const html = await response.text();
  if (html.length > MAX_HTML_BYTES) {
    throw new AppError(
      'Metadata response exceeded maximum allowed size.',
      413,
      'METADATA_TOO_LARGE'
    );
  }

  const parsedFinal = new URL(finalUrl);
  const spotlightMatch = parsedFinal.pathname.match(
    /^\/(?:@[^/]+\/)?spotlight\/([A-Za-z0-9_-]+)\/?$/i
  );

  if (spotlightMatch) {
    const info = parseSnapchatSpotlightHtml(html, finalUrl, spotlightMatch[1]);
    if (info) {
      return info;
    }
    throw new AppError(
      'Media could not be found. The Snapchat Spotlight video may have been deleted or is unavailable.',
      404,
      'MEDIA_NOT_FOUND'
    );
  }

  const creatorStoryMatch = parsedFinal.pathname.match(
    /^\/(@[^/]+)\/([A-Za-z0-9_-]+)\/?$/i
  );
  if (creatorStoryMatch) {
    const [, creatorHandle, snapId] = creatorStoryMatch;
    const storyInfo = parseSnapchatCreatorStoryHtml(html, finalUrl, snapId, creatorHandle);
    if (storyInfo) {
      return storyInfo;
    }
    const spotlightFallback = parseSnapchatSpotlightHtml(html, finalUrl, snapId);
    if (spotlightFallback) {
      return spotlightFallback;
    }
    throw new AppError(
      'This Snapchat story has expired or is no longer available.',
      404,
      'MEDIA_NOT_FOUND'
    );
  }

  throw new AppError(
    'Unsupported Snapchat URL or unavailable content.',
    404,
    'MEDIA_NOT_FOUND'
  );
}

/**
 * Streams a Snapchat Spotlight or public creator story video/audio directly to the caller,
 * waiting for the first media chunk before resolving.
 */
export async function createSnapchatDownloadStream(
  url: string,
  option: DownloadOptionId,
  options?: {
    timeoutMs?: number;
    maxSizeMb?: number;
  }
): Promise<DownloadStreamHandle> {
  const timeoutMs =
    options?.timeoutMs ?? (Number(process.env.DOWNLOAD_TIMEOUT_MS) || 120000);
  const maxSizeMb =
    options?.maxSizeMb ?? (Number(process.env.MAX_DOWNLOAD_SIZE_MB) || 200);
  const maxBytes = maxSizeMb * 1024 * 1024;

  const info = await extractSnapchatMediaInfo(url, timeoutMs);
  const mediaUrl = sanitizeSafeSnapchatCdnUrl(info.url ?? info.formats?.[0]?.url);
  if (!mediaUrl) {
    throw new AppError(
      'No downloadable video stream was found for this Snapchat post.',
      422,
      'NO_VIDEO_FORMATS'
    );
  }

  const abortController = new AbortController();
  const { response } = await fetchWithSafeRedirects(mediaUrl, {
    timeoutMs: Math.min(timeoutMs, 30000),
    maxRedirects: 3,
    signal: abortController.signal,
  });

  if (!response.ok || !response.body) {
    if (response.status === 404 || response.status === 410) {
      throw new AppError(
        'Media could not be found. The Snapchat video stream may have expired.',
        404,
        'MEDIA_NOT_FOUND'
      );
    }
    throw new AppError(
      'Failed to retrieve media stream from Snapchat CDN.',
      502,
      'EXTRACTION_FAILED'
    );
  }

  const contentLengthHeader = response.headers.get('content-length');
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      await response.body.cancel().catch(() => {});
      throw new AppError(
        `Media file exceeds the ${maxSizeMb}MB size limit.`,
        413,
        'FILE_TOO_LARGE'
      );
    }
  }

  const webBody = response.body as unknown as WebReadableStream<Uint8Array>;
  const sourceStream = Readable.fromWeb(webBody);

  if (option === 'audio') {
    const ffmpegPath = resolveFfmpegBinary();
    if (!ffmpegPath) {
      sourceStream.destroy();
      abortController.abort();
      throw new AppError(
        'Audio extraction engine (ffmpeg) is not available on the server.',
        503,
        'EXTRACTOR_UNAVAILABLE'
      );
    }

    return new Promise<DownloadStreamHandle>((resolve, reject) => {
      const passThrough = new PassThrough();
      const stderrChunks: Buffer[] = [];
      let firstChunkReceived = false;
      let settled = false;
      let totalBytesStreamed = 0;

      const ffmpeg = spawn(
        ffmpegPath,
        [
          '-hide_banner',
          '-loglevel',
          'error',
          '-i',
          'pipe:0',
          '-vn',
          '-c:a',
          'aac',
          '-b:a',
          '128k',
          '-movflags',
          'frag_keyframe+empty_moov',
          '-f',
          'mp4',
          'pipe:1',
        ],
        {
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        }
      );

      const cleanup = () => {
        clearTimeout(timer);
        abortController.abort();
        sourceStream.destroy();
        terminateChildProcess(ffmpeg);
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
          cleanup();
        }
      }, timeoutMs);

      ffmpeg.stdin.on('error', () => {
        // Ignore EPIPE when ffmpeg exits early or cleanup terminates child process
      });
      sourceStream.on('error', (err) => {
        if (!firstChunkReceived && !settled) {
          settled = true;
          cleanup();
          reject(
            new AppError('Failed while reading Snapchat audio stream.', 502, 'STREAM_INTERRUPTED')
          );
        } else {
          passThrough.destroy(err);
          cleanup();
        }
      });
      sourceStream.pipe(ffmpeg.stdin);

      ffmpeg.stdout.on('data', (chunk: Buffer) => {
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
            cleanup();
          }
          return;
        }

        if (!firstChunkReceived) {
          firstChunkReceived = true;
          settled = true;
          resolve({
            stream: passThrough,
            process: ffmpeg,
            contentType: 'audio/mp4',
            extension: 'm4a',
            cleanup,
          });
        }

        if (!passThrough.destroyed) {
          const canContinue = passThrough.write(chunk);
          if (!canContinue) {
            ffmpeg.stdout.pause();
            passThrough.once('drain', () => ffmpeg.stdout.resume());
          }
        }
      });

      ffmpeg.stdout.on('end', () => {
        if (!passThrough.destroyed) {
          passThrough.end();
        }
      });

      ffmpeg.stderr.on('data', (chunk: Buffer) => {
        if (stderrChunks.length < 16) stderrChunks.push(chunk);
      });

      ffmpeg.on('error', () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(
          new AppError('Failed to start audio extraction process.', 500, 'EXTRACTOR_SPAWN_ERROR')
        );
      });

      ffmpeg.on('close', (code) => {
        clearTimeout(timer);
        if (!firstChunkReceived && !settled) {
          settled = true;
          cleanup();
          reject(
            new AppError(
              'Unable to extract audio stream from this Snapchat video.',
              422,
              'EXTRACTION_FAILED'
            )
          );
        } else if (code !== 0 && code !== null && !passThrough.destroyed) {
          passThrough.destroy(
            new AppError('Audio stream ended unexpectedly.', 502, 'STREAM_INTERRUPTED')
          );
        }
      });
    });
  }

  return new Promise<DownloadStreamHandle>((resolve, reject) => {
    const passThrough = new PassThrough();
    let firstChunkReceived = false;
    let settled = false;
    let totalBytesStreamed = 0;

    const cleanup = () => {
      clearTimeout(timer);
      abortController.abort();
      sourceStream.destroy();
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
        cleanup();
      }
    }, timeoutMs);

    sourceStream.on('data', (chunk: Buffer) => {
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
          cleanup();
        }
        return;
      }

      if (!firstChunkReceived) {
        firstChunkReceived = true;
        settled = true;
        resolve({
          stream: passThrough,
          process: null,
          contentType: 'video/mp4',
          extension: 'mp4',
          cleanup,
        });
      }

      if (!passThrough.destroyed) {
        const canContinue = passThrough.write(chunk);
        if (!canContinue) {
          sourceStream.pause();
          passThrough.once('drain', () => sourceStream.resume());
        }
      }
    });

    sourceStream.on('end', () => {
      clearTimeout(timer);
      if (!firstChunkReceived && !settled) {
        settled = true;
        cleanup();
        reject(
          new AppError(
            'Snapchat video stream returned no media data.',
            422,
            'NO_VIDEO_FORMATS'
          )
        );
      } else if (!passThrough.destroyed) {
        passThrough.end();
      }
    });

    sourceStream.on('error', (err) => {
      clearTimeout(timer);
      if (!firstChunkReceived && !settled) {
        settled = true;
        cleanup();
        reject(
          new AppError(
            'Failed to stream Snapchat video from CDN.',
            502,
            'STREAM_INTERRUPTED'
          )
        );
      } else {
        passThrough.destroy(err);
        cleanup();
      }
    });
  });
}
