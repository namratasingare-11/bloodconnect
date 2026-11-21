import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requirePermission } from '../middleware/auth.middleware';
import {
  connectDatabase,
  downloadSchemaSql,
  getDatabaseStatus,
  getLiveData,
  initDatabaseTables,
  runSqlQuery,
  seedDatabase,
  syncAllRecords,
  testDatabaseConnection,
} from '../controllers/database.controller';

const router = Router();

// Public safe status indicator (does not expose credentials) & downloadable schema reference
router.get('/status', asyncHandler(getDatabaseStatus));
router.get('/schema.sql', downloadSchemaSql);

// Sensitive MySQL infrastructure operations require explicit 'db:manage' permission
router.post('/test', requirePermission('db:manage'), asyncHandler(testDatabaseConnection));
router.post('/connect', requirePermission('db:manage'), asyncHandler(connectDatabase));
router.post('/init-tables', requirePermission('db:manage'), asyncHandler(initDatabaseTables));
router.post('/query', requirePermission('db:manage'), asyncHandler(runSqlQuery));
router.post('/seed', requirePermission('db:manage'), asyncHandler(seedDatabase));
router.post('/sync-all', requirePermission('db:manage'), asyncHandler(syncAllRecords));
router.get('/live-data', requirePermission('db:manage'), asyncHandler(getLiveData));

export default router;
