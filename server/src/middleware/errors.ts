import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
export function notFound(_req: Request, res: Response) { res.status(404).json({ error: 'Route not found' }); }
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof mongoose.Error.ValidationError) return res.status(400).json({ error: 'Invalid data', details: Object.values(err.errors).map(e => e.message) });
  if (err instanceof Error && err.name === 'ZodError') return res.status(400).json({ error: 'Invalid request' });
  if (err && typeof err === 'object' && 'code' in err && err.code === 11000) return res.status(409).json({ error: 'An account with this email already exists' });
  console.error('Request failed', err instanceof Error ? err.message : 'Unknown error');
  return res.status(500).json({ error: 'Internal server error' });
}
