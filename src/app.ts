import Database from 'better-sqlite3';
import express, { Express, Request, Response } from 'express';
import { env } from './config/env';
import { errorHandler } from './middleware/error.middleware';
import { createProjectRouter } from './projects/project.routes';

export function createApp(sqlite: Database.Database = new Database(env.DATABASE_FILE)): Express {
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');

  const app = express();
  app.use(express.json());

  app.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/projects', createProjectRouter(sqlite));

  app.use(errorHandler);

  return app;
}
