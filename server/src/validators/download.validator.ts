import net from 'node:net';
import dns from 'node:dns/promises';
import { z } from 'zod';
import {
  AppError,
  DOWNLOAD_OPTION_IDS,
  type DownloadOptionId,
  type SupportedPlatform,
} from '../types/downloader.js';

const MAX_URL_LENGTH = 2048;

const PLATFORM_DOMAINS: Record<Exclude<SupportedPlatform, 'direct'>, string[]> = {
  tiktok: ['tiktok.com'],
  instagram: ['instagram.com', 'instagr.am'],
  x: ['x.com', 'twitter.com', 't.co'],
  snapchat: ['snapchat.com'],
};

const DIRECT_MEDIA_EXTENSIONS = [
  '.mp4',
  '.webm',
  '.mov',
  '.m4v',
  '.mp3',
  '.m4a',
  '.ogg',
  '.wav',
];

const RESERVED_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.corp',
  '.home',
  '.lan',
  '.arpa',
];

/**
 * Checks whether an IPv4 address belongs to a private, loopback, link-local, or reserved range.
 */
export function isPrivateOrReservedIPv4(ip: string): boolean {
  const parts = ip.split('.').map((part) => Number(part));
  if (
    parts.length !== 4 ||
    parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)
  ) {
    return true;
  }

  const [a, b, c] = parts;

  // 0.0.0.0/8 (Current network)
  if (a === 0) return true;
  // 10.0.0.0/8 (Private network)
  if (a === 10) return true;
  // 100.64.0.0/10 (Shared address space / CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 127.0.0.0/8 (Loopback)
  if (a === 127) return true;
  // 169.254.0.0/16 (Link-local / cloud metadata 169.254.169.254)
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 (Private network)
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.0.0.0/24 (IETF protocol assignments)
  if (a === 192 && b === 0 && c === 0) return true;
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 (Documentation ranges)
  if (
    (a === 192 && b === 0 && c === 2) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  ) {
    return true;
  }
  // 192.168.0.0/16 (Private network)
  if (a === 192 && b === 168) return true;
  // 198.18.0.0/15 (Benchmarking)
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 (Multicast) & 240.0.0.0/4 (Reserved / Broadcast)
  if (a >= 224) return true;

  return false;
}

/**
 * Checks whether an IPv6 address belongs to a private, loopback, link-local, or reserved range.
 */
export function isPrivateOrReservedIPv6(rawIp: string): boolean {
  const normalized = rawIp.toLowerCase().replace(/^\[|\]$/g, '').split('%')[0];

  if (normalized === '::1' || normalized === '::' || normalized === '0:0:0:0:0:0:0:1' || normalized === '0:0:0:0:0:0:0:0') {
    return true;
  }

  // IPv4-mapped IPv6 addresses (e.g., ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (normalized.startsWith('::ffff:')) {
    const ipv4Part = normalized.slice('::ffff:'.length);
    if (net.isIPv4(ipv4Part)) {
      return isPrivateOrReservedIPv4(ipv4Part);
    }
    return true;
  }

  // Unique local addresses (fc00::/7 -> fc00..fdff)
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) {
    return true;
  }

  // Link-local unicast (fe80::/10 -> fe8, fe9, fea, feb)
  if (/^fe[89ab]/.test(normalized)) {
    return true;
  }

  // Multicast (ff00::/8)
  if (normalized.startsWith('ff')) {
    return true;
  }

  // Documentation prefix (2001:db8::/32)
  if (normalized.startsWith('2001:db8:') || normalized.startsWith('2001:0db8:')) {
    return true;
  }

  return false;
}

/**
 * Checks whether a hostname or IP literal targets a local, private, or internal network destination.
 */
export function isDisallowedHost(hostname: string): boolean {
  const cleanHost = hostname.toLowerCase().replace(/^\[|\]$/g, '').trim();

  if (!cleanHost) {
    return true;
  }

  if (
    cleanHost === 'localhost' ||
    RESERVED_HOST_SUFFIXES.some((suffix) => cleanHost.endsWith(suffix))
  ) {
    return true;
  }

  // Reject single-label hostnames without dots (e.g. "redis", "internal-api")
  if (!cleanHost.includes('.') && !cleanHost.includes(':')) {
    return true;
  }

  // Check numeric/octal/hex IPv4 obfuscations like 0x7f000001 or 2130706433
  if (/^(0x[0-9a-f]+|\d+)$/i.test(cleanHost)) {
    return true;
  }

  const ipVersion = net.isIP(cleanHost);
  if (ipVersion === 4) {
    return isPrivateOrReservedIPv4(cleanHost);
  }
  if (ipVersion === 6) {
    return isPrivateOrReservedIPv6(cleanHost);
  }

  return false;
}

