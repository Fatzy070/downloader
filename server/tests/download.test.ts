import type { ChildProcess } from 'node:child_process';
import dns from 'node:dns/promises';
import { PassThrough } from 'node:stream';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as ytdlpAdapter from '../src/adapters/ytdlp.adapter.js';
import { createApp, parseAllowedOrigins } from '../src/app.js';
import { normalizeMediaMetadata } from '../src/services/media-info.service.js';
import { AppError } from '../src/types/downloader.js';
import { buildContentDisposition, sanitizeFilename } from '../src/utils/filename.js';
import {
  isDisallowedHost,
  isPrivateOrReservedIPv4,
  isPrivateOrReservedIPv6,
  matchesDomainBoundary,
  validateAndClassifyUrl,
  verifyNetworkSafetyAndRedirects,
} from '../src/validators/download.validator.js';

describe('URL Validation & Network Safety', () => {
  it('accepts valid HTTPS URLs for TikTok, Instagram, X, and direct media', () => {
    const tiktok = validateAndClassifyUrl(
      'https://www.tiktok.com/@creator/video/7123456789012345678'
    );
    expect(tiktok.platform).toBe('tiktok');

    const tiktokShort = validateAndClassifyUrl('https://vm.tiktok.com/ZM1234567/');
    expect(tiktokShort.platform).toBe('tiktok');

    const instagram = validateAndClassifyUrl(
      'https://www.instagram.com/reel/C1234567890/'
    );
    expect(instagram.platform).toBe('instagram');

    const xPost = validateAndClassifyUrl(
      'https://x.com/nasa/status/1234567890123456789'
    );
    expect(xPost.platform).toBe('x');

    const twitterPost = validateAndClassifyUrl(
      'https://twitter.com/nasa/status/1234567890123456789'
    );
    expect(twitterPost.platform).toBe('x');

    const snapchatSpotlight = validateAndClassifyUrl(
      'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYYWtidGhudGZpAX1TKn0JAX1TKnXJAAAAAA'
    );
    expect(snapchatSpotlight.platform).toBe('snapchat');

    const snapchatBareHost = validateAndClassifyUrl(
      'https://snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYYWtidGhudGZpAX1TKn0JAX1TKnXJAAAAAA/'
    );
    expect(snapchatBareHost.platform).toBe('snapchat');

    const snapchatShort = validateAndClassifyUrl('https://t.snapchat.com/AbCdEf12');
    expect(snapchatShort.platform).toBe('snapchat');

    const snapchatWebShort = validateAndClassifyUrl('https://snapchat.com/t/fc6R00hu');
    expect(snapchatWebShort.platform).toBe('snapchat');

    const snapchatWwwWebShort = validateAndClassifyUrl('https://www.snapchat.com/t/fc6R00hu');
    expect(snapchatWwwWebShort.platform).toBe('snapchat');

    const snapchatNewFailingShort = validateAndClassifyUrl('https://snapchat.com/t/UC1FHTyb');
    expect(snapchatNewFailingShort.platform).toBe('snapchat');

    const snapchatNewFailingWwwShort = validateAndClassifyUrl('https://www.snapchat.com/t/UC1FHTyb');
    expect(snapchatNewFailingWwwShort.platform).toBe('snapchat');

    const snapchatUserSpotlight = validateAndClassifyUrl(
      'https://www.snapchat.com/@geh.updates/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYdmdmanNueXd6AaF4GoeCAaF4GiqWAAAAAA'
    );
    expect(snapchatUserSpotlight.platform).toBe('snapchat');

    const snapchatHyphenUserSpotlight = validateAndClassifyUrl(
      'https://www.snapchat.com/@styleupaven/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYanJxeHJ5eWh0AaFAML2WAaFAMI-3AAAAAQ'
    );
    expect(snapchatHyphenUserSpotlight.platform).toBe('snapchat');

    const snapchatStoryRedirectHop = validateAndClassifyUrl(
      'https://story.snapchat.com/o/W7_EDlXWTBiXAEEniNoMPwAAYdmdmanNueXd6AaF4GoeCAaF4GiqWAAAAAA'
    );
    expect(snapchatStoryRedirectHop.platform).toBe('snapchat');

    const snapchatStoryHyphenRedirectHop = validateAndClassifyUrl(
      'https://story.snapchat.com/o/W7_EDlXWTBiXAEEniNoMPwAAYanJxeHJ5eWh0AaFAML2WAaFAMI-3AAAAAQ'
    );
    expect(snapchatStoryHyphenRedirectHop.platform).toBe('snapchat');

    const snapchatStoryShareLink = validateAndClassifyUrl('https://snapchat.com/t/8goGbzUQ');
    expect(snapchatStoryShareLink.platform).toBe('snapchat');

    const snapchatPublicStorySnap = validateAndClassifyUrl(
      'https://www.snapchat.com/@ppocolee/Bw_N5xUhTu-gdSvKykP8SgAAgcmRudXV1YW9yAaF_xbgPAaF_xbQwAAAAAA'
    );
    expect(snapchatPublicStorySnap.platform).toBe('snapchat');

    const snapchatStoryUserHop = validateAndClassifyUrl(
      'https://story.snapchat.com/u/ppocolee/Bw_N5xUhTu-gdSvKykP8SgAAgcmRudXV1YW9yAaF_xbgPAaF_xbQwAAAAAA'
    );
    expect(snapchatStoryUserHop.platform).toBe('snapchat');

    const snapchatAddHop = validateAndClassifyUrl(
      'https://www.snapchat.com/add/ppocolee/Bw_N5xUhTu-gdSvKykP8SgAAgcmRudXV1YW9yAaF_xbgPAaF_xbQwAAAAAA'
    );
    expect(snapchatAddHop.platform).toBe('snapchat');

    const directMp4 = validateAndClassifyUrl(
      'https://cdn.example.org/media/sample-clip.mp4'
    );
    expect(directMp4.platform).toBe('direct');
  });

  it('accepts valid HTTPS URLs for Facebook Watch, Reels, Videos, Shares, and short links', () => {
    const watchUrl = validateAndClassifyUrl('https://www.facebook.com/watch/?v=1195289147628387');
    expect(watchUrl.platform).toBe('facebook');

    const watchLiveUrl = validateAndClassifyUrl('https://www.facebook.com/watch/live/?v=1195289147628387');
    expect(watchLiveUrl.platform).toBe('facebook');

    const watchPathId = validateAndClassifyUrl('https://www.facebook.com/watch/1195289147628387/');
    expect(watchPathId.platform).toBe('facebook');

    const reelUrl = validateAndClassifyUrl('https://www.facebook.com/reel/1195289147628387');
    expect(reelUrl.platform).toBe('facebook');

    const reelsUrl = validateAndClassifyUrl('https://www.facebook.com/reels/1195289147628387/');
    expect(reelsUrl.platform).toBe('facebook');

    const userReel = validateAndClassifyUrl('https://www.facebook.com/username/reel/1195289147628387');
    expect(userReel.platform).toBe('facebook');

    const userVideos = validateAndClassifyUrl('https://www.facebook.com/BeastCampTraining/videos/1195289147628387/');
    expect(userVideos.platform).toBe('facebook');

    const userCategoryVideos = validateAndClassifyUrl('https://www.facebook.com/page/videos/training/1195289147628387');
    expect(userCategoryVideos.platform).toBe('facebook');

    const fbWatchShort = validateAndClassifyUrl('https://fb.watch/abcdef123/');
    expect(fbWatchShort.platform).toBe('facebook');

    const fbGgShort = validateAndClassifyUrl('https://fb.gg/v/abcdef123');
    expect(fbGgShort.platform).toBe('facebook');

    const shareVideo = validateAndClassifyUrl('https://www.facebook.com/share/v/19Z9rS884k/');
    expect(shareVideo.platform).toBe('facebook');

    const shareReel = validateAndClassifyUrl('https://www.facebook.com/share/r/19Z9rS884k/');
    expect(shareReel.platform).toBe('facebook');

    const shareDirect = validateAndClassifyUrl('https://www.facebook.com/share/19Z9rS884k/');
    expect(shareDirect.platform).toBe('facebook');

    const videoPhp = validateAndClassifyUrl('https://www.facebook.com/video.php?v=1195289147628387');
    expect(videoPhp.platform).toBe('facebook');

    const permalinkPhp = validateAndClassifyUrl('https://www.facebook.com/permalink.php?story_fbid=1195289147628387&id=12345');
    expect(permalinkPhp.platform).toBe('facebook');

    const userPost = validateAndClassifyUrl('https://www.facebook.com/username/posts/1195289147628387/');
    expect(userPost.platform).toBe('facebook');

    const webFacebook = validateAndClassifyUrl('https://web.facebook.com/watch/?v=1195289147628387');
    expect(webFacebook.platform).toBe('facebook');

    const mFacebook = validateAndClassifyUrl('https://m.facebook.com/reel/1195289147628387');
    expect(mFacebook.platform).toBe('facebook');
  });

  it('rejects unsupported Snapchat paths (Stories, profiles, add links, non-Spotlight subdomains)', () => {
    expect(() =>
      validateAndClassifyUrl('https://www.snapchat.com/add/someuser')
    ).toThrowError(/Only public Snapchat Spotlight and story video links/);

    expect(() =>
      validateAndClassifyUrl('https://www.snapchat.com/@ppocolee')
    ).toThrowError(/Only public Snapchat Spotlight and story video links/);

    expect(() =>
      validateAndClassifyUrl('https://www.snapchat.com/s/story123')
    ).toThrowError(/Only public Snapchat Spotlight and story video links/);

    expect(() =>
      validateAndClassifyUrl('https://www.snapchat.com/p/profile123')
    ).toThrowError(/Only public Snapchat Spotlight and story video links/);

    expect(() =>
      validateAndClassifyUrl('https://www.snapchat.com/spotlight/')
    ).toThrowError(/Only public Snapchat Spotlight and story video links/);

    expect(() =>
      validateAndClassifyUrl('https://accounts.snapchat.com/spotlight/W7_EDlXWTBiX')
    ).toThrowError(/Only public Snapchat Spotlight and story video links/);

    expect(() =>
      validateAndClassifyUrl('https://evil-snapchat.com/spotlight/W7_EDlXWTBiX')
    ).toThrowError(/Unsupported URL or platform/);
  });

  it('rejects unsupported Facebook paths (profiles, groups, bare feeds, non-video pages)', () => {
    expect(() =>
      validateAndClassifyUrl('https://www.facebook.com/zuck')
    ).toThrowError(/Unsupported Facebook URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.facebook.com/groups/12345678')
    ).toThrowError(/Unsupported Facebook URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.facebook.com/watch')
    ).toThrowError(/Unsupported Facebook URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.facebook.com/watch/')
    ).toThrowError(/Unsupported Facebook URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.facebook.com/marketplace')
    ).toThrowError(/Unsupported Facebook URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.facebook.com/settings')
    ).toThrowError(/Unsupported Facebook URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.facebook.com/reel')
    ).toThrowError(/Unsupported Facebook URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.facebook.com/reel/')
    ).toThrowError(/Unsupported Facebook URL/);

    expect(() =>
      validateAndClassifyUrl('https://evil-facebook.com/watch/?v=1195289147628387')
    ).toThrowError(/Unsupported URL or platform/);
  });

  it('accepts valid HTTPS URLs for LinkedIn public video posts, feed updates, and lnkd.in short links', () => {
    const postActivity = validateAndClassifyUrl(
      'https://www.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7'
    );
    expect(postActivity.platform).toBe('linkedin');

    const postUgc = validateAndClassifyUrl(
      'https://www.linkedin.com/posts/mishalkhawaja_sendinblueviews-toronto-digitalmarketing-ugcPost-6850898786781339649-mM20'
    );
    expect(postUgc.platform).toBe('linkedin');

    const feedActivity = validateAndClassifyUrl(
      'https://www.linkedin.com/feed/update/urn:li:activity:7151241570371948544/?utm_source=share&utm_medium=member_desktop'
    );
    expect(feedActivity.platform).toBe('linkedin');

    const feedUgc = validateAndClassifyUrl(
      'https://www.linkedin.com/feed/update/urn:li:ugcPost:6850898786781339649'
    );
    expect(feedUgc.platform).toBe('linkedin');

    const feedShare = validateAndClassifyUrl(
      'https://www.linkedin.com/feed/update/urn:li:share:7151241570371948544/'
    );
    expect(feedShare.platform).toBe('linkedin');

    const regionalSubdomain = validateAndClassifyUrl(
      'https://uk.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7'
    );
    expect(regionalSubdomain.platform).toBe('linkedin');

    const shortLink = validateAndClassifyUrl('https://lnkd.in/dR8x9Yz');
    expect(shortLink.platform).toBe('linkedin');
  });

  it('rejects unsupported LinkedIn paths (profiles, company pages, jobs, events, learning courses, bare feeds)', () => {
    expect(() =>
      validateAndClassifyUrl('https://www.linkedin.com/in/satyanadella')
    ).toThrowError(/Unsupported LinkedIn URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.linkedin.com/company/microsoft')
    ).toThrowError(/Unsupported LinkedIn URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.linkedin.com/jobs/view/3812345678')
    ).toThrowError(/Unsupported LinkedIn URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.linkedin.com/events/7084656651378536448/comments/')
    ).toThrowError(/Unsupported LinkedIn URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.linkedin.com/learning/python-essential-training')
    ).toThrowError(/Unsupported LinkedIn URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.linkedin.com/feed/')
    ).toThrowError(/Unsupported LinkedIn URL/);

    expect(() =>
      validateAndClassifyUrl('https://www.linkedin.com/posts/')
    ).toThrowError(/Unsupported LinkedIn URL/);

    expect(() =>
      validateAndClassifyUrl('https://evil-linkedin.com/posts/user-activity-7151241570371948544-4Gu7')
    ).toThrowError(/Unsupported URL or platform/);
  });

  it('rejects empty, malformed, and non-HTTPS URLs', () => {
    expect(() => validateAndClassifyUrl('')).toThrowError(/Please provide a media URL/);
    expect(() => validateAndClassifyUrl('not-a-valid-url')).toThrowError(/Malformed URL/);
    expect(() =>
      validateAndClassifyUrl('http://www.tiktok.com/@user/video/12345')
    ).toThrowError(/Only secure HTTPS URLs are supported/);
    expect(() =>
      validateAndClassifyUrl('ftp://cdn.example.com/video.mp4')
    ).toThrowError(/Only secure HTTPS URLs are supported/);
    expect(() => validateAndClassifyUrl('javascript:alert(1)')).toThrowError(
      /Only secure HTTPS URLs are supported/
    );
  });

  it('enforces strict hostname boundary matching and rejects lookalike domains', () => {
    expect(matchesDomainBoundary('www.tiktok.com', 'tiktok.com')).toBe(true);
    expect(matchesDomainBoundary('evil-tiktok.com', 'tiktok.com')).toBe(false);
    expect(matchesDomainBoundary('tiktok.com.evil.org', 'tiktok.com')).toBe(false);

    expect(() =>
      validateAndClassifyUrl('https://evil-tiktok.com/@user/video/12345')
    ).toThrowError(/Unsupported URL or platform/);
    expect(() =>
      validateAndClassifyUrl('https://tiktok.com.attacker.com/@user/video/12345')
    ).toThrowError(/Unsupported URL or platform/);
    expect(() =>
      validateAndClassifyUrl('https://untrusted-site.org/article/123')
    ).toThrowError(/Unsupported URL or platform/);
  });

  it('rejects localhost, private IPv4/IPv6 ranges, link-local metadata IPs, and internal hosts', () => {
    expect(isPrivateOrReservedIPv4('127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('10.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv4('172.16.5.4')).toBe(true);
    expect(isPrivateOrReservedIPv4('192.168.1.100')).toBe(true);
    expect(isPrivateOrReservedIPv4('169.254.169.254')).toBe(true);
    expect(isPrivateOrReservedIPv4('8.8.8.8')).toBe(false);

    expect(isPrivateOrReservedIPv6('::1')).toBe(true);
    expect(isPrivateOrReservedIPv6('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateOrReservedIPv6('fe80::1')).toBe(true);
    expect(isPrivateOrReservedIPv6('fc00::1')).toBe(true);

    expect(isDisallowedHost('localhost')).toBe(true);
    expect(isDisallowedHost('internal.local')).toBe(true);
    expect(isDisallowedHost('redis')).toBe(true);

    expect(() =>
      validateAndClassifyUrl('https://localhost/video.mp4')
    ).toThrowError(/Local, private, and internal network destinations are forbidden/);
    expect(() =>
      validateAndClassifyUrl('https://127.0.0.1/video.mp4')
    ).toThrowError(/Local, private, and internal network destinations are forbidden/);
    expect(() =>
      validateAndClassifyUrl('https://169.254.169.254/latest/meta-data/video.mp4')
    ).toThrowError(/Local, private, and internal network destinations are forbidden/);
  });

  it('rejects URLs with embedded credentials or homepage-only social URLs', () => {
    expect(() =>
      validateAndClassifyUrl('https://user:pass@www.tiktok.com/@u/video/123')
    ).toThrowError(/credentials are not allowed/);
    expect(() => validateAndClassifyUrl('https://www.tiktok.com/')).toThrowError(
      /specific video or post/
    );
  });

  it('resolves vm.tiktok.com short links using facebookexternalhit/1.1 User-Agent and preserves short link on non-video redirects', async () => {
    const dnsSpy = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '23.212.251.16', family: 4 }] as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            location:
              'https://www.tiktok.com/@cchhaaee111/video/7700645303124282631?_r=1&_t=ZN-9AwBQQJlb0A',
          },
        })
      );

    const resolved = await verifyNetworkSafetyAndRedirects(
      'https://vm.tiktok.com/ZN8U27FNg/'
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://vm.tiktok.com/ZN8U27FNg/',
      expect.objectContaining({
        method: 'HEAD',
        redirect: 'manual',
        headers: {
          'User-Agent': 'facebookexternalhit/1.1',
        },
      })
    );
    expect(resolved.url).toBe(
      'https://www.tiktok.com/@cchhaaee111/video/7700645303124282631?_r=1&_t=ZN-9AwBQQJlb0A'
    );
    expect(resolved.platform).toBe('tiktok');

    // If a datacenter edge redirects HEAD to /login or /, preserve the original vm.tiktok.com URL for yt-dlp
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://www.tiktok.com/login?redirect_url=https%3A%2F%2Fwww.tiktok.com%2F',
        },
      })
    );

    const fallbackResolved = await verifyNetworkSafetyAndRedirects(
      'https://vm.tiktok.com/ZN8U27FNg/'
    );
    expect(fallbackResolved.url).toBe('https://vm.tiktok.com/ZN8U27FNg/');
    expect(fallbackResolved.platform).toBe('tiktok');

    // Still block malicious SSRF redirects from short links
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://127.0.0.1/internal',
        },
      })
    );

    await expect(
      verifyNetworkSafetyAndRedirects('https://vm.tiktok.com/ZN8U27FNg/')
    ).rejects.toThrow(/Local, private, and internal network destinations are forbidden/);

    fetchSpy.mockRestore();
    dnsSpy.mockRestore();
  });

  it('resolves t.snapchat.com short links to Spotlight URLs and rejects non-Spotlight or SSRF redirects', async () => {
    const dnsSpy = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '34.110.180.1', family: 4 }] as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location:
              'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYYWtidGhudGZpAX1TKn0JAX1TKnXJAAAAAA',
          },
        })
      );

    const resolved = await verifyNetworkSafetyAndRedirects(
      'https://t.snapchat.com/AbCdEf12'
    );
    expect(resolved.url).toBe(
      'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYYWtidGhudGZpAX1TKn0JAX1TKnXJAAAAAA'
    );
    expect(resolved.platform).toBe('snapchat');

    // Reject if short link redirects to a Snapchat profile (/add/...) instead of Spotlight
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://www.snapchat.com/add/someuser',
        },
      })
    );
    await expect(
      verifyNetworkSafetyAndRedirects('https://t.snapchat.com/AbCdEf12')
    ).rejects.toThrow(/Only public Snapchat Spotlight and story video links/);

    // Reject if short link redirects to a private IP (SSRF)
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://169.254.169.254/latest/meta-data',
        },
      })
    );
    await expect(
      verifyNetworkSafetyAndRedirects('https://t.snapchat.com/AbCdEf12')
    ).rejects.toThrow(/Local, private, and internal network destinations are forbidden/);

    fetchSpy.mockRestore();
    dnsSpy.mockRestore();
  });

  it('resolves snapchat.com/t/ multi-hop share links to canonical Spotlight URLs and rejects invalid targets', async () => {
    const dnsSpy = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '34.110.180.1', family: 4 }] as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // Step 1: snapchat.com/t/fc6R00hu -> 301 www.snapchat.com/t/fc6R00hu
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            location: 'https://www.snapchat.com/t/fc6R00hu',
          },
        })
      )
      // Step 2: www.snapchat.com/t/fc6R00hu -> 303 story.snapchat.com/o/...
      .mockResolvedValueOnce(
        new Response(null, {
          status: 303,
          headers: {
            location:
              'https://story.snapchat.com/o/W7_EDlXWTBiXAEEniNoMPwAAYdmdmanNueXd6AaF4GoeCAaF4GiqWAAAAAA?invite_id=123',
          },
        })
      )
      // Step 3: story.snapchat.com/o/... -> 301 www.snapchat.com/spotlight/...
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            location:
              'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYdmdmanNueXd6AaF4GoeCAaF4GiqWAAAAAA?invite_id=123',
          },
        })
      );

    const resolved = await verifyNetworkSafetyAndRedirects(
      'https://snapchat.com/t/fc6R00hu'
    );
    expect(resolved.url).toBe(
      'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYdmdmanNueXd6AaF4GoeCAaF4GiqWAAAAAA'
    );
    expect(resolved.platform).toBe('snapchat');

    // Also normalizes direct @user/spotlight/<id> URLs to canonical spotlight URL
    const directUserSpotlight = await verifyNetworkSafetyAndRedirects(
      'https://www.snapchat.com/@geh.updates/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYdmdmanNueXd6AaF4GoeCAaF4GiqWAAAAAA'
    );
    expect(directUserSpotlight.url).toBe(
      'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYdmdmanNueXd6AaF4GoeCAaF4GiqWAAAAAA'
    );
    expect(directUserSpotlight.platform).toBe('snapchat');

    // Reject if /t/ link redirects to an unsupported Snapchat path (e.g. /add/friend)
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://www.snapchat.com/add/friend',
        },
      })
    );
    await expect(
      verifyNetworkSafetyAndRedirects('https://snapchat.com/t/fc6R00hu')
    ).rejects.toThrow(/Only public Snapchat Spotlight and story video links/);

    // Reject if /t/ link redirects to an internal host or SSRF target
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://10.0.0.1/admin',
        },
      })
    );
    await expect(
      verifyNetworkSafetyAndRedirects('https://snapchat.com/t/fc6R00hu')
    ).rejects.toThrow(/Local, private, and internal network destinations are forbidden/);

    fetchSpy.mockRestore();
    dnsSpy.mockRestore();
  });

  it('resolves hyphenated Snapchat Spotlight IDs from /t/UC1FHTyb share links and creator URLs', async () => {
    const dnsSpy = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '34.110.180.1', family: 4 }] as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // Step 1: snapchat.com/t/UC1FHTyb -> 301 www.snapchat.com:443/t/UC1FHTyb
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            location: 'https://www.snapchat.com:443/t/UC1FHTyb',
          },
        })
      )
      // Step 2: www.snapchat.com:443/t/UC1FHTyb -> 303 story.snapchat.com/o/...-3AAAAAQ?...
      .mockResolvedValueOnce(
        new Response(null, {
          status: 303,
          headers: {
            location:
              'https://story.snapchat.com/o/W7_EDlXWTBiXAEEniNoMPwAAYanJxeHJ5eWh0AaFAML2WAaFAMI-3AAAAAQ?invite_id=35JHzG2D&locale=en_AE&share_id=G82oAJXjR2Kggj1B-A2qaA&sid=ec9466562f63484daac8478447434551',
          },
        })
      )
      // Step 3: story.snapchat.com/o/... -> 301 www.snapchat.com/spotlight/...-3AAAAAQ?...
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            location:
              'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYanJxeHJ5eWh0AaFAML2WAaFAMI-3AAAAAQ?locale=en_AE&sid=ec9466562f63484daac8478447434551&share_id=G82oAJXjR2Kggj1B-A2qaA&invite_id=35JHzG2D',
          },
        })
      )
      // Step 4: www.snapchat.com/spotlight/... -> 301 www.snapchat.com/@styleupaven/spotlight/...-3AAAAAQ?...
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            location:
              'https://www.snapchat.com/@styleupaven/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYanJxeHJ5eWh0AaFAML2WAaFAMI-3AAAAAQ?locale=en_AE&sid=ec9466562f63484daac8478447434551&share_id=G82oAJXjR2Kggj1B-A2qaA&invite_id=35JHzG2D',
          },
        })
      );

    const resolved = await verifyNetworkSafetyAndRedirects(
      'https://snapchat.com/t/UC1FHTyb'
    );
    expect(resolved.url).toBe(
      'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYanJxeHJ5eWh0AaFAML2WAaFAMI-3AAAAAQ'
    );
    expect(resolved.platform).toBe('snapchat');

    // Also normalizes direct @creator/spotlight/<id-with-hyphens> URLs
    const directCreatorSpotlight = await verifyNetworkSafetyAndRedirects(
      'https://www.snapchat.com/@styleupaven/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYanJxeHJ5eWh0AaFAML2WAaFAMI-3AAAAAQ'
    );
    expect(directCreatorSpotlight.url).toBe(
      'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYanJxeHJ5eWh0AaFAML2WAaFAMI-3AAAAAQ'
    );
    expect(directCreatorSpotlight.platform).toBe('snapchat');

    fetchSpy.mockRestore();
    dnsSpy.mockRestore();
  });

  it('resolves Snapchat public story short links (/t/8goGbzUQ) through multi-hop story redirects', async () => {
    const dnsSpy = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '34.110.180.1', family: 4 }] as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // Step 1: snapchat.com/t/8goGbzUQ -> 301 www.snapchat.com:443/t/8goGbzUQ
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            location: 'https://www.snapchat.com:443/t/8goGbzUQ',
          },
        })
      )
      // Step 2: www.snapchat.com:443/t/8goGbzUQ -> 303 story.snapchat.com/u/ppocolee/...
      .mockResolvedValueOnce(
        new Response(null, {
          status: 303,
          headers: {
            location:
              'https://story.snapchat.com/u/ppocolee/Bw_N5xUhTu-gdSvKykP8SgAAgcmRudXV1YW9yAaF_xbgPAaF_xbQwAAAAAA?invite_id=xkkb4JW8&locale=en_AE&share_id=nMcgxfKuT8CSFtroikyapQ&sid=2c2f445e2cc14af18fe7a83d5dcc2f16',
          },
        })
      )
      // Step 3: story.snapchat.com/u/ppocolee/... -> 301 www.snapchat.com/add/ppocolee/...
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            location:
              'https://www.snapchat.com/add/ppocolee/Bw_N5xUhTu-gdSvKykP8SgAAgcmRudXV1YW9yAaF_xbgPAaF_xbQwAAAAAA?locale=en_AE&sid=2c2f445e2cc14af18fe7a83d5dcc2f16&share_id=nMcgxfKuT8CSFtroikyapQ&invite_id=xkkb4JW8',
          },
        })
      )
      // Step 4: www.snapchat.com/add/ppocolee/... -> 308 /@ppocolee/...
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: {
            location:
              '/@ppocolee/Bw_N5xUhTu-gdSvKykP8SgAAgcmRudXV1YW9yAaF_xbgPAaF_xbQwAAAAAA?locale=en_AE&sid=2c2f445e2cc14af18fe7a83d5dcc2f16&share_id=nMcgxfKuT8CSFtroikyapQ&invite_id=xkkb4JW8',
          },
        })
      );

    const resolved = await verifyNetworkSafetyAndRedirects(
      'https://snapchat.com/t/8goGbzUQ'
    );
    expect(resolved.url).toBe(
      'https://www.snapchat.com/@ppocolee/Bw_N5xUhTu-gdSvKykP8SgAAgcmRudXV1YW9yAaF_xbgPAaF_xbQwAAAAAA'
    );
    expect(resolved.platform).toBe('snapchat');

    fetchSpy.mockRestore();
    dnsSpy.mockRestore();
  });

  it('resolves fb.watch and facebook.com/share links to canonical Facebook video URLs and handles private redirects safely', async () => {
    const dnsSpy = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '157.240.241.35', family: 4 }] as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // Step 1: fb.watch/xyz123 -> 302 https://www.facebook.com/watch/?v=1195289147628387
      .mockResolvedValueOnce(
        new Response(null, {
          status: 302,
          headers: {
            location: 'https://www.facebook.com/watch/?v=1195289147628387',
          },
        })
      );

    const resolvedWatch = await verifyNetworkSafetyAndRedirects('https://fb.watch/xyz123/');
    expect(resolvedWatch.url).toBe('https://www.facebook.com/watch/?v=1195289147628387');
    expect(resolvedWatch.platform).toBe('facebook');

    // Step 2: facebook.com/share/v/xyz123 -> 302 https://web.facebook.com/reel/1195289147628387?_rdc=1&_rdr
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://web.facebook.com/reel/1195289147628387?_rdc=1&_rdr',
        },
      })
    );

    const resolvedShare = await verifyNetworkSafetyAndRedirects('https://www.facebook.com/share/v/xyz123/');
    expect(resolvedShare.url).toBe('https://web.facebook.com/reel/1195289147628387?_rdc=1&_rdr');
    expect(resolvedShare.platform).toBe('facebook');

    // Step 3: Short link redirects to /login.php -> throws 403 CONTENT_PRIVATE_OR_RESTRICTED
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://www.facebook.com/login.php?next=https%3A%2F%2Fwww.facebook.com%2Fprivate',
        },
      })
    );

    await expect(
      verifyNetworkSafetyAndRedirects('https://fb.watch/private123/')
    ).rejects.toThrow(/This Facebook video is private or requires login/);

    // Step 4: Short link redirects to SSRF private target
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://169.254.169.254/latest/meta-data',
        },
      })
    );

    await expect(
      verifyNetworkSafetyAndRedirects('https://fb.watch/malicious/')
    ).rejects.toThrow(/Local, private, and internal network destinations are forbidden/);

    fetchSpy.mockRestore();
    dnsSpy.mockRestore();
  });

  it('resolves lnkd.in short links, normalizes regional LinkedIn subdomains, and blocks authwall/SSRF redirects', async () => {
    const dnsSpy = vi
      .spyOn(dns, 'lookup')
      .mockResolvedValue([{ address: '108.174.10.10', family: 4 }] as never);
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      // Step 1: lnkd.in/dR8x9Yz -> 301 https://www.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7
      .mockResolvedValueOnce(
        new Response(null, {
          status: 301,
          headers: {
            location:
              'https://www.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7',
          },
        })
      );

    const resolvedShort = await verifyNetworkSafetyAndRedirects('https://lnkd.in/dR8x9Yz');
    expect(resolvedShort.url).toBe(
      'https://www.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7'
    );
    expect(resolvedShort.platform).toBe('linkedin');

    // Step 2: Regional subdomain uk.linkedin.com normalizes to www.linkedin.com
    const resolvedRegional = await verifyNetworkSafetyAndRedirects(
      'https://uk.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7'
    );
    expect(resolvedRegional.url).toBe(
      'https://www.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7'
    );
    expect(resolvedRegional.platform).toBe('linkedin');

    // Step 3: Short link redirects to /authwall -> throws 403 CONTENT_PRIVATE_OR_RESTRICTED
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: {
          location: 'https://www.linkedin.com/authwall?trk=bf&original_referer=',
        },
      })
    );

    await expect(
      verifyNetworkSafetyAndRedirects('https://lnkd.in/privatePost')
    ).rejects.toThrow(/This LinkedIn post is private or requires authentication/);

    // Step 4: Short link redirects to SSRF private target -> throws 400 FORBIDDEN_HOST
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: {
          location: 'https://127.0.0.1/internal',
        },
      })
    );

    await expect(
      verifyNetworkSafetyAndRedirects('https://lnkd.in/ssrfLink')
    ).rejects.toThrow(/Local, private, and internal network destinations are forbidden/);

    fetchSpy.mockRestore();
    dnsSpy.mockRestore();
  });
});

