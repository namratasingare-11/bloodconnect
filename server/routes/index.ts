import { Router } from 'express';
import databaseRoutes from './database.routes';
import authRoutes from './auth.routes';
import rbacRoutes from './rbac.routes';
import donorRoutes from './donor.routes';
import bloodUnitRoutes from './bloodUnit.routes';
import requestRoutes from './request.routes';
import campRoutes from './camp.routes';
import appointmentRoutes from './appointment.routes';
import aiRoutes from './ai.routes';
import { getStatus } from '../db/connection';
import { sendSuccess } from '../utils/apiResponse';

const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    service: 'bloodconnect-api',
    database: getStatus(),
    time: new Date().toISOString(),
  });
});

apiRouter.use('/db', databaseRoutes);
apiRouter.use('/auth', authRoutes);
apiRouter.use('/rbac', rbacRoutes);
apiRouter.use('/donors', donorRoutes);
apiRouter.use('/blood-units', bloodUnitRoutes);
apiRouter.use('/requests', requestRoutes);
apiRouter.use('/camps', campRoutes);
apiRouter.use('/appointments', appointmentRoutes);
apiRouter.use('/ai', aiRoutes);

export default apiRouter;
