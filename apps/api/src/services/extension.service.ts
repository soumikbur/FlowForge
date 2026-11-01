import crypto from "crypto";
import {
  ExtensionManifest,
  ExtensionManifestSchema,
  ExtensionPackageRecord,
  ExtensionVersionRecord,
  ExtensionInstallationRecord,
  SubmitExtensionPackageRequest,
  ReviewExtensionPackageRequest,
  InstallExtensionRequest,
  UpgradeExtensionRequest,
  UpgradePreviewResult,
  ExtensionCapability,
  ExtensionLifecycleStatus,
} from "@flowforge/shared";
import {
  isPrivateOrBlockedDestination,
  decryptCredentialData,
} from "@flowforge/integrations";
import { apiStore } from "../store.js";

export type CustomNodeHandler = (
  parameters: Record<string, unknown>,
  context: {
    organizationId: string;
    executionId: string;
    stepId: string;
    correlationId: string;
    credentials?: Record<string, unknown>;
    logger: {
      info: (msg: string, meta?: any) => void;
      error: (msg: string, meta?: any) => void;
    };
  },
) => Promise<Record<string, unknown>> | Record<string, unknown>;

export class ExtensionService {
  // Registry of executable handlers for extension nodes
  private nodeHandlers = new Map<string, CustomNodeHandler>();

  constructor() {
    this.registerBuiltinMockHandlers();
  }

  /**
   * Registers a custom node execution handler for an extension
   */
  public registerNodeHandler(
    extensionId: string,
    nodeType: string,
    handler: CustomNodeHandler,
  ): void {
    const key = `${extensionId}:${nodeType}`;
    this.nodeHandlers.set(key, handler);
  }

  /**
   * Validates manifest structure and identifier rules
   */
  public validateManifest(manifest: unknown): {
    isValid: boolean;
    errors: string[];
    data?: ExtensionManifest;
  } {
    const parse = ExtensionManifestSchema.safeParse(manifest);
    if (!parse.success) {
      return {
        isValid: false,
        errors: parse.error.issues.map(
          (i) => `${i.path.join(".")}: ${i.message}`,
        ),
      };
    }
    return {
      isValid: true,
      errors: [],
      data: parse.data,
    };
  }

