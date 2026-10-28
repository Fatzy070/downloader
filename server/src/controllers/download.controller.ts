import type { Request, Response, NextFunction } from 'express';
import { getYtDlpVersion } from '../adapters/ytdlp.adapter.js';
import { initiateMediaDownload } from '../services/downloader.service.js';
import { getMediaInfoForUrl } from '../services/media-info.service.js';
import { buildContentDisposition } from '../utils/filename.js';
import type { DownloadQueryInput, InfoRequestInput } from '../validators/download.validator.js';

export async function getHealth(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const ytdlpVersion = await getYtDlpVersion();
    res.status(200).json({
      status: 'ok',
      service: 'universal-video-downloader-api',
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime()),
      extractor: {
        engine: 'yt-dlp',
        available: Boolean(ytdlpVersion),
        version: ytdlpVersion,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function postMediaInfo(
  req: Request<unknown, unknown, InfoRequestInput>,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { url } = req.body;
    const metadata = await getMediaInfoForUrl(url);
    res.status(200).json({ data: metadata });
  } catch (err) {
    next(err);
  }
}

export async function getMediaDownload(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const query = (res.locals.validatedQuery ?? req.query) as DownloadQueryInput;
  let clientClosed = false;
  let cleanupFn: (() => void) | null = null;

  const onClientClose = () => {
    clientClosed = true;
    if (cleanupFn) {
      cleanupFn();
    }
  };

  req.on('close', onClientClose);

  try {
    const handle = await initiateMediaDownload({
      url: query.url,
      option: query.option ?? 'best',
      title: query.title,
    });

    cleanupFn = handle.cleanup;

    if (clientClosed) {
      handle.cleanup();
      return;
    }

    res.setHeader('Content-Type', handle.contentType);
    res.setHeader(
      'Content-Disposition',
      buildContentDisposition(handle.suggestedTitle, handle.extension)
    );
    res.setHeader('Cache-Control', 'no-store, no-transform');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    handle.stream.on('error', (streamErr) => {
      if (process.env.NODE_ENV !== 'test') {
        console.error(
          '[DownloadStreamError]',
          streamErr instanceof Error ? streamErr.message : 'Stream terminated early'
        );
      }
      handle.cleanup();
      if (!res.headersSent) {
        next(streamErr);
      } else {
        res.end();
      }
    });

    res.on('close', () => {
      handle.cleanup();
    });

    handle.stream.pipe(res);
  } catch (err) {
    req.off('close', onClientClose);
    if (!clientClosed) {
      next(err);
    }
  }
}
