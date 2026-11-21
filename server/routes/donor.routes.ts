import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requirePermission } from '../middleware/auth.middleware';
import { createDonor, getDonors, updateDonor } from '../controllers/donor.controller';

const router = Router();

router.get('/', requirePermission('donors:read'), asyncHandler(getDonors));
router.post('/', requirePermission('donors:create'), asyncHandler(createDonor));
router.put('/:id', requirePermission('donors:update'), asyncHandler(updateDonor));

export default router;
