import 'dotenv/config';

function required(name: string, fallback?: string) {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`Missing env ${name}`);
  return v;
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  dbUrl: required('POSTGRES_URL', './data/auction.db'),
  baseRpcUrl: process.env.BASE_RPC_URL ?? '',
  baseWsRpcUrl: process.env.BASE_WS_RPC_URL ?? '',
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  admins: process.env.ADMINS ?? '1768' // comma separated list of fids
};