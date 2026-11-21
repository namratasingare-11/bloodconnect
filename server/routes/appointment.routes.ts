import { Router } from 'express';
import { asyncHandler } from '../middleware/asyncHandler';
import { requireAnyPermission, requireAuth } from '../middleware/auth.middleware';
import {
  createAppointment,
  getAppointments,
  patchAppointment,
} from '../controllers/appointment.controller';

const router = Router();

router.get(
  '/',
  requireAnyPermission(['appointments:read_all', 'appointments:read_own']),
  asyncHandler(getAppointments)
);
router.post('/', requireAuth, asyncHandler(createAppointment));
router.patch(
  '/:id',
  requireAnyPermission(['appointments:manage', 'appointments:read_own']),
  asyncHandler(patchAppointment)
);

export default router;
