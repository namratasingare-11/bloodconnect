import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requirePermission } from '../middleware/auth.middleware';
import {
  createBloodRequest,
  getBloodRequests,
  patchBloodRequestStatus,
} from '../controllers/request.controller';

const router = Router();

router.get('/', requirePermission('requests:read'), asyncHandler(getBloodRequests));
// Emergency requisitions can be submitted by authorized users or emergency desk; status approvals strictly require 'requests:approve'
router.post('/', asyncHandler(createBloodRequest));
router.patch('/:id', requirePermission('requests:approve'), asyncHandler(patchBloodRequestStatus));

export default router;
