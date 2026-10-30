import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

let globalPrisma: PrismaClient | null = null;

export function getPrismaClient(): PrismaClient {
  if (!globalPrisma) {
    globalPrisma = new PrismaClient({
      log:
        process.env.NODE_ENV === "development"
          ? ["query", "error", "warn"]
          : ["error"],
    });
  }
  return globalPrisma;
}

export const prisma = getPrismaClient();

/**
 * Tenant-scoped query helper ensuring multi-tenant isolation
 */
export function createTenantDb(
  organizationId: string,
  client: PrismaClient = prisma,
) {
  return {
    organizationId,
    workflows: {
      findMany: (args: any = {}) =>
        client.workflow.findMany({
          ...args,
          where: { ...args.where, organizationId },
        }),
      findUnique: (id: string) =>
        client.workflow.findFirst({
          where: { id, organizationId },
          include: { versions: { orderBy: { versionNumber: "desc" } } },
        }),
      create: (data: any) =>
        client.workflow.create({
          data: { ...data, organizationId },
        }),
      update: (id: string, data: any) =>
        client.workflow.updateMany({
          where: { id, organizationId },
          data,
        }),
    },
    executions: {
      findMany: (args: any = {}) =>
        client.workflowExecution.findMany({
          ...args,
          where: { ...args.where, organizationId },
        }),
      findUnique: (id: string) =>
        client.workflowExecution.findFirst({
          where: { id, organizationId },
          include: {
            steps: { orderBy: { startedAt: "asc" } },
            approvals: true,
          },
        }),
      create: (data: any) =>
        client.workflowExecution.create({
          data: { ...data, organizationId },
        }),
    },
    approvals: {
      findMany: (args: any = {}) =>
        client.approval.findMany({
          ...args,
          where: { ...args.where, organizationId },
        }),
      findUnique: (id: string) =>
        client.approval.findFirst({
          where: { id, organizationId },
          include: { execution: true },
        }),
    },
  };
}