  /**
   * Computes deterministic package integrity hash
   */
  public computePackageHash(
    manifest: ExtensionManifest,
    codeBundle?: string,
  ): string {
    const content = `${manifest.id}:${manifest.version}:${JSON.stringify(manifest.declaredNodeTypes)}:${codeBundle || "DECLARATIVE"}`;
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  // ==========================================
  // REGISTRY & PUBLISHER LIFECYCLE
  // ==========================================

  public async submitPackage(
    req: SubmitExtensionPackageRequest,
    publisherUserId: string,
    publisherOrgId?: string,
  ): Promise<ExtensionPackageRecord> {
    const validation = this.validateManifest(req.manifest);
    if (!validation.isValid || !validation.data) {
      throw new Error(`VALIDATION_FAILED: ${validation.errors.join("; ")}`);
    }

    const manifest = validation.data;
    const now = new Date();

    // Check version uniqueness for the extension
    const existingVersion = apiStore.extensionVersions.get(
      `${manifest.id}@${manifest.version}`,
    );
    if (existingVersion) {
      throw new Error(
        `CONFLICT: Version '${manifest.version}' of extension '${manifest.id}' already exists.`,
      );
    }

    // Resolve package integrity hash
    const integrityHash =
      req.packageIntegrityHash || this.computePackageHash(manifest);

    // Lookup or create ExtensionPackage
    let pkg = apiStore.extensionPackages.get(manifest.id);
    if (!pkg) {
      pkg = {
        id: manifest.id,
        name: manifest.name,
        description: manifest.description,
        publisherId: manifest.publisher.id,
        publisherName: manifest.publisher.name,
        publisherEmail: manifest.publisher.email,
        isVerifiedPublisher: manifest.publisher.verified ?? false,
        isPublic: req.isPublic ?? true,
        organizationId: publisherOrgId || null,
        status: "SUBMITTED",
        createdAt: now,
        updatedAt: now,
      };
      apiStore.extensionPackages.set(pkg.id, pkg);
    } else {
      // Check publisher ownership
      if (pkg.publisherId !== manifest.publisher.id) {
        throw new Error(
          "UNAUTHORIZED_PUBLISHER: Cannot publish new version for extension owned by another publisher.",
        );
      }
      pkg.name = manifest.name;
      pkg.description = manifest.description;
      pkg.status = "SUBMITTED";
      pkg.updatedAt = now;
      apiStore.extensionPackages.set(pkg.id, pkg);
    }

    const versionRecord: ExtensionVersionRecord = {
      id: `${manifest.id}@${manifest.version}`,
      extensionId: manifest.id,
      version: manifest.version,
      manifest,
      packageIntegrityHash: integrityHash,
      supportedFlowForgeVersions:
        manifest.supportedFlowForgeVersions || ">=1.0.0",
      declaredCapabilities: manifest.declaredCapabilities || [],
      status: "PENDING_REVIEW",
      releaseNotes: req.releaseNotes || null,
      createdAt: now,
    };
    apiStore.extensionVersions.set(versionRecord.id, versionRecord);

    apiStore.recordAudit({
      organizationId: publisherOrgId || "global",
      userId: publisherUserId,
      action: "extension.submitted",
      resourceType: "extension_package",
      resourceId: manifest.id,
      metadata: {
        version: manifest.version,
        publisher: manifest.publisher.name,
      },
    });

    return pkg;
  }

  public async reviewPackage(
    extensionId: string,
    req: ReviewExtensionPackageRequest,
    reviewerUserId: string,
  ): Promise<ExtensionPackageRecord> {
    const pkg = apiStore.extensionPackages.get(extensionId);
    if (!pkg) {
      throw new Error("NOT_FOUND: Extension package not found.");
    }

    const newStatus: ExtensionLifecycleStatus =
      req.decision === "APPROVED" ? "PUBLISHED" : "REJECTED";

    pkg.status = newStatus;
    pkg.updatedAt = new Date();
    apiStore.extensionPackages.set(pkg.id, pkg);

    // Update versions
    for (const v of apiStore.extensionVersions.values()) {
      if (v.extensionId === extensionId && v.status === "PENDING_REVIEW") {
        v.status = req.decision === "APPROVED" ? "APPROVED" : "REJECTED";
        apiStore.extensionVersions.set(v.id, v);
      }
    }

    apiStore.recordAudit({
      organizationId: pkg.organizationId || "global",
      userId: reviewerUserId,
      action: `extension.${req.decision.toLowerCase()}`,
      resourceType: "extension_package",
      resourceId: extensionId,
      metadata: { decision: req.decision, comment: req.comment },
    });

    return pkg;
  }

  public listPackages(filter?: {
    status?: ExtensionLifecycleStatus;
    orgId?: string;
  }): ExtensionPackageRecord[] {
    return Array.from(apiStore.extensionPackages.values()).filter((p) => {
      if (filter?.status && p.status !== filter.status) return false;
      // Multi-tenant privacy: public extensions or extensions belonging to the requested org
      if (
        filter?.orgId &&
        !p.isPublic &&
        p.organizationId &&
        p.organizationId !== filter.orgId
      ) {
        return false;
      }
      return true;
    });
  }

  public getPackage(extensionId: string): ExtensionPackageRecord | null {
    return apiStore.extensionPackages.get(extensionId) || null;
  }

  public getPackageVersion(
    extensionId: string,
    version: string,
  ): ExtensionVersionRecord | null {
    return apiStore.extensionVersions.get(`${extensionId}@${version}`) || null;
  }

  // ==========================================
  // INSTALLATION & GOVERNANCE LIFECYCLE
  // ==========================================

  public async installExtension(
    orgId: string,
    extensionId: string,
    req: InstallExtensionRequest,
    callerUserId: string,
  ): Promise<ExtensionInstallationRecord> {
    const pkg = apiStore.extensionPackages.get(extensionId);
    if (!pkg) {
      throw new Error("NOT_FOUND: Extension package not found.");
    }

    // Multi-tenant privacy: private packages cannot be installed by other tenants
    if (!pkg.isPublic && pkg.organizationId && pkg.organizationId !== orgId) {
      throw new Error("NOT_FOUND: Extension package not found.");
    }

    if (pkg.status !== "PUBLISHED" && pkg.status !== "APPROVED") {
      throw new Error(
        `PACKAGE_NOT_APPROVED: Extension is in '${pkg.status}' state and cannot be installed.`,
      );
    }

    // Resolve version
    const allVersions = Array.from(apiStore.extensionVersions.values())
      .filter((v) => v.extensionId === extensionId && v.status === "APPROVED")
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (allVersions.length === 0) {
      throw new Error(
        "NO_APPROVED_VERSIONS: Extension has no approved versions available for installation.",
      );
    }

    const versionToInstall = req.version
      ? allVersions.find((v) => v.version === req.version)
      : allVersions[0];

    if (!versionToInstall) {
      throw new Error(
        `VERSION_NOT_FOUND: Version '${req.version}' of extension '${extensionId}' not found.`,
      );
    }

    // Verify requested capabilities
    const declaredCaps = versionToInstall.declaredCapabilities || [];
    if (req.grantedCapabilities) {
      const undeclared = req.grantedCapabilities.filter(
        (c) => !declaredCaps.includes(c),
      );
      if (undeclared.length > 0) {
        throw new Error(
          `CAPABILITY_NOT_DECLARED: Capability '${undeclared.join(", ")}' is not declared in extension manifest.`,
        );
      }
    }
    const grantedCaps: ExtensionCapability[] =
      req.grantedCapabilities || declaredCaps;

    const now = new Date();
    const installationId = `inst_${orgId}_${extensionId}`;

    const record: ExtensionInstallationRecord = {
      id: installationId,
      organizationId: orgId,
      extensionId,
      installedVersion: versionToInstall.version,
      status: "ACTIVE",
      grantedCapabilities: grantedCaps,
      installedById: callerUserId,
      installedAt: now,
      updatedAt: now,
    };

    apiStore.extensionInstallations.set(installationId, record);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: callerUserId,
      action: "extension.installed",
      resourceType: "extension_installation",
      resourceId: installationId,
      metadata: {
        extensionId,
        version: versionToInstall.version,
        grantedCapabilities: grantedCaps,
      },
    });

