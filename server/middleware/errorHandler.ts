import { Request, Response, NextFunction } from 'express';
import { AppError, RateLimitError } from '../utils/apiResponse';
import { env } from '../config/env';

export function apiNotFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    code: 'ROUTE_NOT_FOUND',
    message: `API route not found: ${req.method} ${req.originalUrl}`,
    timestamp: new Date().toISOString(),
  });
}

export function errorHandler(
  err: Error | AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (res.headersSent) {
    return;
  }

  if (err instanceof RateLimitError && err.retryAfterSec) {
    res.setHeader('Retry-After', String(err.retryAfterSec));
  }

  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      success: false,
      code: err.code,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
      timestamp: new Date().toISOString(),
    });
  }

  // Handle malformed JSON body from express.json()
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_JSON',
      message: 'Malformed JSON in request body',
      timestamp: new Date().toISOString(),
    });
  }

  console.error('[API Error]', err);

  return res.status(500).json({
    success: false,
    code: 'INTERNAL_SERVER_ERROR',
    message: env.nodeEnv === 'production' ? 'Internal server error' : err.message || 'Internal server error',
    timestamp: new Date().toISOString(),
  });
}
