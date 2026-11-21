import { Request, Response, NextFunction } from 'express';

/**
 * Lightweight structured logger for /api/* requests with response status and latency.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    console.log(
      `[API] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${durationMs}ms)`
    );
  });
  next();
}
