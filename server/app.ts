import express, { Express } from 'express';
import apiRouter from './routes';
import { securityHeaders } from './middleware/security';
import { requestLogger } from './middleware/requestLogger';
import { attachSession } from './middleware/auth.middleware';
import { apiNotFoundHandler, errorHandler } from './middleware/errorHandler';

export function createApp(): Express {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  app.use('/api', requestLogger, attachSession, apiRouter);
  app.use('/api/*', apiNotFoundHandler);
  app.use(errorHandler);

  return app;
}
