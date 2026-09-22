import "dotenv/config";
import { z } from "zod";

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  FRONTEND_URL: z.string().url().default("http://localhost:5173"),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SECRET_KEY: z.string().min(1).optional(),
  DATABASE_URL: z.string().min(1).optional(),
  DIRECT_URL: z.string().min(1).optional(),
  JWT_SECRET: z.string().min(32).optional(),
  JWT_EXPIRES_IN: z.string().default("1h"),
  BLIND_SIGNING_KEY_DIRECTORY: z.string().min(1).optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  GROQ_MANIFESTO_MODEL: z.string().min(1).default("openai/gpt-oss-20b"),
  GROQ_TIMEOUT_MS: z.coerce.number().int().min(1000).max(60000).default(15000),
  PROFILE_PHOTOS_BUCKET: z.string().min(1).default("profile-photos"),
  DEV_ADMIN_NAME: z.string().min(1).default("Election Administrator"),
  DEV_ADMIN_EMAIL: z.string().email().optional(),
  DEV_ADMIN_PASSWORD: z.string().min(1).max(256).optional()
});

export const env = environmentSchema.parse(process.env);
