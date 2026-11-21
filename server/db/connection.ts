import mysql, { Pool, PoolOptions } from 'mysql2/promise';
import { env } from '../config/env';

export interface DBConfig {
  host: string;
  port: number;
  user: string;
  password?: string;
  database: string;
  ssl?: boolean;
  uri?: string;
}

export const MONITORED_TABLES = [
  'donors',
  'blood_units',
  'blood_requests',
  'donation_camps',
  'camp_registrations',
  'donation_appointments',
  'patients',
  'audit_logs',
  'users',
] as const;

export function parseDatabaseUri(uri: string): Partial<DBConfig> {
  if (!uri) return {};
  try {
    const url = new URL(uri);
    return {
      host: url.hostname || 'localhost',
      port: url.port ? Number.parseInt(url.port, 10) : 3306,
      user: decodeURIComponent(url.username || 'root'),
      password: url.password ? decodeURIComponent(url.password) : '',
      database: url.pathname.replace(/^\//, '') || 'bloodconnect_db',
      ssl:
        url.searchParams.get('ssl-mode') === 'REQUIRED' ||
        url.searchParams.get('ssl') === 'true' ||
        url.protocol === 'mysqls:',
    };
  } catch {
    return {};
  }
}

export function getDefaultConfig(): DBConfig {
  const parsed = env.db.uri ? parseDatabaseUri(env.db.uri) : {};

  return {
    host: parsed.host || env.db.host,
    port: parsed.port || env.db.port,
    user: parsed.user || env.db.user,
    password: parsed.password !== undefined ? parsed.password : env.db.password,
    database: parsed.database || env.db.database,
    ssl: parsed.ssl !== undefined ? parsed.ssl : env.db.ssl,
    uri: env.db.uri,
  };
}

let activeConfig: DBConfig = getDefaultConfig();
let pool: Pool | null = null;
let lastError: string | null = null;
let isConnected = false;

export function setActiveConfig(customConfig: Partial<DBConfig>): DBConfig {
  let updated: DBConfig = {
    ...activeConfig,
    ...Object.fromEntries(
      Object.entries(customConfig).filter(([, value]) => value !== undefined)
    ),
  };

  if (updated.uri && updated.uri.trim().startsWith('mysql')) {
    const parsed = parseDatabaseUri(updated.uri.trim());
    updated = { ...updated, ...parsed };
  }

  activeConfig = updated;

  if (pool) {
    pool.end().catch(() => {});
    pool = null;
  }

  return activeConfig;
}

export function getActiveConfig(): Omit<DBConfig, 'password'> & { hasPassword: boolean } {
  return {
    host: activeConfig.host,
    port: activeConfig.port,
    user: activeConfig.user,
    database: activeConfig.database,
    ssl: activeConfig.ssl,
    hasPassword: Boolean(activeConfig.password),
  };
}

export function isDbConnected(): boolean {
  return isConnected;
}

export function getPool(customConfig?: Partial<DBConfig>): Pool {
  if (customConfig) {
    setActiveConfig(customConfig);
  }

  if (!pool) {
    const options: PoolOptions = {
      host: activeConfig.host,
      port: activeConfig.port,
      user: activeConfig.user,
      password: activeConfig.password,
      database: activeConfig.database,
      ssl: activeConfig.ssl ? { rejectUnauthorized: false } : undefined,
      waitForConnections: true,
      connectionLimit: env.db.connectionLimit,
      queueLimit: 0,
      connectTimeout: env.db.connectTimeoutMs,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
    };

    pool = mysql.createPool(options);
  }

  return pool;
}

export async function testConnection(customConfig?: Partial<DBConfig>): Promise<{
  success: boolean;
  connected: boolean;
  message: string;
  config: Omit<DBConfig, 'password'>;
  tables?: string[];
  counts?: Record<string, number>;
}> {
  if (customConfig) {
    setActiveConfig(customConfig);
  }

  const safeConfig = {
    host: activeConfig.host,
    port: activeConfig.port,
    user: activeConfig.user,
    database: activeConfig.database,
    ssl: activeConfig.ssl,
  };

  try {
    const testPool = getPool();
    await testPool.query('SELECT 1 + 1 AS result');

    let tables: string[] = [];
    try {
      const [tableRows]: any = await testPool.query('SHOW TABLES');
      tables = tableRows.map((row: Record<string, unknown>) => String(Object.values(row)[0]));
    } catch {
      tables = [];
    }

    const counts: Record<string, number> = {};
    for (const table of MONITORED_TABLES) {
      if (tables.includes(table)) {
        try {
          const [rows]: any = await testPool.query(`SELECT COUNT(*) AS count FROM \`${table}\``);
          counts[table] = Number(rows[0]?.count ?? 0);
        } catch {
          // Skip tables with transient query errors
        }
      }
    }

    isConnected = true;
    lastError = null;

    return {
      success: true,
      connected: true,
      message: `Successfully connected to live MySQL server at ${activeConfig.host}:${activeConfig.port}/${activeConfig.database}`,
      config: safeConfig,
      tables,
      counts,
    };
  } catch (err: unknown) {
    isConnected = false;
    lastError = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      connected: false,
      message: `Failed to connect to MySQL: ${lastError}`,
      config: safeConfig,
    };
  }
}

export function getStatus() {
  return {
    connected: isConnected,
    host: activeConfig.host,
    port: activeConfig.port,
    database: activeConfig.database,
    user: activeConfig.user,
    lastError,
  };
}
