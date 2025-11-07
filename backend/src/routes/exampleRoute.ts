import { Router } from 'express';
import { criticalLimiter } from '../middleware/rateLimiter.js';
import { logError } from '../utils/logger.js';

export const exampleRouter = Router();

exampleRouter.post('/example', criticalLimiter, async (req, res, next) => {
  try {
    return res.json({ 
      ok: true, 
    });
  } catch (err) {
    logError(err, { context: 'cronSettle' }, 'Settlement failed');
    next(err);
  }
});