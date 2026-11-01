import { Router, Request, Response } from "express";
import crypto from "crypto";
import {
  CreateConnectionSchema,
  UpdateConnectionSchema,
  RotateConnectionCredentialSchema,
  TestConnectionSchema,
  hasPermission,
  Role,
  ConnectorCategory,
} from "@flowforge/shared";
import {
  defaultConnectorRegistry,
  encryptCredentialData,
  decryptCredentialData,
  createMaskedSummary,
  testConnection,
} from "@flowforge/integrations";
import { apiStore, IntegrationConnectionRecord } from "../store.js";
import { requireAuth } from "../middleware/auth.js";

// ==========================================
// CONNECTOR CATALOG ROUTER (/api/v1/connectors)
// ==========================================
export const connectorRouter = Router();

connectorRouter.get("/", (req: Request, res: Response) => {
  const category = req.query.category as ConnectorCategory | undefined;
  const connectors = defaultConnectorRegistry.list(category);

  res.json({
    success: true,
    data: connectors,
    error: null,
    meta: {
      total: connectors.length,
      category: category || "ALL",
    },
  });
});

connectorRouter.get("/:connectorId", (req: Request, res: Response) => {
  const { connectorId } = req.params;
  if (!defaultConnectorRegistry.has(connectorId)) {
    res.status(404).json({
      success: false,
      data: null,
      error: {
        code: "CONNECTOR_NOT_FOUND",
        message: `Connector '${connectorId}' not found in registry.`,
      },
    });
    return;
  }

  const connector = defaultConnectorRegistry.get(connectorId);
  res.json({
    success: true,
    data: connector,
    error: null,
  });
});

// ==========================================
// ORGANIZATION CONNECTIONS ROUTER
// (Mounted at /api/v1/organizations/:organizationId/connections)
// ==========================================
export const connectionRouter = Router({ mergeParams: true });

connectionRouter.use(requireAuth);

function resolveOrgRole(
  req: Request,
  res: Response,
  orgId: string,
): Role | null {
  if (req.isApiKey) {
    if (req.organizationId !== orgId) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "API key is not authorized for this organization.",
        },
      });
      return null;
    }
    return "MEMBER";
  }

  const membership = Array.from(apiStore.memberships.values()).find(
    (m) => m.userId === req.user!.id && m.organizationId === orgId,
  );

  if (!membership) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "You are not a member of this organization.",
      },
    });
    return null;
  }

  return membership.role;
}

function formatConnectionResponse(conn: IntegrationConnectionRecord) {
  let maskedSummary: Record<string, string> = {};
  try {
    const decrypted = decryptCredentialData(conn.encryptedData);
    if (typeof decrypted === "object" && decrypted !== null) {
      maskedSummary = createMaskedSummary(decrypted as Record<string, unknown>);
    }
  } catch {
    maskedSummary = { status: "••••••••" };
  }

  return {
    id: conn.id,
    organizationId: conn.organizationId,
    connectorId: conn.connectorId,
    name: conn.name,
    status: conn.status,
    authType: conn.authType,
    maskedSummary,
    metadata: conn.metadata || {},
    lastTestedAt: conn.lastTestedAt ? conn.lastTestedAt.toISOString() : null,
    lastTestStatus: conn.lastTestStatus || null,
    createdById: conn.createdById,
    createdAt: conn.createdAt.toISOString(),
    updatedAt: conn.updatedAt.toISOString(),
  };
}

// 1. List connections for organization
connectionRouter.get("/", (req: Request, res: Response) => {
  const orgId = req.params.organizationId;
  const role = resolveOrgRole(req, res, orgId);
  if (!role) return;

  if (
    !hasPermission(role, "connections:read") &&
    !hasPermission(role, "org:read")
  ) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'connections:read'.",
      },
    });
    return;
  }

  const connections = Array.from(apiStore.connections.values())
    .filter((c) => c.organizationId === orgId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .map(formatConnectionResponse);

  res.json({
    success: true,
    data: connections,
    error: null,
    meta: { total: connections.length },
  });
});

