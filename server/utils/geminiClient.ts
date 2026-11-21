import { GoogleGenAI } from '@google/genai';
import { AppError, RateLimitError } from './apiResponse';

let cachedClient: GoogleGenAI | null = null;
let cachedKeySignature = '';

/**
 * Returns a shared server-side GoogleGenAI client.
 * Reads GEMINI_API_KEY strictly from process.env and sets the required User-Agent header.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey) {
    throw new AppError(
      'AI service is not configured. Please verify GEMINI_API_KEY in Settings > Secrets.',
      503,
      'AI_KEY_MISSING'
    );
  }

  if (!cachedClient || cachedKeySignature !== apiKey) {
    cachedClient = new GoogleGenAI({
      apiKey,
      apiVersion: 'v1beta',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedKeySignature = apiKey;
  }

  return cachedClient;
}

/**
 * Simple in-memory per-IP sliding window rate limiter for AI endpoints.
 */
const aiRateBuckets = new Map<string, number[]>();

export function assertAiRateLimit(ipKey: string, maxRequests = 24, windowMs = 60_000): void {
  const now = Date.now();
  const windowStart = now - windowMs;
  const timestamps = (aiRateBuckets.get(ipKey) || []).filter((ts) => ts > windowStart);

  if (timestamps.length >= maxRequests) {
    const oldest = timestamps[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    throw new RateLimitError(
      `AI request limit reached. Please wait ${retryAfterSec} seconds before trying again.`,
      retryAfterSec
    );
  }

  timestamps.push(now);
  aiRateBuckets.set(ipKey, timestamps);

  // Prevent unbounded memory growth across long server uptimes
  if (aiRateBuckets.size > 2000) {
    for (const [key, list] of aiRateBuckets.entries()) {
      const recent = list.filter((ts) => ts > windowStart);
      if (recent.length === 0) aiRateBuckets.delete(key);
      else aiRateBuckets.set(key, recent);
    }
  }
}

/**
 * Extracts a clean human-readable message if the SDK wrapped a JSON error payload.
 */
function extractReadableErrorMessage(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: { message?: string }; message?: string };
      const inner = parsed.error?.message || parsed.message;
      if (typeof inner === 'string' && inner.trim().length > 0) {
        return extractReadableErrorMessage(inner);
      }
    } catch {
      // Fall through to raw string
    }
  }
  return trimmed;
}

/**
 * Translates upstream Gemini API errors into clear, actionable AppErrors without masking failures.
 */
export function mapGeminiError(err: unknown): AppError {
  if (err instanceof AppError) return err;

  const rawMessage = err instanceof Error ? err.message : String(err ?? 'Unknown AI error');
  const cleanMessage = extractReadableErrorMessage(rawMessage);
  const upper = `${rawMessage} ${cleanMessage}`.toUpperCase();

  if (
    upper.includes('API_KEY_INVALID') ||
    upper.includes('PERMISSION_DENIED') ||
    upper.includes('403')
  ) {
    return new AppError(
      'Unable to authenticate with the AI service. Please check your API key in Settings > Secrets.',
      403,
      'AI_AUTH_ERROR'
    );
  }

  if (upper.includes('RESOURCE_EXHAUSTED') || upper.includes('429') || upper.includes('QUOTA')) {
    return new AppError(
      'AI request quota has been temporarily reached. Please wait a moment or check your billing tier in Settings > Secrets.',
      429,
      'AI_QUOTA_EXCEEDED'
    );
  }

  if (
    upper.includes('UNAVAILABLE') ||
    upper.includes('503') ||
    upper.includes('HIGH DEMAND') ||
    upper.includes('OVERLOADED')
  ) {
    return new AppError(
      'The AI service is temporarily experiencing high demand. Please wait a few seconds and try again.',
      503,
      'AI_SERVICE_BUSY'
    );
  }

  if (upper.includes('NOT_FOUND') || upper.includes('404')) {
    return new AppError(
      'The requested AI model is currently unavailable. Please try again shortly.',
      502,
      'AI_MODEL_UNAVAILABLE'
    );
  }

  return new AppError(
    cleanMessage || 'The AI service encountered an unexpected error. Please try again.',
    502,
    'AI_UPSTREAM_ERROR'
  );
}

/**
 * Runs a primary Gemini model call with a bounded timeout; if the primary model experiences
 * a transient 503/UNAVAILABLE demand spike or timeout, transparently falls back to the
 * secondary Gemini model (never fabricating fake responses — real errors still propagate).
 */
export async function withModelFallback<T>(
  primaryModel: string,
  fallbackModel: string,
  operation: (model: string, abortSignal?: AbortSignal) => Promise<T>,
  primaryTimeoutMs = 12_000
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), primaryTimeoutMs);

  try {
    return await operation(primaryModel, controller.signal);
  } catch (err) {
    const raw = (err instanceof Error ? err.message : String(err ?? '')).toUpperCase();
    const isTransient =
      controller.signal.aborted ||
      raw.includes('UNAVAILABLE') ||
      raw.includes('503') ||
      raw.includes('HIGH DEMAND') ||
      raw.includes('OVERLOADED') ||
      raw.includes('ABORT') ||
      raw.includes('TIMEOUT');

    if (!isTransient || primaryModel === fallbackModel) {
      throw err;
    }

    return await operation(fallbackModel);
  } finally {
    clearTimeout(timer);
  }
}
