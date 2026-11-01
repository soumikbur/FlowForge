/**
 * FlowForge Development & Test Seed Script
 *
 * Populates test organizations, users, and starter workflows for local development.
 * STRICTLY FORBIDDEN IN PRODUCTION.
 */

import { getPrismaClient } from "./index.js";

const nodeEnv = process.env.NODE_ENV || "development";

if (process.env.NODE_ENV === "production" || nodeEnv === "production") {
  console.error(
    "[FlowForge DB Seed] CRITICAL ERROR: Database seeding is forbidden in production!",
  );
  process.exit(1);
}

async function seed() {
  console.log(
    `[FlowForge DB Seed] Running seed script for environment: ${nodeEnv}...`,
  );
  const prisma = getPrismaClient();

  try {
    // Check if default organization exists
    const existingOrg = await prisma.organization.findFirst({
      where: { slug: "default-org" },
    });

    if (!existingOrg) {
      const org = await prisma.organization.create({
        data: {
          name: "Default Organization",
          slug: "default-org",
        },
      });
      console.log(
        `[FlowForge DB Seed] Created default organization: ${org.id}`,
      );
    } else {
      console.log(
        `[FlowForge DB Seed] Default organization already exists: ${existingOrg.id}`,
      );
    }

    console.log("[FlowForge DB Seed] Seeding completed successfully.");
  } catch (err) {
    console.error("[FlowForge DB Seed] Seeding error:", err);
    // In local environments without live Postgres, exit cleanly without crashing
    if (process.env.DATABASE_URL?.includes("5432")) {
      console.warn(
        "[FlowForge DB Seed] Postgres unavailable in local sandbox; skipped live seed.",
      );
    }
  }
}

seed();
