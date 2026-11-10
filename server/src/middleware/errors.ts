import type { NextFunction, Request, Response } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';

export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: 'Route not found' });
}

function duplicateMessage(err: { keyPattern?: Record<string, unknown>; message?: string }) {
  const keys = Object.keys(err.keyPattern || {});
  if (keys.includes('email')) return 'An account with this email already exists';
  if (keys.includes('memberId')) return 'A member with this Member ID already exists in your gym';
  if (keys.includes('receiptNumber')) return 'Receipt number collision. Please try again.';
  return 'A record with these details already exists';
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: 'Invalid data', details: Object.values(err.errors).map((e) => e.message) });
  }
  if (err instanceof ZodError) return res.status(400).json({ error: 'Invalid request' });
  if (err && typeof err === 'object' && 'code' in err && err.code === 11000) {
    return res.status(409).json({ error: duplicateMessage(err as { keyPattern?: Record<string, unknown> }) });
  }
  console.error('Request failed', err instanceof Error ? err.message : 'Unknown error');
  return res.status(500).json({ error: 'Internal server error' });
}
