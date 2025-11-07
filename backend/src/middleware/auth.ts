import { Request, Response, NextFunction } from 'express';
import { createClient, Errors } from '@farcaster/quick-auth';
import { config } from '../config.js';
import { createLogger, logError } from '../utils/logger.js';

const client = createClient();
const logger = createLogger({ module: 'middleware.auth' });

export interface AuthenticatedRequest extends Request {
  user: {
    fid: number;
  };
}

export function requireAuth() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authorization = req.header('Authorization');
    
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }

    // Extract just the domain name from the CORS origin (remove protocol)
    let domain = config.corsOrigin === '*' ? 'localhost:3000' : config.corsOrigin;
    
    // Remove protocol if present (https:// or http://)
    domain = domain.replace(/^https?:\/\//, '');
    
    // Remove trailing slash if present
    domain = domain.replace(/\/$/, '');
    
    logger.debug({ domain, corsOrigin: config.corsOrigin }, 'Verifying JWT token');

    try {
      const token = authorization.split(' ')[1];
      
      const payload = await client.verifyJwt({
        token,
        domain,
      });

      (req as AuthenticatedRequest).user = {
        fid: payload.sub,
      };

      logger.debug({ fid: payload.sub }, 'Token verified successfully');
      next();
    } catch (error) {
      if (error instanceof Errors.InvalidTokenError) {
        logger.warn({ error: error.message }, 'Invalid token provided');
        return res.status(401).json({ error: 'Invalid token' });
      }

      logError(error, { context: 'requireAuth' }, 'Authentication failed');
      return res.status(401).json({ error: 'Authentication failed' });
    }
  };
}

export function requireAdmin() {
  return async (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const fid = authReq.user.fid;
    
    if (!config.admins) {
      logger.error('ADMINS environment variable not set');
      return res.status(500).json({ error: 'Admin configuration missing' });
    }

    const adminFids = config.admins.split(',').map(fid => parseInt(fid.trim(), 10));
    
    if (!adminFids.includes(fid)) {
      logger.warn({ fid, attemptedAction: req.path }, 'Non-admin user attempted admin action');
      return res.status(403).json({ error: 'Admin access required' });
    }

    logger.debug({ fid }, 'Admin access granted');
    next();
  };
}