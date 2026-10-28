import cors from 'cors';
import express, { type Express } from 'express';
import { errorHandler, notFoundHandler } from './middleware/error.middleware.js';
import { createDownloadRouter } from './routes/download.routes.js';
import { AppError } from './types/downloader.js';

export const DEFAULT_CLIENT_ORIGINS =
  'http://localhost:5173,https://downloader.pxxlspace.cv';

/**
 * Parses a comma-separated CLIENT_ORIGIN string into a normalized allowlist of origins.
 * Trims whitespace, strips trailing slashes, removes empty entries, and never allows "*".
 */
export function parseAllowedOrigins(rawOrigins?: string): string[] {
  const source =
    rawOrigins && rawOrigins.trim().length > 0
      ? rawOrigins
      : DEFAULT_CLIENT_ORIGINS;

  return source
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter((origin) => origin.length > 0 && origin !== '*');
}

export function createApp(customClientOrigin?: string): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  const allowedOrigins = parseAllowedOrigins(
    customClientOrigin ?? process.env.CLIENT_ORIGIN
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow non-browser requests (e.g. curl, health checks, server-to-server) without an Origin header
        if (!origin) {
          callback(null, true);
          return;
        }

        const normalizedOrigin = origin.trim().replace(/\/+$/, '');
        if (allowedOrigins.includes(normalizedOrigin)) {
          callback(null, true);
          return;
        }

        callback(
          new AppError(
            'Cross-origin request blocked by CORS policy.',
            403,
            'CORS_NOT_ALLOWED'
          )
        );
      },
      methods: ['GET', 'POST', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Accept'],
      exposedHeaders: ['Content-Disposition', 'Content-Length', 'Content-Type'],
    })
  );

  // Small JSON request-body limit
  app.use(express.json({ limit: '16kb' }));

  app.use('/api', createDownloadRouter());

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

export const app = createApp();
