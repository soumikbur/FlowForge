import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  PORT: z.coerce.number().default(4000),
  API_URL: z.string().default("http://localhost:4000"),
  WEB_URL: z.string().default("http://localhost:3000"),
  WORKER_PORT: z.coerce.number().default(4001),
  DATABASE_URL: z.string().default("file:./dev.db"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SESSION_SECRET: z
    .string()
    .min(16)
    .default("flowforge-dev-session-secret-min-16-chars"),
  ENCRYPTION_KEY: z
    .string()
    .min(32)
    .default(
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    ),
  JWT_SECRET: z.string().min(16).default("flowforge-jwt-secret-min-16-chars"),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().default(100),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

export type AppConfig = z.infer<typeof envSchema>;

export function getAppConfig(
  overrides: Partial<Record<string, unknown>> = {},
): AppConfig {
  const result = envSchema.safeParse({
    ...process.env,
    ...overrides,
  });

  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join(", ");
    throw new Error(`Environment configuration error: ${issues}`);
  }

  return result.data;
}

export const config = getAppConfig();
