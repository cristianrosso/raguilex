import dotenv from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

const currentDir = dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: resolve(currentDir, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.string().default("development"),
  DATABASE_URL: z.string().min(1),
  API_PORT: z.coerce.number().int().positive().default(4001),
  WEB_ORIGIN: z.string().url().default("http://localhost:3002"),
  WEB_ORIGINS: z.string().optional(),
  JWT_SECRET: z.string().min(16),
  UPLOAD_DIR: z.string().default("uploads")
});

export const config = envSchema.parse(process.env);

export const webOrigins = [
  config.WEB_ORIGIN,
  ...(config.WEB_ORIGINS?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? [])
];