/**
 * Strictly checks if `hostname` equals `baseDomain` or is a valid subdomain of `baseDomain`
 * along label boundaries (e.g. `www.tiktok.com` matches `tiktok.com`, `evil-tiktok.com` does not).
 */
export function matchesDomainBoundary(hostname: string, baseDomain: string): boolean {
  const host = hostname.toLowerCase();
  const domain = baseDomain.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Detects which supported platform a validated URL belongs to, or null if unsupported.
 */
export function detectPlatform(parsedUrl: URL): SupportedPlatform | null {
  const hostname = parsedUrl.hostname.toLowerCase();

  for (const [platform, domains] of Object.entries(PLATFORM_DOMAINS) as Array<
    [Exclude<SupportedPlatform, 'direct'>, string[]]
  >) {
    if (domains.some((domain) => matchesDomainBoundary(hostname, domain))) {
      return platform;
    }
  }

  const lowerPath = parsedUrl.pathname.toLowerCase();
  if (DIRECT_MEDIA_EXTENSIONS.some((ext) => lowerPath.endsWith(ext))) {
    return 'direct';
  }

  return null;
}

export interface ValidatedMediaUrl {
  url: string;
  parsedUrl: URL;
  platform: SupportedPlatform;
}

/**
 * Parses, validates, and classifies a user-supplied media URL.
 * Throws an AppError (400) if the URL is malformed, non-HTTPS, targets an internal host,
 * or does not belong to a supported platform.
 */
export function validateAndClassifyUrl(rawUrl: string): ValidatedMediaUrl {
  if (typeof rawUrl !== 'string') {
    throw new AppError('A valid URL string is required.', 400, 'INVALID_URL');
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw new AppError('Please provide a media URL.', 400, 'EMPTY_URL');
  }

  if (trimmed.length > MAX_URL_LENGTH) {
    throw new AppError('URL exceeds maximum allowed length.', 400, 'URL_TOO_LONG');
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new AppError('Malformed URL. Please enter a complete HTTPS link.', 400, 'MALFORMED_URL');
  }

  if (parsed.protocol !== 'https:') {
    throw new AppError(
      'Only secure HTTPS URLs are supported.',
      400,
      'UNSUPPORTED_PROTOCOL'
    );
  }

  if (parsed.username || parsed.password) {
    throw new AppError(
      'URLs containing embedded credentials are not allowed.',
      400,
      'CREDENTIALS_NOT_ALLOWED'
    );
  }

  if (isDisallowedHost(parsed.hostname)) {
    throw new AppError(
      'Local, private, and internal network destinations are forbidden.',
      400,
      'FORBIDDEN_HOST'
    );
  }

  const platform = detectPlatform(parsed);
  if (!platform) {
    throw new AppError(
      'Unsupported URL or platform. Supported sources: TikTok, Instagram, X (Twitter), Snapchat Spotlight, and direct HTTPS media links (.mp4, .webm, .mov, .mp3, .m4a).',
      400,
      'UNSUPPORTED_PLATFORM'
    );
  }

  // Ensure social platform URLs have a meaningful path beyond "/"
  if (
    platform !== 'direct' &&
    (!parsed.pathname || parsed.pathname === '/' || parsed.pathname.trim().length <= 1)
  ) {
    throw new AppError(
      'Please provide a direct link to a specific video or post rather than the platform homepage.',
      400,
      'MISSING_MEDIA_PATH'
    );
  }

  // Enforce strict Snapchat URL format matching yt-dlp's SnapchatSpotlightIE (_VALID_URL)
  // plus Snapchat share short-links (snapchat.com/t/<code>, t.snapchat.com/<code>, story.snapchat.com/o/<code>)
  // and public creator stories/snaps (snapchat.com/@<creator>/<snap_id>)
  if (platform === 'snapchat') {
    const host = parsed.hostname.toLowerCase();
    const isSpotlightHost = host === 'snapchat.com' || host === 'www.snapchat.com';
    const isShortHost = host === 't.snapchat.com';
    const isStoryHost = host === 'story.snapchat.com';

    const isSpotlightPath = /^\/(?:@[^/]+\/)?spotlight\/[A-Za-z0-9_-]+\/?$/i.test(parsed.pathname);
    const isPublicSnapPath = /^\/@[^/]+\/[A-Za-z0-9_-]+\/?$/i.test(parsed.pathname);
    const isWebShortPath = /^\/t\/[A-Za-z0-9_-]+\/?$/i.test(parsed.pathname);
    const isAddSnapHop = /^\/add\/[^/]+\/[A-Za-z0-9_-]+\/?$/i.test(parsed.pathname);

    const isShortDomainPath = /^\/[A-Za-z0-9_-]+\/?$/i.test(parsed.pathname);
    const isStorySpotlightHop = /^\/o\/[A-Za-z0-9_-]+\/?$/i.test(parsed.pathname);
    const isStoryUserHop = /^\/u\/[^/]+\/[A-Za-z0-9_-]+\/?$/i.test(parsed.pathname);

    const isValidSnapchatUrl =
      (isSpotlightHost && (isSpotlightPath || isPublicSnapPath || isWebShortPath || isAddSnapHop)) ||
      (isShortHost && isShortDomainPath) ||
      (isStoryHost && (isStorySpotlightHop || isStoryUserHop));

    if (!isValidSnapchatUrl) {
      throw new AppError(
        'Unsupported Snapchat URL. Only public Snapchat Spotlight and story video links are supported; private Snaps are not supported.',
        400,
        'UNSUPPORTED_SNAPCHAT_URL'
      );
    }
  }

  return {
    url: parsed.toString(),
    parsedUrl: parsed,
    platform,
  };
}

/**
 * Checks whether a hostname + pathname represents a short-link URL that redirects to a canonical post.
 */
function isShortLinkUrl(parsedUrl: URL): boolean {
  const host = parsedUrl.hostname.toLowerCase();
  if (['vm.tiktok.com', 'vt.tiktok.com', 't.co', 'instagr.am', 't.snapchat.com'].includes(host)) {
    return true;
  }
  if (matchesDomainBoundary(host, 'tiktok.com') && /^\/t\/[A-Za-z0-9_-]+/i.test(parsedUrl.pathname)) {
    return true;
  }
  if (matchesDomainBoundary(host, 'snapchat.com')) {
    // Snapchat share links (/t/...) and intermediate redirect hops (/o/..., /u/.../..., /add/.../...)
    if (/^\/(?:t|o)\/[A-Za-z0-9_-]+/i.test(parsedUrl.pathname)) {
      return true;
    }
    if (/^\/(?:u|add)\/[^/]+\/[A-Za-z0-9_-]+/i.test(parsedUrl.pathname)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks whether a redirected TikTok URL points to a canonical media or short-link path
 * rather than an interstitial login, challenge, or error page.
 */
function isCanonicalTikTokMediaPath(pathname: string): boolean {
  return /^\/(@[^/]+\/(video|photo)\/\d+|v\/\d+|t\/[A-Za-z0-9_-]+|embed\/)/i.test(pathname);
}

/**
 * Verifies that a hostname resolves only to public IP addresses.
 */
async function assertSafeDnsResolution(hostname: string): Promise<void> {
  const cleanHost = hostname.replace(/^\[|\]$/g, '');
  if (net.isIP(cleanHost) !== 0) {
    return;
  }

  try {
    const records = await dns.lookup(cleanHost, { all: true });
    for (const record of records) {
      const isPrivate =
        record.family === 4
          ? isPrivateOrReservedIPv4(record.address)
          : isPrivateOrReservedIPv6(record.address);
      if (isPrivate) {
        throw new AppError(
          'URL hostname resolves to a restricted internal network address.',
          400,
          'FORBIDDEN_RESOLVED_IP'
        );
      }
    }
  } catch (err) {
    if (err instanceof AppError) {
      throw err;
    }
    // If DNS lookup fails transiently, allow yt-dlp to report network error or re-check
  }
}

/**
 * Verifies that a hostname resolves only to public IP addresses, and validates redirect hops
 * when short-links (e.g., vm.tiktok.com, t.co) or direct URLs redirect to another destination.
 */
export async function verifyNetworkSafetyAndRedirects(
  initialUrl: string,
  maxRedirects = 5
): Promise<ValidatedMediaUrl> {
  let currentValidated = validateAndClassifyUrl(initialUrl);

  for (let hop = 0; hop <= maxRedirects; hop++) {
    await assertSafeDnsResolution(currentValidated.parsedUrl.hostname);

    // Only follow pre-flight HTTP redirects for short links or direct links to verify final target safety
    const isShortLink = isShortLinkUrl(currentValidated.parsedUrl);
    if (!isShortLink && currentValidated.platform !== 'direct') {
      break;
    }

    // Use facebookexternalhit/1.1 for TikTok short links to match yt-dlp's TikTokVMIE
    // and avoid datacenter bot redirects to /login or homepage interstitials
    const userAgent =
      currentValidated.platform === 'tiktok' && isShortLink
        ? 'facebookexternalhit/1.1'
        : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(currentValidated.url, {
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': userAgent,
        },
      }).finally(() => clearTimeout(timeout));

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) {
          break;
        }
        const nextUrl = new URL(location, currentValidated.url).toString();

        // If a TikTok short-link HEAD check redirects to a non-media TikTok page (e.g., /login, /404, or /),
        // still enforce SSRF/host/platform validation on the target host, then keep the original short link
        // so yt-dlp's TikTokVMIE extractor can resolve it directly.
        const nextParsed = new URL(nextUrl);
        if (
          currentValidated.platform === 'tiktok' &&
          nextParsed.protocol === 'https:' &&
          !nextParsed.username &&
          !nextParsed.password &&
          !isDisallowedHost(nextParsed.hostname) &&
          matchesDomainBoundary(nextParsed.hostname, 'tiktok.com') &&
          !isCanonicalTikTokMediaPath(nextParsed.pathname)
        ) {
          await assertSafeDnsResolution(nextParsed.hostname);
          break;
        }

        currentValidated = validateAndClassifyUrl(nextUrl);
        continue;
      }
      break;
    } catch (err) {
      if (err instanceof AppError) {
        throw err;
      }
      break;
    }
  }

  if (currentValidated.platform === 'snapchat') {
    const spotlightMatch = currentValidated.parsedUrl.pathname.match(
      /^\/(?:@[^/]+\/)?spotlight\/([A-Za-z0-9_-]+)\/?$/i
    );
    if (spotlightMatch) {
      // Normalize to canonical spotlight URL so yt-dlp invokes its dedicated SnapchatSpotlight extractor
      const spotlightId = spotlightMatch[1];
      currentValidated = validateAndClassifyUrl(
        `https://www.snapchat.com/spotlight/${spotlightId}`
      );
    } else {
      const publicSnapMatch = currentValidated.parsedUrl.pathname.match(
        /^\/(@[^/]+)\/([A-Za-z0-9_-]+)\/?$/i
      );
      if (publicSnapMatch) {
        const creator = publicSnapMatch[1];
        const snapId = publicSnapMatch[2];
        currentValidated = validateAndClassifyUrl(
          `https://www.snapchat.com/${creator}/${snapId}`
        );
      } else {
        throw new AppError(
          'Snapchat short link did not resolve to a public Snapchat Spotlight or story video URL.',
          400,
          'UNSUPPORTED_SNAPCHAT_URL'
        );
      }
    }
  }

  return currentValidated;
}

