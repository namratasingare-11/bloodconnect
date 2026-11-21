import 'dotenv/config';

export interface EnvConfig {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  appUrl: string;
  security: {
    sessionTtlHours: number;
    rememberMeTtlDays: number;
    maxLoginAttempts: number;
    lockoutWindowMinutes: number;
    passwordResetTtlMinutes: number;
    emailVerificationTtlHours: number;
  };
  smtp: {
    host: string;
    port: number;
    user: string;
    from: string;
    configured: boolean;
  };
  db: {
    uri: string;
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
    connectionLimit: number;
    connectTimeoutMs: number;
  };
}

function parseIntSafe(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBool(value: string | undefined, fallback = false): boolean {
  if (value === undefined) return fallback;
  return value.toLowerCase() === 'true' || value === '1';
}

export function loadEnv(): EnvConfig {
  const rawNodeEnv = process.env.NODE_ENV || 'development';
  const nodeEnv: EnvConfig['nodeEnv'] =
    rawNodeEnv === 'production' || rawNodeEnv === 'test' ? rawNodeEnv : 'development';

  const smtpHost = process.env.SMTP_HOST || '';

  return {
    nodeEnv,
    port: parseIntSafe(process.env.PORT, 3000),
    appUrl: process.env.APP_URL || 'http://localhost:3000',
    security: {
      sessionTtlHours: parseIntSafe(process.env.SESSION_TTL_HOURS, 24),
      rememberMeTtlDays: parseIntSafe(process.env.REMEMBER_ME_TTL_DAYS, 14),
      maxLoginAttempts: parseIntSafe(process.env.MAX_LOGIN_ATTEMPTS, 5),
      lockoutWindowMinutes: parseIntSafe(process.env.LOCKOUT_WINDOW_MINUTES, 15),
      passwordResetTtlMinutes: parseIntSafe(process.env.PASSWORD_RESET_TTL_MINUTES, 30),
      emailVerificationTtlHours: parseIntSafe(process.env.EMAIL_VERIFICATION_TTL_HOURS, 24),
    },
    smtp: {
      host: smtpHost,
      port: parseIntSafe(process.env.SMTP_PORT, 587),
      user: process.env.SMTP_USER || '',
      from: process.env.SMTP_FROM || 'security@bloodconnect.org',
      configured: Boolean(smtpHost && process.env.SMTP_USER),
    },
    db: {
      uri: process.env.DATABASE_URL || process.env.MYSQL_URL || '',
      host: process.env.DB_HOST || 'localhost',
      port: parseIntSafe(process.env.DB_PORT, 3306),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD ?? '',
      database: process.env.DB_NAME || 'bloodconnect_db',
      ssl: parseBool(process.env.DB_SSL, false),
      connectionLimit: parseIntSafe(process.env.DB_POOL_LIMIT, 10),
      connectTimeoutMs: parseIntSafe(process.env.DB_CONNECT_TIMEOUT_MS, 8000),
    },
  };
}

export const env: EnvConfig = loadEnv();
