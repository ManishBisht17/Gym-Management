import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  MONGODB_URI: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),
  BREVO_API_KEY: z.string().default(''),
  BREVO_SENDER_EMAIL: z.union([z.string().email(), z.literal('')]).default(''),
  BREVO_SENDER_NAME: z.string().default('GymFlow'),
});
export const env = schema.parse(process.env);
