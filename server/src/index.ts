import mongoose from 'mongoose';
import { app } from './app.js';
import { env } from './config/env.js';

try {
  await mongoose.connect(env.MONGODB_URI);
  app.listen(env.PORT, () => console.log(`GymFlow API listening on ${env.PORT}`));
} catch (err) {
  console.error('Failed to start GymFlow API. Check MONGODB_URI and that MongoDB is running.');
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}