// 2. Test draft / unsaved connection
connectionRouter.post("/test-draft", async (req: Request, res: Response) => {
  const orgId = req.params.organizationId;
  const role = resolveOrgRole(req, res, orgId);
  if (!role) return;

  if (!hasPermission(role, "connections:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'connections:write'.",
      },
    });
    return;
  }

  const { connectorId, credentialData, config } = req.body;
  if (!connectorId || !defaultConnectorRegistry.has(connectorId)) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: `Invalid or missing connector ID: '${connectorId}'.`,
      },
    });
    return;
  }

  const result = await testConnection(
    connectorId,
    credentialData || {},
    config,
  );
  res.json({
    success: true,
    data: result,
    error: null,
  });
});

// 3. Create connection
connectionRouter.post("/", (req: Request, res: Response) => {
  const orgId = req.params.organizationId;
  const role = resolveOrgRole(req, res, orgId);
  if (!role) return;

  if (!hasPermission(role, "connections:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'connections:write'.",
      },
    });
    return;
  }

  const parseResult = CreateConnectionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid connection payload.",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { connectorId, name, authType, credentialData, metadata } =
    parseResult.data;

  if (!defaultConnectorRegistry.has(connectorId)) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "CONNECTOR_NOT_FOUND",
        message: `Connector '${connectorId}' is not registered in the system.`,
      },
    });
    return;
  }

  // Encrypt sensitive credential payload using AES-256-GCM
  const encryptedData = encryptCredentialData(credentialData);

  const connectionId = `conn_${crypto.randomUUID()}`;
  const now = new Date();
  const newConnection: IntegrationConnectionRecord = {
    id: connectionId,
    organizationId: orgId,
    connectorId,
    name,
    status: "ACTIVE",
    authType: authType || "API_KEY",
    encryptedData,
    metadata: metadata || {},
    createdById: req.user?.id,
    createdAt: now,
    updatedAt: now,
  };

  apiStore.connections.set(connectionId, newConnection);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user?.id,
    action: "connection:create",
    resourceType: "IntegrationConnection",
    resourceId: connectionId,
    metadata: {
      name,
      connectorId,
      authType,
    },
    ipAddress: req.ip,
  });

  res.status(201).json({
    success: true,
    data: formatConnectionResponse(newConnection),
    error: null,
  });
});

// 4. Get connection by ID
connectionRouter.get("/:connectionId", (req: Request, res: Response) => {
  const orgId = req.params.organizationId;
  const role = resolveOrgRole(req, res, orgId);
  if (!role) return;

  if (
    !hasPermission(role, "connections:read") &&
    !hasPermission(role, "org:read")
  ) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'connections:read'.",
      },
    });
    return;
  }

  const conn = apiStore.connections.get(req.params.connectionId);
  if (!conn || conn.organizationId !== orgId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Connection not found." },
    });
    return;
  }

  res.json({
    success: true,
    data: formatConnectionResponse(conn),
    error: null,
  });
});

// 5. Update connection (name, status, metadata)
connectionRouter.patch("/:connectionId", (req: Request, res: Response) => {
  const orgId = req.params.organizationId;
  const role = resolveOrgRole(req, res, orgId);
  if (!role) return;

  if (!hasPermission(role, "connections:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'connections:write'.",
      },
    });
    return;
  }

  const conn = apiStore.connections.get(req.params.connectionId);
  if (!conn || conn.organizationId !== orgId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Connection not found." },
    });
    return;
  }

  const parseResult = UpdateConnectionSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({
      success: false,
      data: null,
      error: {
        code: "VALIDATION_FAILED",
        message: "Invalid connection update payload.",
        details: parseResult.error.issues,
      },
    });
    return;
  }

  const { name, status, metadata } = parseResult.data;
  if (name !== undefined) conn.name = name;
  if (status !== undefined) conn.status = status;
  if (metadata !== undefined)
    conn.metadata = { ...(conn.metadata || {}), ...metadata };
  conn.updatedAt = new Date();

  apiStore.connections.set(conn.id, conn);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user?.id,
    action: "connection:update",
    resourceType: "IntegrationConnection",
    resourceId: conn.id,
    metadata: { name: conn.name, status: conn.status },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: formatConnectionResponse(conn),
    error: null,
  });
});

