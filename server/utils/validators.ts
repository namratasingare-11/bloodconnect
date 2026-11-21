import { ValidationError } from './apiResponse';

export const VALID_BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;
export const VALID_ROLES = ['donor', 'hospital', 'staff', 'admin'] as const;
export const VALID_REQUEST_STATUSES = [
  'Pending',
  'Under Review',
  'In Cross-Match',
  'Approved',
  'Partially Fulfilled',
  'Fulfilled',
  'Rejected',
  'Cancelled',
] as const;
export const VALID_APPOINTMENT_STATUSES = [
  'Scheduled',
  'Checked In',
  'Completed',
  'Cancelled',
] as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidBloodGroup(value: unknown): value is (typeof VALID_BLOOD_GROUPS)[number] {
  return typeof value === 'string' && (VALID_BLOOD_GROUPS as readonly string[]).includes(value);
}

export function isValidRole(value: unknown): value is (typeof VALID_ROLES)[number] {
  return typeof value === 'string' && (VALID_ROLES as readonly string[]).includes(value);
}

export function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_RE.test(value.trim());
}

export function sanitizeNonEmptyString(value: unknown, maxLen = 255): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, maxLen);
}

export function parsePositiveInt(value: unknown, fallback: number, max = 10000): number {
  const num = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(num) || num < 1) return fallback;
  return Math.min(num, max);
}

export interface DbConfigInput {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  uri?: string;
}

export function extractDbConfigInput(body: Record<string, unknown> | undefined): DbConfigInput | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const { host, port, user, password, database, ssl, uri } = body;

  const hasAny =
    host !== undefined ||
    port !== undefined ||
    user !== undefined ||
    password !== undefined ||
    database !== undefined ||
    ssl !== undefined ||
    uri !== undefined;

  if (!hasAny) return undefined;

  const parsedPort = port !== undefined && port !== '' ? Number.parseInt(String(port), 10) : undefined;
  if (parsedPort !== undefined && (!Number.isFinite(parsedPort) || parsedPort < 1 || parsedPort > 65535)) {
    throw new ValidationError('Invalid MySQL port number', { port: 'Port must be between 1 and 65535' });
  }

  return {
    host: typeof host === 'string' && host.trim() ? host.trim() : undefined,
    port: parsedPort,
    user: typeof user === 'string' && user.trim() ? user.trim() : undefined,
    password: typeof password === 'string' ? password : undefined,
    database: typeof database === 'string' && database.trim() ? database.trim() : undefined,
    ssl: ssl !== undefined ? Boolean(ssl) : undefined,
    uri: typeof uri === 'string' && uri.trim() ? uri.trim() : undefined,
  };
}
