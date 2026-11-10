import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../middleware/auth.js';
import { Gym } from '../models/Gym.js';
export const gymRouter = Router();
gymRouter.use(requireAuth);
gymRouter.get('/profile', async (req, res, next) => {
  try { const gym = await Gym.findOne({ _id: req.auth!.gymId, ownerId: req.auth!.userId }); if (!gym) return res.status(404).json({ error: 'Gym not found' }); return res.json({ gym }); } catch (e) { next(e); }
});
const update = z.object({ name: z.string().trim().min(1).max(120), email: z.string().email().optional().or(z.literal('')), phone: z.string().max(40).optional(), address: z.string().max(500).optional(), logoUrl: z.string().max(500).optional().or(z.literal('')), timezone: z.string().max(60).optional() }).strict();
gymRouter.patch('/profile', async (req, res, next) => {
  try { const input = update.parse(req.body); const gym = await Gym.findOneAndUpdate({ _id: req.auth!.gymId, ownerId: req.auth!.userId }, input, { new: true, runValidators: true }); if (!gym) return res.status(404).json({ error: 'Gym not found' }); return res.json({ gym }); } catch (e) { next(e); }
});
