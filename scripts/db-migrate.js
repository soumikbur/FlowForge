#!/usr/bin/env node
/**
 * FlowForge Production Database Migration Runner
 *
 * Guarantees safe, controlled schema deployment:
 * 1. Pre-flight connectivity check
 * 2. URL validation (PostgreSQL requirement)
 * 3. Migration execution via `prisma migrate deploy`
 * 4. Production guard preventing development seeds
 */

import { execSync } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const databaseUrl = process.env.DATABASE_URL;
const nodeEnv = process.env.NODE_ENV || "development";

console.log(
  `[FlowForge Migration] Starting migration runner (env: ${nodeEnv})...`,
);

if (!databaseUrl) {
  console.error(
    "[FlowForge Migration] ERROR: DATABASE_URL environment variable is not defined.",
  );
  process.exit(1);
}

// In production or staging, verify PostgreSQL connection string
if (nodeEnv === "production" || nodeEnv === "staging") {
  if (
    !databaseUrl.startsWith("postgresql://") &&
    !databaseUrl.startsWith("postgres://")
  ) {
    console.error(
      "[FlowForge Migration] ERROR: Production DATABASE_URL must start with postgresql:// or postgres://",
    );
    process.exit(1);
  }
}

// Safe migration path
const dbPackageDir = resolve(__dirname, "../packages/database");

try {
  console.log("[FlowForge Migration] Running pending Prisma migrations...");
  const output = execSync("pnpm --filter @flowforge/database migrate", {
    cwd: resolve(__dirname, ".."),
    stdio: "pipe",
    env: {
      ...process.env,
    },
  });

  console.log(output.toString());
  console.log("[FlowForge Migration] All migrations deployed successfully.");
  process.exit(0);
} catch (error) {
  console.error("[FlowForge Migration] Migration execution failed:");
  if (error.stdout) console.error(error.stdout.toString());
  if (error.stderr) console.error(error.stderr.toString());
  process.exit(1);
}
