import crypto from "crypto";
import { OAuthClientRecord, OAuthTokenResponse } from "@flowforge/shared";
import { apiStore } from "../store.js";

export class OAuthError extends Error {
  constructor(
    public error: string,
    public description: string,
    public status: number = 400,
  ) {
    super(description);
    this.name = "OAuthError";
  }
}

class OAuthService {
  private getSecretKey(): string {
    return (
      process.env.JWT_SECRET ||
      process.env.SESSION_SECRET ||
      "flowforge-oauth-default-secret-min-32-chars-key"
    );
  }

  /**
   * Register a new confidential OAuth 2.0 client.
   * Generates clientId (ff_client_...) and clientSecret (ff_sec_...).
   * Client secret is hashed via SHA-256 and only returned ONCE!
   */
  public createClient(options: {
    organizationId: string;
    workspaceId?: string;
    name: string;
    scopes: string[];
    createdById: string;
  }): { client: OAuthClientRecord; clientSecret: string } {
    const clientId = `ff_client_${crypto.randomBytes(16).toString("hex")}`;
    const rawSecret = `ff_sec_${crypto.randomBytes(32).toString("hex")}`;
    const clientSecretHash = crypto
      .createHash("sha256")
      .update(rawSecret)
      .digest("hex");

    const now = new Date();
    const clientRecord: OAuthClientRecord = {
      id: `oac_${crypto.randomUUID()}`,
      organizationId: options.organizationId,
      workspaceId: options.workspaceId,
      name: options.name,
      clientId,
      clientSecretHash,
      scopes: options.scopes,
      enabled: true,
      createdById: options.createdById,
      createdAt: now,
      updatedAt: now,
    };

    apiStore.oauthClients.set(clientId, clientRecord);

    apiStore.recordAudit({
      organizationId: options.organizationId,
      userId: options.createdById,
      action: "oauth.client.created",
      resourceType: "oauth_client",
      resourceId: clientRecord.id,
      metadata: {
        clientId,
        name: options.name,
        scopes: options.scopes,
        workspaceId: options.workspaceId,
      },
    });

    return { client: clientRecord, clientSecret: rawSecret };
  }

  /**
   * Rotate confidential client secret.
   * Returns new secret once and records audit log.
   */
  public rotateClientSecret(
    clientId: string,
    organizationId: string,
    actorUserId?: string,
  ): { clientId: string; clientSecret: string } {
    const client = apiStore.oauthClients.get(clientId);
    if (!client || client.organizationId !== organizationId) {
      throw new OAuthError("invalid_client", "OAuth client not found.", 404);
    }

    const newSecret = `ff_sec_${crypto.randomBytes(32).toString("hex")}`;
    const newHash = crypto.createHash("sha256").update(newSecret).digest("hex");

    client.clientSecretHash = newHash;
    client.updatedAt = new Date();
    apiStore.oauthClients.set(clientId, client);

    apiStore.recordAudit({
      organizationId,
      userId: actorUserId,
      action: "oauth.client.secret_rotated",
      resourceType: "oauth_client",
      resourceId: client.id,
      metadata: { clientId, name: client.name },
    });

    return { clientId, clientSecret: newSecret };
  }

  /**
   * Issue access token using RFC 6749 Client Credentials Grant.
   */
  public issueToken(options: {
    clientId: string;
    clientSecret: string;
    requestedScope?: string;
  }): OAuthTokenResponse {
    const client = apiStore.oauthClients.get(options.clientId);
    if (!client) {
      throw new OAuthError(
        "invalid_client",
        "Client authentication failed: unknown client ID.",
        401,
      );
    }

    // Verify secret using constant-time comparison
    const incomingHash = crypto
      .createHash("sha256")
      .update(options.clientSecret)
      .digest("hex");

    const expectedBuffer = Buffer.from(client.clientSecretHash);
    const incomingBuffer = Buffer.from(incomingHash);

    if (
      expectedBuffer.length !== incomingBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, incomingBuffer)
    ) {
      throw new OAuthError(
        "invalid_client",
        "Client authentication failed: invalid client secret.",
        401,
      );
    }

    if (!client.enabled) {
      throw new OAuthError(
        "invalid_client",
        "Client is disabled by an administrator.",
        401,
      );
    }

    // Validate scopes
    let grantedScopes: string[] = client.scopes;
    if (options.requestedScope) {
      const requested = options.requestedScope.split(/\s+/).filter(Boolean);
      const isAuthorized = requested.every(
        (s) => client.scopes.includes("*") || client.scopes.includes(s),
      );
      if (!isAuthorized) {
        throw new OAuthError(
          "invalid_scope",
          "Requested scope exceeds authorized client scopes.",
          400,
        );
      }
      grantedScopes = requested;
    }

    const expiresInSeconds = 3600; // 1 hour
    const nowEpoch = Math.floor(Date.now() / 1000);
    const expEpoch = nowEpoch + expiresInSeconds;

    const payload = {
      sub: client.clientId,
      org: client.organizationId,
      ws: client.workspaceId,
      scp: grantedScopes,
      iat: nowEpoch,
      exp: expEpoch,
      iss: "flowforge-api",
    };

    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const signature = crypto
      .createHmac("sha256", this.getSecretKey())
      .update(encodedPayload)
      .digest("base64url");

    const accessToken = `ff_oat_${encodedPayload}.${signature}`;

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: expiresInSeconds,
      scope: grantedScopes.join(" "),
    };
  }

  /**
   * Verify an OAuth Access Token. Returns decoded payload if valid and active.
   */
  public verifyAccessToken(rawToken: string): {
    clientId: string;
    organizationId: string;
    workspaceId?: string;
    scopes: string[];
  } | null {
    if (!rawToken.startsWith("ff_oat_")) {
      return null;
    }

    const tokenPart = rawToken.slice("ff_oat_".length);
    const dotIdx = tokenPart.indexOf(".");
    if (dotIdx === -1) return null;

    const encodedPayload = tokenPart.slice(0, dotIdx);
    const signature = tokenPart.slice(dotIdx + 1);

    const expectedSignature = crypto
      .createHmac("sha256", this.getSecretKey())
      .update(encodedPayload)
      .digest("base64url");

    const expectedBuf = Buffer.from(expectedSignature);
    const actualBuf = Buffer.from(signature);

    if (
      expectedBuf.length !== actualBuf.length ||
      !crypto.timingSafeEqual(expectedBuf, actualBuf)
    ) {
      return null;
    }

    try {
      const payloadStr = Buffer.from(encodedPayload, "base64url").toString(
        "utf8",
      );
      const payload = JSON.parse(payloadStr);

      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        return null;
      }

      // Check if client is still enabled
      const client = apiStore.oauthClients.get(payload.sub);
      if (!client || client.enabled === false) {
        return null;
      }

      return {
        clientId: payload.sub,
        organizationId: payload.org,
        workspaceId: payload.ws,
        scopes: payload.scp || [],
      };
    } catch {
      return null;
    }
  }
}

export const oauthService = new OAuthService();
