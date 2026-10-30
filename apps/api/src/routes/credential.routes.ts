import { Router } from "express";
import crypto from "crypto";
import { CreateCredentialSchema } from "@flowforge/shared";
import { encryptCredentialData } from "@flowforge/integrations";
import { apiStore, CredentialRecord } from "../store.js";
import { requireAuth } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

export const credentialRouter = Router();

credentialRouter.use(requireAuth);

// List credentials for organization (encrypted secrets never exposed)
credentialRouter.get(
  "/",
  requirePermission("credentials:read"),
  (req, res) => {
    const orgId = req.organizationId!;
    const creds = Array.from(apiStore.credentials.values())
      .filter((c) => c.organizationId === orgId)
      .map((c) => ({
        id: c.id,
        organizationId: c.organizationId,
        name: c.name,
        type: c.type,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      }))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    res.json({
      success: true,
      data: creds,
      error: null,
      meta: { total: creds.length },
    });
  },
);

// Create new encrypted credential
credentialRouter.post(
  "/",
  requirePermission("credentials:write"),
  (req, res) => {
    const parseResult = CreateCredentialSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        data: null,
        error: {
          code: "VALIDATION_FAILED",
          message: "Invalid credential payload",
          details: parseResult.error.issues,
        },
      });
      return;
    }

    const { name, type, data } = parseResult.data;
    const credentialId = `cred_${crypto.randomUUID()}`;
    const encryptedData = encryptCredentialData(data);
    const now = new Date();

    const record: CredentialRecord = {
      id: credentialId,
      organizationId: req.organizationId!,
      name,
      type,
      encryptedData,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.credentials.set(credentialId, record);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "credential.created",
      resourceType: "integration_credential",
      resourceId: credentialId,
      metadata: { name, type },
      ipAddress: req.ip,
    });

    res.status(201).json({
      success: true,
      data: {
        id: record.id,
        organizationId: record.organizationId,
        name: record.name,
        type: record.type,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
      },
      error: null,
    });
  },
);

// Get credential metadata
credentialRouter.get(
  "/:id",
  requirePermission("credentials:read"),
  (req, res) => {
    const cred = apiStore.credentials.get(req.params.id);
    if (!cred || cred.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Credential not found." },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        id: cred.id,
        organizationId: cred.organizationId,
        name: cred.name,
        type: cred.type,
        createdAt: cred.createdAt,
        updatedAt: cred.updatedAt,
      },
      error: null,
    });
  },
);

// Delete credential
credentialRouter.delete(
  "/:id",
  requirePermission("credentials:write"),
  (req, res) => {
    const cred = apiStore.credentials.get(req.params.id);
    if (!cred || cred.organizationId !== req.organizationId) {
      res.status(404).json({
        success: false,
        data: null,
        error: { code: "NOT_FOUND", message: "Credential not found." },
      });
      return;
    }

    apiStore.credentials.delete(cred.id);

    apiStore.recordAudit({
      organizationId: req.organizationId!,
      userId: req.user?.id,
      action: "credential.deleted",
      resourceType: "integration_credential",
      resourceId: cred.id,
      ipAddress: req.ip,
    });

    res.json({
      success: true,
      data: { message: "Credential deleted successfully." },
      error: null,
    });
  },
);

