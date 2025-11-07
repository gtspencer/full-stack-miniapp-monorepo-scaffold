import { Pool, QueryResult } from "pg";
import { createClient } from "redis";
import { config } from "../config.js";
import { createLogger, logError } from "../utils/logger.js";

const logger = createLogger({ module: "db.clients" });

/** ---------- PostgreSQL ---------- **/

export const pool = new Pool({
  connectionString: config.dbUrl,   // internal URL (Railway private net)
  max: 5,                           // serverless-friendly
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 5_000,
});

// Nice diagnostics (optional)
pool.on("connect", () => logger.info("PostgreSQL pool connected"));
pool.on("acquire", () => logger.debug("PostgreSQL client acquired"));
pool.on("error", (err: unknown) => {
  logError(err, { context: "pool" }, "Unexpected PostgreSQL pool error");
});

// Tiny, focused retry for early cold starts / transient refusals
async function withPgRetry<T>(fn: () => Promise<T>, attempts = 5): Promise<T> {
  let delay = 300;
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e: any) {
      const code = e?.code || e?.errno;
      const retriable =
        code === "ECONNREFUSED" ||
        code === "ETIMEDOUT" ||
        code === "ECONNRESET" ||
        code === -111; // linux ECONNREFUSED numeric
      if (!retriable || i >= attempts - 1) throw e;
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 2000);
    }
  }
}

/**
 * Call once on boot (or before first heavy query) to ensure the pool is ready.
 * Example: await initDb();
 */
export async function initDb(): Promise<void> {
  await withPgRetry(() => pool.query("select 1"));
  logger.info("PostgreSQL warm-up OK");
}

/** ---------- Redis ---------- **/

export type RedisClient = ReturnType<typeof createClient>;

let redisClient: RedisClient | null = null;
let redisInitPromise: Promise<RedisClient> | null = null;

async function connectRedisClient(): Promise<RedisClient> {
  if (!redisInitPromise) {
    const client: RedisClient = createClient({ url: config.redisUrl });
    client.on("error", (err: unknown) =>
      logError(err, { context: "redis" }, "Redis client error")
    );
    redisInitPromise = client.connect().then(() => {
      redisClient = client;
      logger.info({ redisUrl: config.redisUrl }, "Redis client connected");
      return client;
    });
  }

  try {
    return await redisInitPromise;
  } catch (err) {
    redisInitPromise = null; // allow next attempt to recreate
    throw err;
  }
}

export function getRedisClient(): Promise<RedisClient> {
  if (redisClient && redisClient.isOpen) {
    return Promise.resolve(redisClient);
  }
  return connectRedisClient();
}

/** ---------- Graceful shutdown ---------- **/

async function closeRedisClient(): Promise<void> {
  if (redisClient && redisClient.isOpen) {
    try {
      await redisClient.quit();
      logger.info("Redis client closed");
    } catch (err) {
      logError(err, { context: "closeRedis" }, "Failed to close Redis client");
    }
  }
}

async function closePool(): Promise<void> {
  try {
    await pool.end();
    logger.info("PostgreSQL pool closed");
  } catch (err) {
    logError(err, { context: "closePool" }, "Failed to close PostgreSQL pool");
  }
}

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutting down database connections");
  await closePool();
  await closeRedisClient();
}

process.once("SIGINT", () => {
  shutdown("SIGINT").catch((err) =>
    logError(err, { signal: "SIGINT" }, "Shutdown error")
  );
});

process.once("SIGTERM", () => {
  shutdown("SIGTERM").catch((err) =>
    logError(err, { signal: "SIGTERM" }, "Shutdown error")
  );
});
