import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  getHealth,
  getMediaDownload,
  postMediaInfo,
} from '../controllers/download.controller.js';
import {
  validateBody,
  validateQuery,
} from '../middleware/validate-request.middleware.js';
import {
  downloadQuerySchema,
  infoRequestSchema,
} from '../validators/download.validator.js';

export function createDownloadRouter(): Router {
  const router = Router();

  const windowMs = Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000;
  const maxRequests = Number(process.env.RATE_LIMIT_MAX_REQUESTS) || 20;

  const extractionRateLimiter = rateLimit({
    windowMs,
    max: maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many extraction or download requests. Please wait a moment and try again.',
      },
    },
  });

  router.get('/health', getHealth);

  router.post(
    '/info',
    extractionRateLimiter,
    validateBody(infoRequestSchema),
    postMediaInfo
  );

  router.get(
    '/download',
    extractionRateLimiter,
    validateQuery(downloadQuerySchema),
    getMediaDownload
  );

  return router;
}
