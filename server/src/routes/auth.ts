import { randomInt } from 'node:crypto';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import { z } from 'zod';
import { env } from '../config/env.js';
import { Gym } from '../models/Gym.js';
import { PasswordReset } from '../models/PasswordReset.js';
import { User } from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { sendPasswordResetOtp } from '../services/email.js';

export const authRouter = Router();
const registration = z.object({ name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(254), password: z.string().min(10).max(128), gymName: z.string().trim().min(1).max(120) });
const login = z.object({ email: z.string().trim().email(), password: z.string().min(1).max(128) });
const forgotPassword = z.object({ email: z.string().trim().email().max(254) });
const resetPassword = z.object({
  email: z.string().trim().email().max(254),
  otp: z.string().trim().regex(/^\d{6}$/),
  password: z.string().min(10).max(128),
});
const cookieOptions = { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 };
const genericResetMessage = 'If an account exists for that email, a reset code has been sent.';

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
      return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, gym: { id: gym.id, name: gym.name, logoUrl: gym.logoUrl } });
    } catch (err) { await Gym.deleteOne({ _id: gym._id }); throw err; }
  } catch (err) { next(err); }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const input = login.parse(req.body);
    const user = await User.findOne({ email: input.email.toLowerCase() }).select('+passwordHash');
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password' });
    setSession(res, { id: String(user._id), gymId: String(user.gymId), role: user.role });
    const gym = await Gym.findOne({ _id: user.gymId, ownerId: user._id }).select('name logoUrl');
    if (!gym) return res.status(403).json({ error: 'Gym profile is unavailable' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, gym: { id: String(user.gymId), name: gym.name, logoUrl: gym.logoUrl } });
  } catch (err) { next(err); }
});

authRouter.post('/logout', (_req, res) => { res.clearCookie('gymflow_session', { httpOnly: true, secure: env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }); res.status(204).end(); });

authRouter.post('/forgot-password', async (req, res, next) => {
  try {
    const { email } = forgotPassword.parse(req.body);
    const normalized = email.toLowerCase();
    const user = await User.findOne({ email: normalized }).select('_id email');

    if (!user) {
      return res.json({ message: genericResetMessage });
    }

    if (!env.BREVO_API_KEY || !env.BREVO_SENDER_EMAIL) {
      return res.status(503).json({ error: 'Password reset email is not configured yet.' });
    }

    const otp = String(randomInt(100000, 1000000));
    await PasswordReset.deleteMany({ email: normalized, consumedAt: { $exists: false } });
    await PasswordReset.create({
      email: normalized,
      otpHash: await bcrypt.hash(otp, 10),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    try {
      await sendPasswordResetOtp(normalized, otp);
    } catch (err) {
      console.error('Failed to send password reset email', err instanceof Error ? err.message : err);
      return res.status(502).json({ error: 'Could not send reset email. Check Brevo sender settings.' });
    }

    return res.json({ message: genericResetMessage });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/reset-password', async (req, res, next) => {
  try {
    const input = resetPassword.parse(req.body);
    const email = input.email.toLowerCase();
    const reset = await PasswordReset.findOne({ email, consumedAt: { $exists: false } }).sort({ createdAt: -1 });

    if (!reset || reset.expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }
    if (reset.attempts >= 5) {
      return res.status(429).json({ error: 'Too many attempts. Request a new reset code.' });
    }

    const matched = await bcrypt.compare(input.otp, reset.otpHash);
    if (!matched) {
      reset.attempts += 1;
      await reset.save();
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset code' });

    user.passwordHash = await bcrypt.hash(input.password, 12);
    await user.save();
    reset.consumedAt = new Date();
    await reset.save();
    await PasswordReset.deleteMany({ email, _id: { $ne: reset._id } });

    return res.json({ message: 'Password updated. You can sign in with your new password.' });
  } catch (err) {
    next(err);
  }
});

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findOne({ _id: req.auth!.userId, gymId: req.auth!.gymId }).select('name email role');
    const gym = await Gym.findOne({ _id: req.auth!.gymId, ownerId: req.auth!.userId });
    if (!user || !gym) return res.status(401).json({ error: 'Account is unavailable' });
    return res.json({ user: { id: user.id, name: user.name, email: user.email, role: user.role }, gym });
  } catch (err) { next(err); }
});
