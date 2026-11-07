import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { env } from '../config/env.js';

declare global { namespace Express { interface Request { auth?: { userId: string; gymId: string; role: string } } } }
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.gymflow_session;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as jwt.JwtPayload;
    if (typeof payload.sub !== 'string' || typeof payload.gymId !== 'string' || !mongoose.isValidObjectId(payload.sub) || !mongoose.isValidObjectId(payload.gymId)) throw new Error('Invalid token');
    req.auth = { userId: payload.sub, gymId: payload.gymId, role: String(payload.role ?? 'owner') };
    next();
  } catch { return res.status(401).json({ error: 'Session expired or invalid' }); }
}