describe('Filename Sanitization & Content-Disposition', () => {
  it('produces safe portable filenames and strips unsafe characters', () => {
    expect(sanitizeFilename('My Awesome Video! #tiktok @2026', 'mp4')).toBe(
      'My-Awesome-Video-tiktok-2026.mp4'
    );
    expect(sanitizeFilename('../../../etc/passwd', 'mp4')).toBe('etc-passwd.mp4');
    expect(sanitizeFilename('', 'mp4', 'fallback-video')).toBe('fallback-video.mp4');

    const header = buildContentDisposition('Cool Clip: Test/Demo', 'mp4');
    expect(header).toContain('attachment; filename="Cool-Clip-Test-Demo.mp4"');
    expect(header).toContain("filename*=UTF-8''");
  });
});

describe('Metadata Normalization & Watermark Handling', () => {
  it('identifies watermark-free TikTok streams when clean formats exist', () => {
    const metadata = normalizeMediaMetadata(
      {
        id: '7999',
        title: 'Clean TikTok Dance',
        uploader: 'dancer',
        duration: 18.4,
        thumbnail: 'https://p16-sign.tiktokcdn.com/thumb.jpg',
        extractor_key: 'TikTok',
        formats: [
          {
            format_id: 'download',
            format_note: 'watermarked',
            ext: 'mp4',
            vcodec: 'h264',
            acodec: 'aac',
            height: 1080,
          },
          {
            format_id: 'h264_1080p',
            format_note: 'Direct video',
            ext: 'mp4',
            vcodec: 'h264',
            acodec: 'aac',
            height: 1080,
            filesize: 4_500_000,
          },
        ],
      },
      'https://www.tiktok.com/@dancer/video/7999',
      'tiktok'
    );

    expect(metadata.watermarkFreeAvailable).toBe(true);
    expect(metadata.options[0].id).toBe('nowatermark');
    expect(metadata.options[0].watermarkFree).toBe(true);
    expect(metadata.duration).toBe(18);
  });

  it('reports watermarkFreeAvailable=false when TikTok only provides watermarked formats', () => {
    const metadata = normalizeMediaMetadata(
      {
        id: '7888',
        title: 'Watermarked Only TikTok',
        formats: [
          {
            format_id: 'download',
            format_note: 'watermarked',
            ext: 'mp4',
            vcodec: 'h264',
            acodec: 'aac',
            height: 720,
          },
        ],
      },
      'https://www.tiktok.com/@dancer/video/7888',
      'tiktok'
    );

    expect(metadata.watermarkFreeAvailable).toBe(false);
    expect(metadata.options.some((o) => o.id === 'nowatermark')).toBe(false);
    expect(metadata.previewUrl).toBeNull();
  });

  it('normalizes Facebook video metadata with progressive formats and previewUrl', () => {
    const metadata = normalizeMediaMetadata(
      {
        id: '1195289147628387',
        title: 'Beast Camp Training Session',
        uploader: 'Beast Camp Training',
        duration: 9.58,
        thumbnail: 'https://scontent.xx.fbcdn.net/v/t15.5256-10/thumb.jpg',
        extractor_key: 'FacebookReel',
        formats: [
          {
            format_id: 'sd',
            format_note: 'sd',
            ext: 'mp4',
            vcodec: 'avc1.4d401f',
            acodec: 'mp4a.40.2',
            height: 480,
            url: 'https://video.xx.fbcdn.net/v/t42.1797-2/sd.mp4?token=123',
            filesize: 1_200_000,
          },
          {
            format_id: 'hd',
            format_note: 'hd',
            ext: 'mp4',
            vcodec: 'avc1.640028',
            acodec: 'mp4a.40.2',
            height: 720,
            url: 'https://video.xx.fbcdn.net/v/t42.1797-2/hd.mp4?token=123',
            filesize: 2_800_000,
          },
        ],
      },
      'https://www.facebook.com/reel/1195289147628387',
      'facebook'
    );

    expect(metadata.platform).toBe('facebook');
    expect(metadata.title).toBe('Beast Camp Training Session');
    expect(metadata.uploader).toBe('Beast Camp Training');
    expect(metadata.duration).toBe(10);
    expect(metadata.previewUrl).toBe('https://video.xx.fbcdn.net/v/t42.1797-2/hd.mp4?token=123');
    expect(metadata.options.some((o) => o.id === 'best')).toBe(true);
    expect(metadata.options.some((o) => o.id === 'hd_720p')).toBe(true);
    expect(metadata.options.some((o) => o.id === 'sd_480p')).toBe(true);
    expect(metadata.options.some((o) => o.id === 'audio')).toBe(true);
  });

  it('normalizes LinkedIn video metadata with progressive MP4 previewUrl and author fallback from title', () => {
    const metadata = normalizeMediaMetadata(
      {
        id: '7151241570371948544',
        title: 'What Is MathWorks Cloud Center? | MathWorks',
        uploader: undefined,
        thumbnail: 'https://static.licdn.com/aero-v1/sc/h/c45fy346jw096z9pbphyyhdz7',
        extractor_key: 'LinkedIn',
        formats: [
          {
            format_id: '0',
            ext: 'mp4',
            tbr: 58.062,
            protocol: 'https',
            url: 'https://dms.licdn.com/playlist/vid/v2/D5610AQFKo9M0zqY2_g/mp4-360p-30fp-crf28/0/1704988840280',
          },
          {
            format_id: '2',
            ext: 'mp4',
            tbr: 142.65,
            protocol: 'https',
            url: 'https://dms.licdn.com/playlist/vid/v2/D5610AQFKo9M0zqY2_g/mp4-720p-30fp-crf28/0/1704988854139',
          },
        ],
      },
      'https://www.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7',
      'linkedin'
    );

    expect(metadata.platform).toBe('linkedin');
    expect(metadata.title).toBe('What Is MathWorks Cloud Center? | MathWorks');
    expect(metadata.uploader).toBe('MathWorks');
    expect(metadata.previewUrl).toBe(
      'https://dms.licdn.com/playlist/vid/v2/D5610AQFKo9M0zqY2_g/mp4-720p-30fp-crf28/0/1704988854139'
    );
    expect(metadata.options.some((o) => o.id === 'best')).toBe(true);
    expect(metadata.options.some((o) => o.id === 'audio')).toBe(true);
  });

  it('populates previewUrl for cookie-free progressive HTTPS MP4 streams (X, Instagram, Direct) and omits it when cookies are required', () => {
    const xMetadata = normalizeMediaMetadata(
      {
        id: '1349794411333394432',
        title: 'Nets Highlight',
        formats: [
          {
            format_id: 'hls-720',
            ext: 'mp4',
            protocol: 'm3u8_native',
            vcodec: 'avc1.64001f',
            acodec: 'mp4a.40.2',
            height: 720,
            url: 'https://video.twimg.com/ext_tw_video/1349794411333394432/pu/pl/720x1280/playlist.m3u8',
          },
          {
            format_id: 'http-832',
            ext: 'mp4',
            protocol: 'https',
            vcodec: 'avc1.64001f',
            acodec: 'mp4a.40.2',
            height: 720,
            url: 'https://video.twimg.com/ext_tw_video/1349794411333394432/pu/vid/720x1280/clip.mp4',
          },
        ],
      },
      'https://x.com/BrooklynNets/status/1349794411333394432',
      'x'
    );

    expect(xMetadata.previewUrl).toBe(
      'https://video.twimg.com/ext_tw_video/1349794411333394432/pu/vid/720x1280/clip.mp4'
    );

    const cookieBoundMetadata = normalizeMediaMetadata(
      {
        id: '999',
        title: 'Cookie Bound Stream',
        formats: [
          {
            format_id: 'mp4-720',
            ext: 'mp4',
            protocol: 'https',
            vcodec: 'h264',
            acodec: 'aac',
            height: 720,
            url: 'https://scontent.cdninstagram.com/v/clip.mp4',
            cookies: 'sessionid=secret',
          },
        ],
      },
      'https://www.instagram.com/reel/C1234567890/',
      'instagram'
    );

    expect(cookieBoundMetadata.previewUrl).toBeNull();

    // SnapchatSpotlight returns top-level url + ext="mp4" with formats omitted
    const snapchatMetadata = normalizeMediaMetadata(
      {
        id: 'W7_EDlXWTBiXAEEniNoMPwAAYYWtidGhudGZpAX1TKn0JAX1TKnXJAAAAAA',
        title: 'Views 💕',
        uploader: 'shreypatel57',
        duration: 4.665,
        ext: 'mp4',
        url: 'https://cf-st.sc-cdn.net/d/kKJHIR1QAznRKK9jgYYDq.27.IRZXSOY?mo=123',
        thumbnail: 'https://cf-st.sc-cdn.net/d/kKJHIR1QAznRKK9jgYYDq.256.IRZXSOY',
        extractor_key: 'SnapchatSpotlight',
      },
      'https://www.snapchat.com/spotlight/W7_EDlXWTBiXAEEniNoMPwAAYYWtidGhudGZpAX1TKn0JAX1TKnXJAAAAAA',
      'snapchat'
    );

    expect(snapchatMetadata.platform).toBe('snapchat');
    expect(snapchatMetadata.extractor).toBe('SnapchatSpotlight');
    expect(snapchatMetadata.duration).toBe(5);
    expect(snapchatMetadata.previewUrl).toBe(
      'https://cf-st.sc-cdn.net/d/kKJHIR1QAznRKK9jgYYDq.27.IRZXSOY?mo=123'
    );
    expect(snapchatMetadata.options[0]?.id).toBe('best');

    // Snapchat public story snap with playlist entries (e.g., HTML5 embeds via GenericIE)
    const snapchatStoryMetadata = normalizeMediaMetadata(
      {
        id: 'Bw_N5xUhTu-gdSvKykP8SgAAgcmRudXV1YW9yAaF_xbgPAaF_xbQwAAAAAA',
        title: 'View this Snap from Pocolee21 on Snapchat!',
        _type: 'playlist',
        entries: [
          {
            id: 'snap-1',
            ext: 'IRZXSOY',
            url: 'https://cf-st.sc-cdn.net/d/aGdezCaPOqbACymJZ9jZg.1034.IRZXSOY',
          },
          {
            id: 'snap-2',
            ext: 'mp4',
            title: 'View this Snap from Pocolee21 on Snapchat! (3)',
            url: 'https://cf-st.sc-cdn.net/d/SotjL8VTn7RhMXtA3RHgn.1034.IRZXSOY?mo=123',
            formats: [
              {
                format_id: '0',
                ext: 'mp4',
                url: 'https://cf-st.sc-cdn.net/d/SotjL8VTn7RhMXtA3RHgn.1034.IRZXSOY?mo=123',
                vcodec: 'h264',
                acodec: 'aac',
                height: 720,
              },
            ],
          },
        ],
      },
      'https://www.snapchat.com/@ppocolee/Bw_N5xUhTu-gdSvKykP8SgAAgcmRudXV1YW9yAaF_xbgPAaF_xbQwAAAAAA',
      'snapchat'
    );

    expect(snapchatStoryMetadata.platform).toBe('snapchat');
    expect(snapchatStoryMetadata.uploader).toBe('ppocolee');
    expect(snapchatStoryMetadata.previewUrl).toBe(
      'https://cf-st.sc-cdn.net/d/SotjL8VTn7RhMXtA3RHgn.1034.IRZXSOY?mo=123'
    );
    expect(snapchatStoryMetadata.options[0]?.id).toBe('best');
  });
});

