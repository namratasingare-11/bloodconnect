import { Request, Response } from 'express';
import { getStatus, isDbConnected, testConnection } from '../db/connection';
import { SCHEMA_SQL } from '../db/schema';
import {
  bulkSyncToMySQL,
  executeAutoInit,
  executeRawQuery,
  fetchAllLiveData,
  seedSampleDatabase,
} from '../db/repositories/sync.repository';
import { extractDbConfigInput } from '../utils/validators';
import { isDatabaseOfflineError, sendSuccess, ValidationError } from '../utils/apiResponse';

export async function getDatabaseStatus(_req: Request, res: Response) {
  const result = await testConnection();
  return res.json(result);
}

export async function testDatabaseConnection(req: Request, res: Response) {
  const config = extractDbConfigInput(req.body);
  const result = await testConnection(config);
  return res.json(result);
}

export async function connectDatabase(req: Request, res: Response) {
  const config = extractDbConfigInput(req.body);
  const result = await testConnection(config);

  if (result.success) {
    try {
      await executeAutoInit();
    } catch {
      // Connection succeeded even if schema already exists or user lacks DDL privileges
    }
  }

  return res.json(result);
}

export async function initDatabaseTables(req: Request, res: Response) {
  const config = extractDbConfigInput(req.body);
  const result = await executeAutoInit(config);
  return res.status(result.success ? 200 : result.offline ? 503 : 500).json(result);
}

export function downloadSchemaSql(_req: Request, res: Response) {
  res.setHeader('Content-Type', 'application/sql');
  res.setHeader('Content-Disposition', 'attachment; filename="bloodconnect_schema.sql"');
  res.send(SCHEMA_SQL);
}

export async function runSqlQuery(req: Request, res: Response) {
  const { query } = req.body || {};
  if (!query || typeof query !== 'string' || !query.trim()) {
    throw new ValidationError('SQL query string is required', { query: 'Provide a non-empty SQL statement' });
  }

  const config = extractDbConfigInput(req.body);
  const result = await executeRawQuery(query, config);
  return res.status(result.success ? 200 : result.offline ? 503 : 400).json(result);
}

export async function seedDatabase(req: Request, res: Response) {
  const config = extractDbConfigInput(req.body);
  try {
    await seedSampleDatabase(config);
    return sendSuccess(res, {
      message:
        'Successfully populated MySQL database with sample users, donors, blood units, and hospital requests.',
    });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return res.status(503).json({
        success: false,
        offline: true,
        message: 'Cannot seed MySQL because the database host is unreachable. Start MySQL and connect first.',
        config: getStatus(),
      });
    }
    throw err;
  }
}

export async function syncAllRecords(req: Request, res: Response) {
  const body = req.body || {};
  try {
    const synced = await bulkSyncToMySQL({
      donors: Array.isArray(body.donors) ? body.donors : [],
      bloodUnits: Array.isArray(body.bloodUnits) ? body.bloodUnits : [],
      requests: Array.isArray(body.requests) ? body.requests : [],
      camps: Array.isArray(body.camps) ? body.camps : [],
      appointments: Array.isArray(body.appointments) ? body.appointments : [],
    });
    const liveData = await fetchAllLiveData();

    return sendSuccess(res, {
      message: `Synchronized live with MySQL: ${synced.donorsSynced} donors, ${synced.unitsSynced} units, ${synced.requestsSynced} requests, ${synced.campsSynced} camps, ${synced.appointmentsSynced} appointments.`,
      synced,
      liveCounts: liveData.liveCounts,
    });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return res.status(503).json({
        success: false,
        offline: true,
        message: 'MySQL is offline. Connect to a live MySQL instance before pushing records.',
      });
    }
    throw err;
  }
}

export async function getLiveData(_req: Request, res: Response) {
  try {
    const data = await fetchAllLiveData();
    return sendSuccess(res, {
      connected: isDbConnected(),
      data,
    });
  } catch (err: unknown) {
    if (isDatabaseOfflineError(err)) {
      return res.status(503).json({
        success: false,
        connected: false,
        offline: true,
        message: 'MySQL is currently offline.',
      });
    }
    throw err;
  }
}
