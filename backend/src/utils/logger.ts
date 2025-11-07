// /utils/logger.ts
import pino from 'pino';

/**
 * Log levels:
 * - fatal (60): Application is going to stop
 * - error (50): Something failed but app continues
 * - warn (40): Something unexpected but app continues
 * - info (30): General informational messages (default)
 * - debug (20): Detailed debug information
 * - trace (10): Very detailed trace information
 * - silent: Disable all logging
 */

type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';

// Read log level from environment variable, default to 'info'
const logLevel = (process.env.LOG_LEVEL || 'info') as LogLevel;

// Check if we're in development mode
const isDevelopment = process.env.NODE_ENV !== 'production';

// Create logger with environment-based configuration
export const logger = pino({
  level: logLevel,
  
  // Use pino-pretty in development for human-readable logs
  transport: isDevelopment
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
          singleLine: false,
        },
      }
    : undefined, // In production, use JSON format (no transport)
  
  // Base context added to all logs
  base: {
    env: process.env.NODE_ENV || 'development',
  },
  
  // Format timestamps
  timestamp: pino.stdTimeFunctions.isoTime,
  
  // Redact sensitive fields (add more as needed)
  redact: {
    paths: [
      'password',
      'token',
      'apiKey',
      'privateKey',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with additional context
 * 
 * @example
 * const auctionLogger = createLogger({ module: 'auction' });
 * auctionLogger.info({ auctionId: 123 }, 'Auction created');
 */
export function createLogger(context: Record<string, any>) {
  return logger.child(context);
}

/**
 * Log an error with full context
 * 
 * @example
 * logError(error, { userId: 123, action: 'bid' }, 'Failed to place bid');
 */
export function logError(
  error: unknown,
  context?: Record<string, any>,
  message?: string
) {
  const errorObj = error instanceof Error ? error : new Error(String(error));
  logger.error(
    {
      err: errorObj,
      ...context,
    },
    message || errorObj.message
  );
}

// Export convenience methods
export const log = {
  fatal: logger.fatal.bind(logger),
  error: logger.error.bind(logger),
  warn: logger.warn.bind(logger),
  info: logger.info.bind(logger),
  debug: logger.debug.bind(logger),
  trace: logger.trace.bind(logger),
};

export default logger;