// 6. Rotate connection credentials
connectionRouter.post(
  "/:connectionId/rotate",
  (req: Request, res: Response) => {
    const orgId = req.params.organizationId;
    const role = resolveOrgRole(req, res, orgId);
    if (!role) return;

    if (!hasPermission(role, "connections:write")) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires permission 'connections:write'.",
        },
      });
      return;
    }

    const conn = apiStore.connections.get(req.params.connectionId);
    if (!conn || conn.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Connection not found." },
      });
      return;
    }

    const parseResult = RotateConnectionCredentialSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid rotation payload. credentialData is required.",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    // Re-encrypt credentials using AES-256-GCM
    conn.encryptedData = encryptCredentialData(parseResult.data.credentialData);
    conn.lastTestedAt = undefined;
    conn.lastTestStatus = undefined;
    conn.updatedAt = new Date();

    apiStore.connections.set(conn.id, conn);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "connection:rotate",
      resourceType: "IntegrationConnection",
      resourceId: conn.id,
      metadata: { rotatedAt: conn.updatedAt },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: formatConnectionResponse(conn),
      error: null,
    });
  },
);

// 7. Test configured connection
connectionRouter.post(
  "/:connectionId/test",
  async (req: Request, res: Response) => {
    const orgId = req.params.organizationId;
    const role = resolveOrgRole(req, res, orgId);
    if (!role) return;

    if (
      !hasPermission(role, "connections:read") &&
      !hasPermission(role, "connections:write")
    ) {
      res.status(403).json({
        success: false,
        data: null,
        error: {
          code: "FORBIDDEN",
          message: "Requires permission 'connections:read'.",
        },
      });
      return;
    }

    const conn = apiStore.connections.get(req.params.connectionId);
    if (!conn || conn.organizationId !== orgId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Connection not found." },
      });
      return;
    }

    let decrypted: Record<string, unknown> = {};
    try {
      decrypted = decryptCredentialData(conn.encryptedData) as Record<
        string,
        unknown
      >;
    } catch (err: any) {
      res.status(500).json({
        success: false,
        data: null,
        error: {
          code: "DECRYPTION_FAILED",
          message: `Failed to decrypt stored credentials: ${err.message}`,
        },
      });
      return;
    }

    const result = await testConnection(
      conn.connectorId,
      decrypted,
      req.body.config,
    );

    // Update last test diagnostics
    conn.lastTestedAt = new Date();
    conn.lastTestStatus = result.success ? "SUCCESS" : "FAILED";
    apiStore.connections.set(conn.id, conn);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: req.user?.id,
      action: "connection:test",
      resourceType: "IntegrationConnection",
      resourceId: conn.id,
      metadata: {
        success: result.success,
        latencyMs: result.latencyMs,
        errorCategory: result.errorCategory,
      },
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: result,
      error: null,
    });
  },
);

// 8. Revoke / Delete connection
connectionRouter.delete("/:connectionId", (req: Request, res: Response) => {
  const orgId = req.params.organizationId;
  const role = resolveOrgRole(req, res, orgId);
  if (!role) return;

  if (!hasPermission(role, "connections:write")) {
    res.status(403).json({
      success: false,
      data: null,
      error: {
        code: "FORBIDDEN",
        message: "Requires permission 'connections:write'.",
      },
    });
    return;
  }

  const conn = apiStore.connections.get(req.params.connectionId);
  if (!conn || conn.organizationId !== orgId) {
    res.status(404).json({
      success: false,
      data: null,
      error: { code: "NOT_FOUND", message: "Connection not found." },
    });
    return;
  }

  apiStore.connections.delete(conn.id);

  apiStore.recordAudit({
    organizationId: orgId,
    userId: req.user?.id,
    action: "connection:revoke",
    resourceType: "IntegrationConnection",
    resourceId: conn.id,
    metadata: { name: conn.name, connectorId: conn.connectorId },
    ipAddress: req.ip,
  });

  res.json({
    success: true,
    data: {
      message: `Connection '${conn.name}' has been successfully revoked.`,
    },
    error: null,
  });
});