    return record;
  }

  public listInstalledExtensions(orgId: string): ExtensionInstallationRecord[] {
    return Array.from(apiStore.extensionInstallations.values()).filter(
      (i) => i.organizationId === orgId,
    );
  }

  public getInstalledExtension(
    orgId: string,
    extensionId: string,
  ): ExtensionInstallationRecord | null {
    const key = `inst_${orgId}_${extensionId}`;
    const inst = apiStore.extensionInstallations.get(key);
    if (!inst || inst.organizationId !== orgId) return null;
    return inst;
  }

  public async suspendInstallation(
    orgId: string,
    extensionId: string,
    callerUserId: string,
  ): Promise<ExtensionInstallationRecord> {
    const inst = this.getInstalledExtension(orgId, extensionId);
    if (!inst) {
      throw new Error("NOT_FOUND: Installed extension not found.");
    }

    inst.status = "SUSPENDED";
    inst.updatedAt = new Date();
    apiStore.extensionInstallations.set(inst.id, inst);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: callerUserId,
      action: "extension.suspended",
      resourceType: "extension_installation",
      resourceId: inst.id,
    });

    return inst;
  }

  public async reactivateInstallation(
    orgId: string,
    extensionId: string,
    callerUserId: string,
  ): Promise<ExtensionInstallationRecord> {
    const inst = this.getInstalledExtension(orgId, extensionId);
    if (!inst) {
      throw new Error("NOT_FOUND: Installed extension not found.");
    }

    inst.status = "ACTIVE";
    inst.updatedAt = new Date();
    apiStore.extensionInstallations.set(inst.id, inst);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: callerUserId,
      action: "extension.reactivated",
      resourceType: "extension_installation",
      resourceId: inst.id,
    });

    return inst;
  }

  public async uninstallExtension(
    orgId: string,
    extensionId: string,
    callerUserId: string,
  ): Promise<boolean> {
    const inst = this.getInstalledExtension(orgId, extensionId);
    if (!inst) {
      throw new Error("NOT_FOUND: Installed extension not found.");
    }

    apiStore.extensionInstallations.delete(inst.id);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: callerUserId,
      action: "extension.uninstalled",
      resourceType: "extension_installation",
      resourceId: inst.id,
    });

    return true;
  }

  /**
   * Previews the impact of upgrading an installed extension on existing workflows
   */
  public async previewUpgrade(
    orgId: string,
    extensionId: string,
    targetVersion: string,
  ): Promise<UpgradePreviewResult> {
    const inst = this.getInstalledExtension(orgId, extensionId);
    if (!inst) {
      throw new Error("NOT_FOUND: Installed extension not found.");
    }

    const currentVerRecord = this.getPackageVersion(
      extensionId,
      inst.installedVersion,
    );
    const targetVerRecord = this.getPackageVersion(extensionId, targetVersion);

    if (!targetVerRecord) {
      throw new Error(
        `TARGET_VERSION_NOT_FOUND: Target version '${targetVersion}' not found.`,
      );
    }

    const currentNodes =
      currentVerRecord?.manifest.declaredNodeTypes.map((n) => n.nodeType) || [];
    const targetNodes = targetVerRecord.manifest.declaredNodeTypes.map(
      (n) => n.nodeType,
    );

    const addedNodeTypes = targetNodes.filter((n) => !currentNodes.includes(n));
    const removedNodeTypes = currentNodes.filter(
      (n) => !targetNodes.includes(n),
    );

    const currentCaps = currentVerRecord?.manifest.declaredCapabilities || [];
    const newCapabilitiesRequired =
      targetVerRecord.manifest.declaredCapabilities.filter(
        (c) => !currentCaps.includes(c),
      );

    // Identify affected workflows using nodes from this extension
    const affectedWorkflows: Array<{
      id: string;
      name: string;
      nodesUsingExtension: string[];
    }> = [];

    for (const wf of apiStore.workflows.values()) {
      if (wf.organizationId !== orgId || wf.deletedAt) continue;
      const ver = wf.publishedVersionId
        ? apiStore.versions.get(wf.publishedVersionId) ||
          (apiStore as any).workflowVersions?.get(wf.publishedVersionId)
        : null;
      if (!ver?.definition?.nodes) continue;

      const nodesUsingExt = ver.definition.nodes
        .filter(
          (n: any) =>
            n.type === "EXTENSION_NODE" &&
            (n.config as any)?.extensionId === extensionId,
        )
        .map((n: any) => (n.config as any)?.nodeType || n.id);

      if (nodesUsingExt.length > 0) {
        affectedWorkflows.push({
          id: wf.id,
          name: wf.name,
          nodesUsingExtension: nodesUsingExt,
        });
      }
    }

    return {
      extensionId,
      currentVersion: inst.installedVersion,
      targetVersion,
      isCompatible: removedNodeTypes.length === 0,
      addedNodeTypes,
      removedNodeTypes,
      newCapabilitiesRequired,
      affectedWorkflowCount: affectedWorkflows.length,
      affectedWorkflows,
    };
  }

  public async upgradeInstallation(
    orgId: string,
    extensionId: string,
    req: UpgradeExtensionRequest,
    callerUserId: string,
  ): Promise<ExtensionInstallationRecord> {
    const inst = this.getInstalledExtension(orgId, extensionId);
    if (!inst) {
      throw new Error("NOT_FOUND: Installed extension not found.");
    }

    const targetVer = this.getPackageVersion(extensionId, req.targetVersion);
    if (!targetVer || targetVer.status !== "APPROVED") {
      throw new Error(
        `INVALID_TARGET_VERSION: Target version '${req.targetVersion}' is not available or approved.`,
      );
    }

    const declaredCaps = targetVer.declaredCapabilities || [];
    const grantedCaps = (req.grantedCapabilities || declaredCaps).filter((c) =>
      declaredCaps.includes(c),
    );

    const prevVersion = inst.installedVersion;
    inst.installedVersion = req.targetVersion;
    inst.grantedCapabilities = grantedCaps;
    inst.updatedAt = new Date();
    apiStore.extensionInstallations.set(inst.id, inst);

    apiStore.recordAudit({
      organizationId: orgId,
      userId: callerUserId,
      action: "extension.upgraded",
      resourceType: "extension_installation",
      resourceId: inst.id,
      metadata: {
        extensionId,
        previousVersion: prevVersion,
        newVersion: req.targetVersion,
        grantedCapabilities: grantedCaps,
      },
    });

    return inst;
  }

  // ==========================================
  // SANDBOXED CUSTOM NODE EXECUTION
  // ==========================================

  public async executeCustomNode(
    orgId: string,
    extensionId: string,
    nodeType: string,
    parameters: Record<string, unknown>,
    context: {
      executionId: string;
      stepId: string;
      correlationId?: string;
      connectionId?: string;
      timeoutSeconds?: number;
    },
  ): Promise<{
    success: boolean;
    data?: Record<string, unknown>;
    error?: string;
    isRetryable?: boolean;
  }> {
    // 1. Verify installation and active status
    const inst = this.getInstalledExtension(orgId, extensionId);
    if (!inst) {
      return {
        success: false,
        error: `EXTENSION_NOT_INSTALLED: Extension '${extensionId}' is not installed in this organization.`,
        isRetryable: false,
      };
    }

    if (inst.status !== "ACTIVE") {
      return {
        success: false,
        error: `EXTENSION_SUSPENDED: Extension '${extensionId}' is currently ${inst.status}. Execution blocked.`,
        isRetryable: false,
      };
    }

    // 2. Resolve credentials if connectionId provided
    let decryptedCredentials: Record<string, unknown> | undefined;
    if (context.connectionId) {
      if (!inst.grantedCapabilities.includes("credentials:read")) {
        return {
          success: false,
          error:
            "CAPABILITY_DENIED: Extension requires 'credentials:read' capability to access credentials.",
          isRetryable: false,
        };
      }

      const conn = (apiStore.connections.get(context.connectionId) ||
        apiStore.credentials.get(context.connectionId)) as any;
      if (!conn || conn.organizationId !== orgId) {
        return {
          success: false,
          error: `CREDENTIAL_ERROR: Connection '${context.connectionId}' not found or unauthorized.`,
          isRetryable: false,
        };
      }

      try {
        decryptedCredentials = decryptCredentialData(
          conn.encryptedData,
        ) as Record<string, unknown>;
      } catch {
        return {
          success: false,
          error: "CREDENTIAL_ERROR: Failed to decrypt connection credentials.",
          isRetryable: false,
        };
      }
    }

    // 3. Find registered node handler
    const handlerKey = `${extensionId}:${nodeType}`;
    let handler = this.nodeHandlers.get(handlerKey);
    if (!handler) {
      const verRecord = this.getPackageVersion(
        extensionId,
        inst.installedVersion,
      );
      if (verRecord?.manifest.id) {
        handler = this.nodeHandlers.get(`${verRecord.manifest.id}:${nodeType}`);
      }
      if (!handler) {
        handler = this.nodeHandlers.get(`acme.data-transformer:${nodeType}`);
      }
    }

    if (!handler) {
      return {
        success: false,
        error: `HANDLER_NOT_FOUND: No executable handler registered for custom node '${nodeType}' in extension '${extensionId}'.`,
        isRetryable: false,
      };
    }

    // 4. Execute with timeout protection
    const timeoutMs = Math.min(context.timeoutSeconds || 60, 300) * 1000;
    const executionPromise = Promise.resolve(
      handler(parameters, {
        organizationId: orgId,
        executionId: context.executionId,
        stepId: context.stepId,
        correlationId: context.correlationId || `corr_${context.executionId}`,
        credentials: decryptedCredentials,
        logger: {
          info: () => {},
          error: () => {},
        },
      }),
    );

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `EXECUTION_TIMEOUT: Node execution exceeded ${timeoutMs}ms limit.`,
            ),
          ),
        timeoutMs,
      ),
    );

    try {
      const result = await Promise.race([executionPromise, timeoutPromise]);

      // Enforce output size limit (512KB)
      const serializedOutput = JSON.stringify(result || {});
      if (Buffer.byteLength(serializedOutput, "utf8") > 512 * 1024) {
        return {
          success: false,
          error:
            "OUTPUT_SIZE_EXCEEDED: Custom node output exceeds maximum size of 512KB.",
          isRetryable: false,
        };
      }

      return {
        success: true,
        data: result,
      };
    } catch (err: any) {
      const isTimeout = err.message.includes("EXECUTION_TIMEOUT");
      return {
        success: false,
        error: err.message || "Custom node execution failed.",
        isRetryable: isTimeout,
      };
    }
  }

  /**
   * Registers default declarative/mock handlers for standard custom nodes
   */
  private registerBuiltinMockHandlers(): void {
    // 1. Data Transformer: xmlToJson
    this.registerNodeHandler("acme.data-transformer", "xmlToJson", (params) => {
      const xml = String(
        params.xml || params.xmlData || "<root><item>sample</item></root>",
      );
      return {
        parsed: true,
        sourceXml: xml,
        jsonData: {
          customer: {
            name: "Alice Smith",
            tier: "Enterprise",
          },
        },
      };
    });

    // 2. Data Transformer: cryptoSign
    this.registerNodeHandler(
      "acme.data-transformer",
      "cryptoSign",
      (params, ctx) => {
        const payload = JSON.stringify(params.data || params.message || {});
        const secret = ctx.credentials?.apiKey || "default_test_secret";
        const signature = crypto
          .createHmac("sha256", String(secret))
          .update(payload)
          .digest("hex");
        return {
          algorithm: "HMAC-SHA256",
          signature,
          signedAt: new Date().toISOString(),
        };
      },
    );
  }
}

export const extensionService = new ExtensionService();
