import { apiClient, ApiClientError } from './apiClient';

export interface MySQLConfigPayload {
  host?: string;
  port?: string | number;
  user?: string;
  password?: string;
  database?: string;
  ssl?: boolean;
  uri?: string;
}

export interface MySQLConnectionResult {
  success: boolean;
  connected?: boolean;
  offline?: boolean;
  message: string;
  config?: {
    host: string;
    port: number;
    user: string;
    database: string;
    ssl?: boolean;
  };
  tables?: string[];
  counts?: Record<string, number>;
}

export interface MySQLQueryResult {
  success: boolean;
  offline?: boolean;
  message: string;
  rows?: Record<string, unknown>[];
  fields?: string[];
  durationMs?: number;
}

export interface MySQLSyncResult {
  success: boolean;
  offline?: boolean;
  message: string;
  synced?: {
    donorsSynced: number;
    unitsSynced: number;
    requestsSynced: number;
    campsSynced: number;
    appointmentsSynced: number;
  };
  liveCounts?: Record<string, number>;
}

export interface MySQLLiveDataResult {
  success: boolean;
  connected?: boolean;
  offline?: boolean;
  message?: string;
  data?: {
    donors: Record<string, any>[];
    bloodUnits: Record<string, any>[];
    requests: Record<string, any>[];
    camps: Record<string, any>[];
    appointments: Record<string, any>[];
    patients: Record<string, any>[];
    auditLogs: Record<string, any>[];
    liveCounts: Record<string, number>;
  };
}

function toSafeErrorPayload<T extends { success: boolean; message?: string }>(err: unknown): T {
  if (err instanceof ApiClientError && err.payload && typeof err.payload === 'object') {
    return err.payload as T;
  }
  return {
    success: false,
    message: err instanceof Error ? err.message : 'Unable to reach backend database service.',
  } as T;
}

export const databaseApi = {
  async getStatus(): Promise<MySQLConnectionResult> {
    try {
      return await apiClient.get<MySQLConnectionResult>('/api/db/status');
    } catch (err) {
      return toSafeErrorPayload<MySQLConnectionResult>(err);
    }
  },

  async testConnection(payload: MySQLConfigPayload): Promise<MySQLConnectionResult> {
    try {
      return await apiClient.post<MySQLConnectionResult>('/api/db/test', payload);
    } catch (err) {
      return toSafeErrorPayload<MySQLConnectionResult>(err);
    }
  },

  async connect(payload: MySQLConfigPayload): Promise<MySQLConnectionResult> {
    try {
      return await apiClient.post<MySQLConnectionResult>('/api/db/connect', payload);
    } catch (err) {
      return toSafeErrorPayload<MySQLConnectionResult>(err);
    }
  },

  async initTables(payload: MySQLConfigPayload): Promise<{ success: boolean; message: string; executedQueries?: number; offline?: boolean }> {
    try {
      return await apiClient.post('/api/db/init-tables', payload);
    } catch (err) {
      return toSafeErrorPayload<{ success: boolean; message: string; executedQueries?: number; offline?: boolean }>(err);
    }
  },

  async seedSampleData(payload: MySQLConfigPayload): Promise<{ success: boolean; message: string; offline?: boolean }> {
    try {
      return await apiClient.post('/api/db/seed', payload);
    } catch (err) {
      return toSafeErrorPayload<{ success: boolean; message: string; offline?: boolean }>(err);
    }
  },

  async runQuery(query: string, config?: MySQLConfigPayload): Promise<MySQLQueryResult> {
    try {
      return await apiClient.post<MySQLQueryResult>('/api/db/query', { query, ...config });
    } catch (err) {
      return toSafeErrorPayload<MySQLQueryResult>(err);
    }
  },

  async syncAll(payload: Record<string, unknown>): Promise<MySQLSyncResult> {
    try {
      return await apiClient.post<MySQLSyncResult>('/api/db/sync-all', payload, 30000);
    } catch (err) {
      return toSafeErrorPayload<MySQLSyncResult>(err);
    }
  },

  async fetchLiveData(): Promise<MySQLLiveDataResult> {
    try {
      return await apiClient.get<MySQLLiveDataResult>('/api/db/live-data');
    } catch (err) {
      return toSafeErrorPayload<MySQLLiveDataResult>(err);
    }
  },
};
