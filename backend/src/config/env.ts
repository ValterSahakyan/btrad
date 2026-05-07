export interface AppEnv {
  nodeEnv: string;
  appPort: number;
  binanceApiKey: string;
  binanceApiSecret: string;
  databaseUrl: string;
  redisUrl: string;
  dashboardAuthEnabled: boolean;
  dashboardUsername: string;
  dashboardPassword: string;
}

export const appEnv = (): AppEnv => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  appPort: Number(process.env.APP_PORT ?? 3000),
  binanceApiKey: process.env.BINANCE_API_KEY ?? '',
  binanceApiSecret: process.env.BINANCE_API_SECRET ?? '',
  databaseUrl: process.env.DATABASE_URL ?? '',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  dashboardAuthEnabled: process.env.DASHBOARD_AUTH_ENABLED !== 'false',
  dashboardUsername: process.env.DASHBOARD_USERNAME ?? 'admin',
  dashboardPassword: process.env.DASHBOARD_PASSWORD ?? '',
});
