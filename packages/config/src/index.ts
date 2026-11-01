import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

const DEV_DEFAULT_SESSION_SECRET = "flowforge-dev-session-secret-min-16-chars";
const DEV_DEFAULT_ENCRYPTION_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const DEV_DEFAULT_JWT_SECRET = "flowforge-jwt-secret-min-16-chars";

const envBaseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_URL: z.string().url().default("http://localhost:4000"),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  WORKER_PORT: z.coerce.number().int().min(1).max(65535).default(4001),
  DATABASE_URL: z
    .string()
    .default(
      "postgresql://flowforge:flowforge_password@localhost:5432/flowforge_db?schema=public",
    ),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  SESSION_SECRET: z.string().min(16).default(DEV_DEFAULT_SESSION_SECRET),
  ENCRYPTION_KEY: z.string().min(32).default(DEV_DEFAULT_ENCRYPTION_KEY),
  JWT_SECRET: z.string().min(16).default(DEV_DEFAULT_JWT_SECRET),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

const envSchema = envBaseSchema.superRefine((data, ctx) => {
  const isProductionLike =
    data.NODE_ENV === "production" || data.NODE_ENV === "staging";

  if (isProductionLike) {
    // 1. Session Secret Invariant
    if (
      !data.SESSION_SECRET ||
      data.SESSION_SECRET.length < 32 ||
      data.SESSION_SECRET === DEV_DEFAULT_SESSION_SECRET ||
      data.SESSION_SECRET.includes("change-in-production")
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["SESSION_SECRET"],
        message:
          "Must be a secure random secret of at least 32 characters in production (cannot use development default)",
      });
    }

    // 2. Encryption Key Invariant (64-character hex string = 32 bytes)
    const is64Hex = /^[0-9a-fA-F]{64}$/.test(data.ENCRYPTION_KEY);
    if (!is64Hex || data.ENCRYPTION_KEY === DEV_DEFAULT_ENCRYPTION_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["ENCRYPTION_KEY"],
        message:
          "Must be a 64-character hexadecimal string (32 bytes) in production (cannot use development default)",
      });
    }

    // 3. Database URL Invariant
    const isPostgres =
      data.DATABASE_URL.startsWith("postgresql://") ||
      data.DATABASE_URL.startsWith("postgres://");
    if (!isPostgres || data.DATABASE_URL.startsWith("file:")) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["DATABASE_URL"],
        message:
          "Must be a valid PostgreSQL connection string starting with postgresql:// in production",
      });
    }

    // 4. Redis URL Invariant
    const isRedis =
      data.REDIS_URL.startsWith("redis://") ||
      data.REDIS_URL.startsWith("rediss://");
    if (!isRedis) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["REDIS_URL"],
        message:
          "Must be a valid Redis connection string starting with redis:// or rediss:// in production",
      });
    }

    // 5. Port clash check
    if (data.PORT === data.WORKER_PORT) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["WORKER_PORT"],
        message: "WORKER_PORT cannot be the same as API PORT",
      });
    }
  }
});

export type AppConfig = z.infer<typeof envBaseSchema>;

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

/**
 * Mask sensitive secrets in configuration for safe logging and diagnostics
 */
export function redactedConfig(cfg: AppConfig): Record<string, unknown> {
  const maskUrl = (urlStr: string) => {
    try {
      const parsed = new URL(urlStr);
      if (parsed.password) {
        parsed.password = "********";
      }
      return parsed.toString();
    } catch {
      return "[MALFORMED_URL]";
    }
  };

  return {
    ...cfg,
    SESSION_SECRET: "[REDACTED]",
    ENCRYPTION_KEY: "[REDACTED]",
    JWT_SECRET: "[REDACTED]",
    DATABASE_URL: maskUrl(cfg.DATABASE_URL),
    REDIS_URL: maskUrl(cfg.REDIS_URL),
  };
}

/**
 * Validates a candidate environment configuration without throwing
 */
export function validateEnvironmentConfig(env: Record<string, unknown>): {
  valid: boolean;
  errors: string[];
  data?: AppConfig;
} {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    return {
      valid: false,
      errors: result.error.issues.map(
        (i) => `${i.path.join(".")}: ${i.message}`,
      ),
    };
  }
  return {
    valid: true,
    errors: [],
    data: result.data,
  };
}

export const config = getAppConfig();
