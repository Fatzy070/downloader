import type { ChildProcess } from 'node:child_process';
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

    const directMp4 = validateAndClassifyUrl(
      'https://cdn.example.org/media/sample-clip.mp4'
    );
    expect(directMp4.platform).toBe('direct');
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
  });
});

describe('Express API Endpoints', () => {
  const app = createApp();

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('GET /api/health returns service health and yt-dlp status', async () => {
    vi.spyOn(ytdlpAdapter, 'getYtDlpVersion').mockResolvedValue('2026.10.26');

    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
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

