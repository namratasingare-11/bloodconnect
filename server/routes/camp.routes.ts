import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requirePermission } from '../middleware/auth.middleware';
import { createCamp, getCamps, registerForCamp } from '../controllers/camp.controller';

const router = Router();

// Public camps discovery; creating camps and registering donors require explicit permissions
router.get('/', asyncHandler(getCamps));
router.post('/', requirePermission('camps:manage'), asyncHandler(createCamp));
router.post('/:id/register', requirePermission('camps:register'), asyncHandler(registerForCamp));

export default router;
