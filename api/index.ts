import { createApp } from '../server/app';

/**
 * Vercel Serverless Function entrypoint for all /api/* routes.
 * Vercel's Node.js runtime natively serves default-exported Express apps.
 */
const app = createApp();

export default app;
