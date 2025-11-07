import express from "express";
import cors from "cors";
import { config } from "./config.js";
import { logger, logError } from "./utils/logger.js";
import { initDb } from "./db/clients.js";
import { exampleRouter } from "./routes/exampleRoute.js";

async function bootstrap() {
  logger.info({
    nodeEnv: config.nodeEnv,
    logLevel: config.logLevel,
    port: config.port,
  }, 'Starting backend server...');

  // needed for cold starts
  // await initDb();

  const app = express();
  
  // Trust proxy - required for rate limiting and getting real client IPs
  // Set to true when behind a reverse proxy (Vercel, AWS Lambda, etc.)
  app.set('trust proxy', true);
  
  app.use(express.json());
  app.use(
    cors({
      origin: config.corsOrigin === "*" ? true : config.corsOrigin,
      methods: ["GET", "POST", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "x-farcaster-fid", "x-fid", "x-user-fid", "x-farcaster-username", "x-farcaster-pfp"],
      credentials: false,
    })
  );

  // Request logger middleware
  app.use((req, _res, next) => {
    const origin = req.headers.origin || req.headers.referer || 'no-origin';
    logger.info({
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
      origin,
    }, 'Incoming request');
    
    next();
  });

  app.get("/api/health", (_req, res) => res.json({ ok: true }));
  app.use("/api/example", exampleRouter);

  // Global error handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logError(err, { context: 'express' }, 'Request handler error');
    res.status(500).json({ error: 'Internal server error' });
  });

  app.use(express.static("public")); // for images

  const server = app.listen(config.port, () => {
    logger.info({
      port: config.port,
      env: config.nodeEnv,
    }, `Backend listening on http://localhost:${config.port}`);
  });

  // disabled for now, we don't need it since everything fetches on demand now and our db "should" always be in sync
  // startListener();

  process.on("SIGINT", () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });

  process.on("SIGTERM", () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  });
}

bootstrap().catch((err) => {
  logError(err, { context: 'bootstrap' }, 'Fatal bootstrap error');
  process.exit(1);
});



