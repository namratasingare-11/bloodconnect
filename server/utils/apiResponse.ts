import { Response } from 'express';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: Record<string, string[] | string>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    details?: Record<string, string[] | string>
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: Record<string, string[] | string>) {
    super(message, 400, 'VALIDATION_ERROR', details);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed', code = 'AUTHENTICATION_ERROR') {
    super(message, 401, code);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends AppError {
  constructor(message = 'You do not have permission to perform this action', code = 'FORBIDDEN') {
    super(message, 403, code);
    this.name = 'AuthorizationError';
  }
}

export class RateLimitError extends AppError {
  public readonly retryAfterSec?: number;

  constructor(message = 'Too many attempts. Please try again later.', retryAfterSec?: number) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', retryAfterSec ? { retryAfterSec: String(retryAfterSec) } : undefined);
    this.name = 'RateLimitError';
    this.retryAfterSec = retryAfterSec;
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT_ERROR');
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export function isDatabaseOfflineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    msg.includes('ECONNREFUSED') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('EHOSTUNREACH') ||
    msg.includes('PROTOCOL_CONNECTION_LOST')
  );
}

export function sendSuccess<T extends Record<string, unknown>>(
  res: Response,
  payload: T,
  statusCode = 200
) {
  return res.status(statusCode).json({
    success: true,
    timestamp: new Date().toISOString(),
    ...payload,
  });
}

export function sendCreated<T extends Record<string, unknown>>(
  res: Response,
  payload: T
) {
  return sendSuccess(res, payload, 201);
}
