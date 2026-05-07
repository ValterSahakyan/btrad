import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
  APP_PORT: z.coerce.number().default(3000),
  BINANCE_API_KEY: z.string().default(''),
  BINANCE_API_SECRET: z.string().default(''),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string(),
  DASHBOARD_AUTH_ENABLED: z.enum(['true', 'false']).default('true'),
  DASHBOARD_USERNAME: z.string().default('admin'),
  DASHBOARD_PASSWORD: z.string().min(1),
});

export const validateEnv = (config: Record<string, unknown>) => envSchema.parse(config);
