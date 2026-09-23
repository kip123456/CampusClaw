import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { config } from './config';
import { CustomError } from './types';
import { initSchema } from './db/schema';
import { seed } from './db/seed';
import { warmupEmbed } from './lib/embed';
import { requestLogger } from './middleware/auth';

import { authRouter } from './routes/auth';
import { adminRouter } from './routes/admin';
import { classesRouter } from './routes/classes';
import { materialsRouter } from './routes/materials';
import { kbsRouter } from './routes/kbs';

const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', time: Date.now() });
});

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/classes', classesRouter);
app.use('/api/classes', materialsRouter);
app.use('/api/classes', kbsRouter);

app.use((_req: Request, res: Response) => {
  res.status(404).json({ error: 'NOT_FOUND', message: 'Route not found' });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof CustomError) {
    res.status(err.status).json({ error: err.code, message: err.message });
    return;
  }
  if (err && err.code === 'SQLITE_CONSTRAINT') {
    res.status(409).json({ error: 'CONFLICT', message: 'Database constraint violation' });
    return;
  }
  if (err && err.message && err.message.includes('Only PDF')) {
    res.status(400).json({ error: 'BAD_REQUEST', message: err.message });
    return;
  }
  console.error('[ERROR]', err);
  res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message || 'Internal server error' });
});

async function main() {
  initSchema();
  await seed();

  app.listen(config.port, () => {
    console.log(`[SERVER] CampusClaw backend listening on port ${config.port}`);
  });

  warmupEmbed().catch(() => {});
}

main().catch((err) => {
  console.error('[BOOT] Failed to start:', err);
  process.exit(1);
});