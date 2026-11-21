import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requirePermission } from '../middleware/auth.middleware';
import { createBloodUnit, getBloodUnits } from '../controllers/bloodUnit.controller';

const router = Router();

// Public blood inventory availability read; mutations strictly require 'inventory:manage'
router.get('/', asyncHandler(getBloodUnits));
router.post('/', requirePermission('inventory:manage'), asyncHandler(createBloodUnit));

export default router;