export const infoRequestSchema = z.object({
  url: z
    .string({
      required_error: 'Media URL is required.',
      invalid_type_error: 'Media URL must be a string.',
    })
    .trim()
    .min(1, 'Please enter a media URL.')
    .max(MAX_URL_LENGTH, 'URL is too long.')
    .superRefine((val, ctx) => {
      try {
        validateAndClassifyUrl(val);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Invalid media URL.',
        });
      }
    }),
});

export const downloadQuerySchema = z.object({
  url: z
    .string({
      required_error: 'Query parameter "url" is required.',
      invalid_type_error: 'Query parameter "url" must be a string.',
    })
    .trim()
    .min(1, 'Please provide a media URL.')
    .max(MAX_URL_LENGTH, 'URL is too long.')
    .superRefine((val, ctx) => {
      try {
        validateAndClassifyUrl(val);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : 'Invalid media URL.',
        });
      }
    }),
  option: z
    .enum(DOWNLOAD_OPTION_IDS, {
      errorMap: () => ({
        message: `Unsupported download option. Allowed values: ${DOWNLOAD_OPTION_IDS.join(', ')}.`,
      }),
    })
    .optional()
    .default('best'),
  title: z.string().trim().max(200).optional(),
});

export type InfoRequestInput = z.infer<typeof infoRequestSchema>;
export type DownloadQueryInput = {
  url: string;
  option: DownloadOptionId;
  title?: string;
};
