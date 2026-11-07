import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Gym } from '../models/Gym.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();
const registration = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(254), password: z.string().min(10).max(128), gymName: z.string().trim().min(1).max(120) });
const login = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 };
function setSession(res: import('express').Response, user: { id: string; gymId: string; role: string }) {
  const token = jwt.sign({ gymId: user.gymId, role: user.role }, env.JWT_SECRET, { subject: user.id, expiresIn: '7d' });
  res.cookie('gymflow_session', token, cookieOptions);
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const input = registration.parse(req.body);
    const email = input.email.toLowerCase();
    if (await User.exists({ email })) return res.status(409).json({ error: 'An account with this email already exists' });
    const gymId = new mongoose.Types.ObjectId();
    const userId = new mongoose.Types.ObjectId();
    const gym = await Gym.create({ _id: gymId, name: input.gymName, ownerId: userId });
    try {
      const user = await User.create({ _id: userId, name: input.name, email, passwordHash: await bcrypt.hash(input.password, 12), gymId, role: 'owner' });
      setSession(res, { id: String(user._id), gymId: String(gym._id), role: user.role });
      return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, gym: { id: gym.id, name: gym.name } });
    } catch (err) { await Gym.deleteOne({ _id: gym._id }); throw err; }
  } catch (err) { next(err); }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = login.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
    setSession(res, { id: String(user._id), gymId: String(user.gymId), role: user.role });
    const gym = await Gym.findOne({ _id: user.gymId, ownerId: user._id }).select('name');
    if (!gym) return res.status(403).json({ error: 'Gym profile is unavailable' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, gym: { id: String(user.gymId), name: gym.name } });
  } catch (err) { next(err); }
});

authRouter.post('/logout', (_req, res) => { res.clearCookie('gymflow_session', { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }); res.status(204).end(); });
authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.auth!.userId, gymId: req.auth!.gymId }).select('name email role');
    const gym = await Gym.findOne({ _id: req.auth!.gymId, ownerId: req.auth!.userId });
    if (!user || !gym) return res.status(401).json({ error: 'Account is unavailable' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, gym });
  } catch (err) { next(err); }
});
