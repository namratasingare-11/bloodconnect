import path from 'path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { env } from './server/config/env';
import { createApp } from './server/app';
import { testConnection } from './server/db/connection';

async function startServer() {
  const app = createApp();

  // Non-blocking startup database probe
  testConnection().catch(() => {});

  // Mount Vite dev middleware in development or serve static production build
  if (env.nodeEnv !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(env.port, '0.0.0.0', () => {
    console.log(
      `BloodConnect server listening at http://0.0.0.0:${env.port} (${env.nodeEnv})`
    );
  });
}

startServer().catch(err => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
