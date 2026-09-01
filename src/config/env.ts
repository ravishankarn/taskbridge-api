import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('1h'),
  DATABASE_FILE: z.string().default('./data/taskbridge.sqlite'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
  NOTIFICATION_PROCESSING_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((value) => value === 'true'),
  NOTIFICATION_POLL_INTERVAL_MS: z.coerce.number().int().min(250).max(3_600_000).default(5_000),
  NOTIFICATION_BATCH_SIZE: z.coerce.number().int().min(1).max(1_000).default(100),
});

export const env = EnvSchema.parse(process.env);
export type Env = z.infer<typeof EnvSchema>;