describe('Express API Endpoints', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(dns, 'lookup').mockResolvedValue([
      { address: '23.212.251.16', family: 4 },
    ] as never);
  });

  it('GET /api/health returns service health and yt-dlp status', async () => {
    vi.spyOn(ytdlpAdapter, 'getYtDlpVersion').mockResolvedValue('2026.10.26');

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.ytdlpVersion).toBe('2026.10.26');
    expect(res.body.extractor.engine).toBe('yt-dlp');
    expect(res.body.extractor.available).toBe(true);
    expect(res.body.extractor.version).toBe('2026.10.26');
  });

  it('POST /api/info validates request body and returns normalized metadata', async () => {
    vi.spyOn(ytdlpAdapter, 'extractMediaInfo').mockResolvedValue({
      id: '12345',
      title: 'SpaceX Starship Launch',
      uploader: 'SpaceX',
      duration: 45,
      thumbnail: 'https://pbs.twimg.com/media/thumb.jpg',
      extractor_key: 'Twitter',
      formats: [
        {
          format_id: 'http-1080',
          ext: 'mp4',
          vcodec: 'h264',
          acodec: 'aac',
          height: 1080,
          filesize: 8_200_000,
        },
      ],
    });

    const res = await request(app)
      .post('/api/info')
      .send({ url: 'https://x.com/SpaceX/status/12345' });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.title).toBe('SpaceX Starship Launch');
    expect(res.body.data.platform).toBe('x');
    expect(res.body.data.duration).toBe(45);
    expect(res.body.data.options.length).toBeGreaterThan(0);
  });

  it('POST /api/info extracts and normalizes vm.tiktok.com short-link metadata with nowatermark option', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 301,
        headers: {
          location:
            'https://www.tiktok.com/@cchhaaee111/video/7700645303124282631?_r=1&_t=ZN-9AwBQQJlb0A',
        },
      })
    );

    vi.spyOn(ytdlpAdapter, 'extractMediaInfo').mockResolvedValue({
      id: '7700645303124282631',
      title: 'BoNjOuR',
      uploader: 'CHAE',
      uploader_id: 'cchhaaee111',
      duration: 15,
      thumbnail: 'https://p16-common-sign.tiktokcdn-eu.com/tos-no1a-p-0037-no/thumb.jpg',
      webpage_url: 'https://www.tiktok.com/@cchhaaee111/video/7700645303124282631',
      extractor_key: 'TikTok',
      formats: [
        {
          format_id: 'download',
          format_note: 'watermarked',
          ext: 'mp4',
          vcodec: 'h264',
          acodec: 'aac',
          width: 576,
          height: 1024,
          filesize: 1_952_548,
        },
        {
          format_id: 'h264_540p_1469362-0',
          format_note: 'Direct video',
          ext: 'mp4',
          vcodec: 'h264',
          acodec: 'aac',
          width: 576,
          height: 1024,
          filesize: 2_690_580,
        },
      ],
    });

    const res = await request(app)
      .post('/api/info')
      .send({ url: 'https://vm.tiktok.com/ZN8U27FNg/' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: '7700645303124282631',
      title: 'BoNjOuR',
      platform: 'tiktok',
      extractor: 'TikTok',
      watermarkFreeAvailable: true,
      resolvedUrl: 'https://www.tiktok.com/@cchhaaee111/video/7700645303124282631',
    });
    expect(
      res.body.data.options.some(
        (opt: { id: string; watermarkFree: boolean }) =>
          opt.id === 'nowatermark' && opt.watermarkFree === true
      )
    ).toBe(true);
  });

  it('POST /api/info rejects invalid or unsupported URLs with 400', async () => {
    const emptyRes = await request(app).post('/api/info').send({});
    expect(emptyRes.status).toBe(400);
    expect(emptyRes.body.error.code).toBe('VALIDATION_ERROR');

    const unsafeRes = await request(app)
      .post('/api/info')
      .send({ url: 'http://127.0.0.1:8080/internal.mp4' });
    expect(unsafeRes.status).toBe(400);
  });

  it('POST /api/info returns clean error responses when extraction fails', async () => {
    vi.spyOn(ytdlpAdapter, 'extractMediaInfo').mockRejectedValue(
      new AppError(
        'This content is private or requires platform authentication and cannot be downloaded.',
        403,
        'CONTENT_PRIVATE_OR_RESTRICTED'
      )
    );

    const res = await request(app)
      .post('/api/info')
      .send({ url: 'https://www.instagram.com/reel/Cprivate123/' });

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CONTENT_PRIVATE_OR_RESTRICTED');
    expect(res.body.error.message).toContain('private');
  });

  it('GET /api/download streams media with safe Content-Disposition and Content-Type headers', async () => {
    const mockStream = new PassThrough();
    const cleanupSpy = vi.fn();

    vi.spyOn(ytdlpAdapter, 'createMediaDownloadStream').mockImplementation(
      async () => {
        setImmediate(() => {
          mockStream.write(Buffer.from('fake-mp4-binary-payload'));
          mockStream.end();
        });
        return {
          stream: mockStream,
          process: { killed: false, exitCode: 0 } as unknown as ChildProcess,
          contentType: 'video/mp4',
          extension: 'mp4',
          cleanup: cleanupSpy,
        };
      }
    );

    const res = await request(app)
      .get('/api/download')
      .query({
        url: 'https://www.tiktok.com/@creator/video/7123456789',
        option: 'nowatermark',
        title: 'Test TikTok Clip',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('video/mp4');
    expect(res.headers['content-disposition']).toContain(
      'filename="Test-TikTok-Clip.mp4"'
    );
    expect(Buffer.from(res.body).toString('utf8')).toBe('fake-mp4-binary-payload');
    expect(cleanupSpy).toHaveBeenCalled();
  });

  it('GET /api/download returns HTTP error if extraction fails before streaming begins', async () => {
    vi.spyOn(ytdlpAdapter, 'createMediaDownloadStream').mockRejectedValue(
      new AppError('Media could not be found.', 404, 'MEDIA_NOT_FOUND')
    );

    const res = await request(app).get('/api/download').query({
      url: 'https://x.com/user/status/999999999',
      option: 'best',
    });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('MEDIA_NOT_FOUND');
  });

  it('POST /api/info handles Facebook video URLs and returns complete metadata', async () => {
    vi.spyOn(ytdlpAdapter, 'extractMediaInfo').mockResolvedValue({
      id: '1195289147628387',
      title: 'Beast Camp Training Reel',
      uploader: 'Beast Camp Training',
      duration: 10,
      thumbnail: 'https://scontent.xx.fbcdn.net/v/thumb.jpg',
      extractor_key: 'FacebookReel',
      formats: [
        {
          format_id: 'hd',
          ext: 'mp4',
          vcodec: 'avc1.640028',
          acodec: 'mp4a.40.2',
          height: 720,
          url: 'https://video.xx.fbcdn.net/v/hd.mp4',
          filesize: 2_500_000,
        },
      ],
    });

    const res = await request(app)
      .post('/api/info')
      .send({ url: 'https://www.facebook.com/reel/1195289147628387' });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: '1195289147628387',
      title: 'Beast Camp Training Reel',
      uploader: 'Beast Camp Training',
      platform: 'facebook',
      extractor: 'FacebookReel',
    });
    expect(res.body.data.options.length).toBeGreaterThan(0);
  });

  it('GET /api/download streams Facebook video successfully with correct Content-Disposition', async () => {
    const mockStream = new PassThrough();
    const cleanupSpy = vi.fn();

    vi.spyOn(ytdlpAdapter, 'createMediaDownloadStream').mockImplementation(
      async () => {
        setImmediate(() => {
          mockStream.write(Buffer.from('fake-facebook-binary-payload'));
          mockStream.end();
        });
        return {
          stream: mockStream,
          process: { killed: false, exitCode: 0 } as unknown as ChildProcess,
          contentType: 'video/mp4',
          extension: 'mp4',
          cleanup: cleanupSpy,
        };
      }
    );

    const res = await request(app)
      .get('/api/download')
      .query({
        url: 'https://www.facebook.com/reel/1195289147628387',
        option: 'best',
        title: 'Facebook Beast Reel',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('video/mp4');
    expect(res.headers['content-disposition']).toContain(
      'filename="Facebook-Beast-Reel.mp4"'
    );
    expect(Buffer.from(res.body).toString('utf8')).toBe('fake-facebook-binary-payload');
    expect(cleanupSpy).toHaveBeenCalled();
  });

  it('POST /api/info handles LinkedIn video URLs and returns complete metadata', async () => {
    vi.spyOn(ytdlpAdapter, 'extractMediaInfo').mockResolvedValue({
      id: '7151241570371948544',
      title: 'What Is MathWorks Cloud Center? | MathWorks',
      thumbnail: 'https://static.licdn.com/aero-v1/sc/h/c45fy346jw096z9pbphyyhdz7',
      extractor_key: 'LinkedIn',
      formats: [
        {
          format_id: '2',
          ext: 'mp4',
          tbr: 142.65,
          protocol: 'https',
          url: 'https://dms.licdn.com/playlist/vid/v2/D5610AQFKo9M0zqY2_g/mp4-720p-30fp-crf28/0/1704988854139',
        },
      ],
    });

    const res = await request(app)
      .post('/api/info')
      .send({
        url: 'https://www.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7',
      });

    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: '7151241570371948544',
      title: 'What Is MathWorks Cloud Center? | MathWorks',
      uploader: 'MathWorks',
      platform: 'linkedin',
      extractor: 'LinkedIn',
    });
    expect(res.body.data.options.length).toBeGreaterThan(0);
  });

  it('GET /api/download streams LinkedIn video successfully with correct Content-Disposition', async () => {
    const mockStream = new PassThrough();
    const cleanupSpy = vi.fn();

    vi.spyOn(ytdlpAdapter, 'createMediaDownloadStream').mockImplementation(
      async () => {
        setImmediate(() => {
          mockStream.write(Buffer.from('fake-linkedin-binary-payload'));
          mockStream.end();
        });
        return {
          stream: mockStream,
          process: { killed: false, exitCode: 0 } as unknown as ChildProcess,
          contentType: 'video/mp4',
          extension: 'mp4',
          cleanup: cleanupSpy,
        };
      }
    );

    const res = await request(app)
      .get('/api/download')
      .query({
        url: 'https://www.linkedin.com/posts/the-mathworks_2_what-is-mathworks-cloud-center-activity-7151241570371948544-4Gu7',
        option: 'best',
        title: 'MathWorks Cloud Center',
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('video/mp4');
    expect(res.headers['content-disposition']).toContain(
      'filename="MathWorks-Cloud-Center.mp4"'
    );
    expect(Buffer.from(res.body).toString('utf8')).toBe('fake-linkedin-binary-payload');
    expect(cleanupSpy).toHaveBeenCalled();
  });

  it('maps LinkedIn "Unable to extract video" stderr to 404 MEDIA_NOT_FOUND', () => {
    const mapped = ytdlpAdapter.mapExtractorStderrToAppError(
      'ERROR: [LinkedIn] 6850898786781339649: Unable to extract video; please report this issue'
    );
    expect(mapped.statusCode).toBe(404);
    expect(mapped.code).toBe('MEDIA_NOT_FOUND');
  });

  it('terminates child processes cleanly when terminateChildProcess is called', () => {
    const killMock = vi.fn().mockReturnValue(true);
    const fakeProcess = {
      killed: false,
      exitCode: null,
      kill: killMock,
    } as unknown as ChildProcess;

    ytdlpAdapter.terminateChildProcess(fakeProcess);
    expect(killMock).toHaveBeenCalledWith('SIGTERM');
  });
});

describe('CORS Multi-Origin Configuration', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(ytdlpAdapter, 'getYtDlpVersion').mockResolvedValue('2026.10.26');
  });

  it('parses comma-separated origins, trims whitespace, removes empty values, and rejects wildcard "*"', () => {
    const parsed = parseAllowedOrigins(
      '  http://localhost:5173 , , https://downloader.pxxlspace.cv/ , * ,  '
    );
    expect(parsed).toEqual([
      'http://localhost:5173',
      'https://downloader.pxxlspace.cv',
    ]);

    const defaults = parseAllowedOrigins('');
    expect(defaults).toEqual([
      'http://localhost:5173',
      'https://downloader.pxxlspace.cv',
    ]);
  });

  it('allows requests from both http://localhost:5173 and https://downloader.pxxlspace.cv', async () => {
    const multiOriginApp = createApp(
      ' http://localhost:5173 , https://downloader.pxxlspace.cv '
    );

    const localRes = await request(multiOriginApp)
      .get('/api/health')
      .set('Origin', 'http://localhost:5173');

    expect(localRes.status).toBe(200);
    expect(localRes.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173'
    );

    const prodRes = await request(multiOriginApp)
      .get('/api/health')
      .set('Origin', 'https://downloader.pxxlspace.cv');

    expect(prodRes.status).toBe(200);
    expect(prodRes.headers['access-control-allow-origin']).toBe(
      'https://downloader.pxxlspace.cv'
    );
  });

  it('allows non-browser requests without an Origin header (e.g. curl or server-to-server)', async () => {
    const multiOriginApp = createApp(
      'http://localhost:5173,https://downloader.pxxlspace.cv'
    );

    const res = await request(multiOriginApp).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('rejects unlisted browser origins with 403 CORS_NOT_ALLOWED', async () => {
    const multiOriginApp = createApp(
      'http://localhost:5173,https://downloader.pxxlspace.cv'
    );

    const res = await request(multiOriginApp)
      .get('/api/health')
      .set('Origin', 'https://untrusted-site.example.com');

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CORS_NOT_ALLOWED');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

