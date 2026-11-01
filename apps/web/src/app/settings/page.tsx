"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Shield,
  Users,
  Mail,
  Key,
  FileText,
  Database,
  Check,
  Copy,
  AlertTriangle,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  Clock,
  Plus,
  Lock,
  Plug,
  Bell,
  Radio,
  Send,
  Code,
} from "lucide-react";

type TabType =
  | "general"
  | "members"
  | "invitations"
  | "api-keys"
  | "integrations"
  | "notifications"
  | "webhooks"
  | "audit"
  | "retention";

interface Member {
  id: string;
  userId: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
  } | null;
}

interface Invitation {
  id: string;
  email: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
  status: "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";
  expiresAt: string;
  createdAt: string;
}

interface ApiKeyItem {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  lastUsedAt?: string;
  expiresAt?: string;
  revokedAt?: string;
  createdAt: string;
}

interface AuditLog {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  userId?: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
  createdAt: string;
}

interface ConnectionItem {
  id: string;
  organizationId: string;
  connectorId: string;
  name: string;
  status: "ACTIVE" | "DISABLED" | "REVOKED";
  authType: string;
  maskedSummary: Record<string, string>;
  lastTestedAt?: string | null;
  lastTestStatus?: string | null;
  createdAt: string;
}

interface ConnectorItem {
  id: string;
  name: string;
  description: string;
  version: string;
  category: string;
  authType: string;
  authConfigFields: Array<{
    name: string;
    label: string;
    type: string;
    required?: boolean;
    defaultValue?: any;
    description?: string;
  }>;
  operations: Array<{
    id: string;
    name: string;
    description?: string;
    isIdempotent?: boolean;
  }>;
  icon?: string;
}

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>("general");
  const [orgId, setOrgId] = useState<string>("org_default");
  const [loading, setLoading] = useState<boolean>(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Settings State
  const [name, setName] = useState("Acme Operations");
  const [timezone, setTimezone] = useState("UTC");
  const [billingEmail, setBillingEmail] = useState("security@acme.com");
  const [enforce2FA, setEnforce2FA] = useState(false);
  const [allowedIpRanges, setAllowedIpRanges] = useState(
    "10.0.0.0/8, 192.168.1.0/24",
  );
  const [executionRetentionDays, setExecutionRetentionDays] = useState(90);
  const [auditRetentionDays, setAuditRetentionDays] = useState(365);
  const [userRole, setUserRole] = useState<string>("OWNER");

  // Members State
  const [members, setMembers] = useState<Member[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [selectedNewOwner, setSelectedNewOwner] = useState("");

  // Invitations State
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"ADMIN" | "MEMBER" | "VIEWER">(
    "MEMBER",
  );
  const [revealedInviteUrl, setRevealedInviteUrl] = useState<string | null>(
    null,
  );

  // API Keys State
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyExpiryDays, setKeyExpiryDays] = useState("90");
  const [keyScopes, setKeyScopes] = useState<string[]>([
    "workflow:read",
    "workflow:execute",
  ]);
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditFilterAction, setAuditFilterAction] = useState("");

  // Retention Cleanup State
  const [cleanupResult, setCleanupResult] = useState<any>(null);

  // Integrations & Connectors State
  const [connectors, setConnectors] = useState<ConnectorItem[]>([]);
  const [connections, setConnections] = useState<ConnectionItem[]>([]);
  const [showAddConnModal, setShowAddConnModal] = useState(false);
  const [showRotateModal, setShowRotateModal] = useState(false);
  const [selectedConnForRotate, setSelectedConnForRotate] =
    useState<ConnectionItem | null>(null);
  const [rotateCredentialValue, setRotateCredentialValue] = useState("");
  const [newConnName, setNewConnName] = useState("");
  const [newConnConnectorId, setNewConnConnectorId] = useState("http-api");
  const [newConnAuthType, setNewConnAuthType] = useState("API_KEY");
  const [newConnFields, setNewConnFields] = useState<Record<string, string>>(
    {},
  );
  const [testingConnectionId, setTestingConnectionId] = useState<string | null>(
    null,
  );
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    latencyMs?: number;
    errorCategory?: string;
  } | null>(null);

  // Notification Preferences State
  const [notificationPrefs, setNotificationPrefs] = useState<
    Array<{ category: string; inApp: boolean; email: boolean }>
  >([
    { category: "WORKFLOW", inApp: true, email: false },
    { category: "APPROVAL", inApp: true, email: true },
    { category: "COLLABORATION", inApp: true, email: false },
    { category: "SYSTEM", inApp: true, email: true },
    { category: "SECURITY", inApp: true, email: true },
  ]);

  // Outbound Webhooks State
  const [webhookSubs, setWebhookSubs] = useState<any[]>([]);
  const [selectedSubDeliveries, setSelectedSubDeliveries] = useState<any[]>([]);
  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [showAddWebhookModal, setShowAddWebhookModal] = useState(false);
  const [newWebhookName, setNewWebhookName] = useState("");
  const [newWebhookUrl, setNewWebhookUrl] = useState("");
  const [newWebhookEvents, setNewWebhookEvents] = useState("*");
  const [revealedWebhookSecret, setRevealedWebhookSecret] = useState<
    string | null
  >(null);

  useEffect(() => {
    fetchInitialData();
  }, []);

  async function fetchInitialData() {
    setLoading(true);
    try {
      // 1. Fetch current user & organization
      const meRes = await fetch("/api/v1/auth/me");
      if (meRes.ok) {
        const meData = await meRes.json();
        const activeOrgId = meData.data?.organization?.id;
        if (activeOrgId) {
          setOrgId(activeOrgId);
          setUserRole(meData.data.role || "OWNER");
          await loadOrgData(activeOrgId);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function loadOrgData(targetOrgId: string) {
    try {
      // Fetch Settings
      const settingsRes = await fetch(
        `/api/v1/organizations/${targetOrgId}/settings`,
      );
      if (settingsRes.ok) {
        const s = (await settingsRes.json()).data;
        setName(s.name || "");
        setTimezone(s.timezone || "UTC");
        setBillingEmail(s.billingEmail || "");
        setEnforce2FA(!!s.enforce2FA);
        setAllowedIpRanges(
          Array.isArray(s.allowedIpRanges) ? s.allowedIpRanges.join(", ") : "",
        );
        setExecutionRetentionDays(s.executionRetentionDays || 90);
        setAuditRetentionDays(s.auditRetentionDays || 365);
      }

      // Fetch Members
      const membersRes = await fetch(
        `/api/v1/organizations/${targetOrgId}/members`,
      );
      if (membersRes.ok) {
        setMembers((await membersRes.json()).data || []);
      }

      // Fetch Invitations
      const invRes = await fetch(
        `/api/v1/organizations/${targetOrgId}/invitations`,
      );
      if (invRes.ok) {
        setInvitations((await invRes.json()).data || []);
      }

      // Fetch API Keys
      const keysRes = await fetch(
        `/api/v1/organizations/${targetOrgId}/api-keys`,
      );
      if (keysRes.ok) {
        setApiKeys((await keysRes.json()).data || []);
      }

      // Fetch Audit Logs
      const auditRes = await fetch(
        `/api/v1/organizations/${targetOrgId}/audit-logs?pageSize=30`,
      );
      if (auditRes.ok) {
        setAuditLogs((await auditRes.json()).data || []);
      }

      // Fetch Connectors Catalog
      const connCatalogRes = await fetch("/api/v1/connectors");
      if (connCatalogRes.ok) {
        setConnectors((await connCatalogRes.json()).data || []);
      }

      // Fetch Connections
      const connsRes = await fetch(
        `/api/v1/organizations/${targetOrgId}/connections`,
      );
      if (connsRes.ok) {
        setConnections((await connsRes.json()).data || []);
      }

      // Fetch Notification Preferences
      const prefsRes = await fetch("/api/v1/notifications/preferences");
      if (prefsRes.ok) {
        const pData = await prefsRes.json();
        if (pData.success && Array.isArray(pData.data)) {
          setNotificationPrefs(pData.data);
        }
      }

      // Fetch Webhook Subscriptions
      const subsRes = await fetch("/api/v1/webhooks/subscriptions");
      if (subsRes.ok) {
        const subData = await subsRes.json();
        if (subData.success && Array.isArray(subData.data)) {
          setWebhookSubs(subData.data);
        }
      }
    } catch (err) {
      console.error("Failed to load org data", err);
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setStatusMessage(null);
    try {
      const res = await fetch(`/api/v1/organizations/${orgId}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          timezone,
          billingEmail: billingEmail || null,
          enforce2FA,
          allowedIpRanges: allowedIpRanges
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
          executionRetentionDays: Number(executionRetentionDays),
          auditRetentionDays: Number(auditRetentionDays),
        }),
      });

      if (res.ok) {
        setStatusMessage("Settings saved successfully.");
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to update settings.");
      }
    } catch (err) {
      alert("Error saving settings.");
    }
  }

  async function handleTransferOwnership() {
    if (!selectedNewOwner) return;
    if (
      !confirm(
        "Are you sure? You will be demoted to Administrator and transfer total control of the organization.",
      )
    ) {
      return;
    }

    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/transfer-ownership`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newOwnerUserId: selectedNewOwner }),
        },
      );

      if (res.ok) {
        alert("Ownership successfully transferred.");
        setShowTransferModal(false);
        loadOrgData(orgId);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Ownership transfer failed.");
      }
    } catch (err) {
      alert("Failed to transfer ownership.");
    }
  }

  async function handleRoleChange(membershipId: string, newRole: string) {
    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/members/${membershipId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role: newRole }),
        },
      );
      if (res.ok) {
        loadOrgData(orgId);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to update role.");
      }
    } catch (err) {
      alert("Network error updating role.");
    }
  }

  async function handleRemoveMember(membershipId: string) {
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/members/${membershipId}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        loadOrgData(orgId);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to remove member.");
      }
    } catch (err) {
      alert("Error removing member.");
    }
  }

  async function handleCreateInvitation(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/v1/organizations/${orgId}/invitations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (res.ok) {
        const data = await res.json();
        setRevealedInviteUrl(data.data.invitationUrl);
        setInviteEmail("");
        loadOrgData(orgId);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to create invitation.");
      }
    } catch (err) {
      alert("Error creating invitation.");
    }
  }

  async function handleRevokeInvitation(invitationId: string) {
    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/invitations/${invitationId}/revoke`,
        {
          method: "POST",
        },
      );
      if (res.ok) {
        loadOrgData(orgId);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCreateApiKey(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/v1/organizations/${orgId}/api-keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: keyName,
          scopes: keyScopes,
          expiresInDays: keyExpiryDays ? Number(keyExpiryDays) : undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRevealedToken(data.data.token);
        setShowApiKeyModal(false);
        setKeyName("");
        loadOrgData(orgId);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Failed to generate API key.");
      }
    } catch (err) {
      alert("Error generating API key.");
    }
  }

  async function handleRevokeApiKey(keyId: string) {
    if (
      !confirm(
        "Revoking this API key is irreversible. Any integrations using it will immediately fail.",
      )
    ) {
      return;
    }
    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/api-keys/${keyId}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        loadOrgData(orgId);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleRunRetention(dryRun: boolean) {
    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/retention/cleanup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dryRun }),
        },
      );
      if (res.ok) {
        const data = await res.json();
        setCleanupResult(data.data);
      } else {
        const err = await res.json();
        alert(err.error?.message || "Retention cleanup failed.");
      }
    } catch (err) {
      alert("Retention cleanup execution error.");
    }
  }

  async function handleCreateConnection(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch(`/api/v1/organizations/${orgId}/connections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newConnName,
          connectorId: newConnConnectorId,
          authType: newConnAuthType,
          credentialData: newConnFields,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error?.message || "Failed to create connection");
        return;
      }
      setStatusMessage(`Connection '${newConnName}' created successfully.`);
      setShowAddConnModal(false);
      setNewConnName("");
      setNewConnFields({});
      setTestResult(null);
      await loadOrgData(orgId);
    } catch {
      alert("Error creating connection.");
    }
  }

  async function handleTestConnection(connId: string) {
    setTestingConnectionId(connId);
    setTestResult(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/connections/${connId}/test`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setTestResult(data.data);
        await loadOrgData(orgId);
      } else {
        setTestResult({
          success: false,
          message: data.error?.message || "Test request failed",
          errorCategory: data.error?.code,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Failed to test connection",
        errorCategory: "NETWORK_ERROR",
      });
    } finally {
      setTestingConnectionId(null);
    }
  }

  async function handleTestDraft() {
    setTestingConnectionId("draft");
    setTestResult(null);
    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/connections/test-draft`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            connectorId: newConnConnectorId,
            credentialData: newConnFields,
          }),
        },
      );
      const data = await res.json();
      if (res.ok) {
        setTestResult(data.data);
      } else {
        setTestResult({
          success: false,
          message: data.error?.message || "Draft test failed",
          errorCategory: data.error?.code,
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Network error",
        errorCategory: "NETWORK_ERROR",
      });
    } finally {
      setTestingConnectionId(null);
    }
  }

  async function handleRotateConnection(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedConnForRotate) return;
    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/connections/${selectedConnForRotate.id}/rotate`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            credentialData: {
              apiKey: rotateCredentialValue,
              token: rotateCredentialValue,
              password: rotateCredentialValue,
              webhookUrl: rotateCredentialValue,
            },
          }),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        alert(data.error?.message || "Rotation failed");
        return;
      }
      setStatusMessage(
        `Credentials for '${selectedConnForRotate.name}' rotated successfully.`,
      );
      setShowRotateModal(false);
      setSelectedConnForRotate(null);
      setRotateCredentialValue("");
      await loadOrgData(orgId);
    } catch {
      alert("Error rotating connection credentials.");
    }
  }

  async function handleRevokeConnection(connId: string, name: string) {
    if (
      !confirm(
        `Are you sure you want to revoke and delete connection '${name}'?`,
      )
    )
      return;
    try {
      const res = await fetch(
        `/api/v1/organizations/${orgId}/connections/${connId}`,
        {
          method: "DELETE",
        },
      );
      if (res.ok) {
        setStatusMessage(`Connection '${name}' was revoked.`);
        await loadOrgData(orgId);
      } else {
        const data = await res.json();
        alert(data.error?.message || "Failed to revoke connection");
      }
    } catch {
      alert("Error revoking connection.");
    }
  }

  async function handleSaveNotificationPrefs(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await fetch("/api/v1/notifications/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preferences: notificationPrefs }),
      });
      if (res.ok) {
        setStatusMessage("Notification preferences saved.");
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        alert("Failed to save notification preferences.");
      }
    } catch {
      alert("Error saving notification preferences.");
    }
  }

  async function handleCreateWebhook(e: React.FormEvent) {
    e.preventDefault();
    try {
      const events = newWebhookEvents
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch("/api/v1/webhooks/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newWebhookName,
          url: newWebhookUrl,
          events: events.length > 0 ? events : ["*"],
          enabled: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error?.message || "Failed to create webhook subscription");
        return;
      }
      setRevealedWebhookSecret(data.data.secret);
      setShowAddWebhookModal(false);
      setNewWebhookName("");
      setNewWebhookUrl("");
      setNewWebhookEvents("*");
      await loadOrgData(orgId);
    } catch {
      alert("Error creating webhook subscription.");
    }
  }

  async function handleRotateWebhookSecret(id: string) {
    if (
      !confirm(
        "Rotating the signing secret will invalidate the previous secret immediately. Continue?",
      )
    )
      return;
    try {
      const res = await fetch(
        `/api/v1/webhooks/subscriptions/${id}/rotate-secret`,
        {
          method: "POST",
        },
      );
      const data = await res.json();
      if (res.ok) {
        setRevealedWebhookSecret(data.data.newSecret);
      } else {
        alert(data.error?.message || "Failed to rotate secret");
      }
    } catch {
      alert("Error rotating secret.");
    }
  }

  async function handleDeleteWebhook(id: string) {
    if (!confirm("Are you sure you want to delete this webhook destination?"))
      return;
    try {
      const res = await fetch(`/api/v1/webhooks/subscriptions/${id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setStatusMessage("Webhook subscription deleted.");
        await loadOrgData(orgId);
      }
    } catch {
      alert("Error deleting webhook.");
    }
  }

  async function handleLoadDeliveries(id: string) {
    setSelectedSubId(selectedSubId === id ? null : id);
    if (selectedSubId === id) return;
    try {
      const res = await fetch(
        `/api/v1/webhooks/subscriptions/${id}/deliveries`,
      );
      if (res.ok) {
        const data = await res.json();
        setSelectedSubDeliveries(data.data || []);
      }
    } catch {
      // ignore
    }
  }

  async function handleRetryDelivery(deliveryId: string) {
    try {
      const res = await fetch(
        `/api/v1/webhooks/deliveries/${deliveryId}/retry`,
        {
          method: "POST",
        },
      );
      const data = await res.json();
      if (res.ok) {
        setStatusMessage(`Delivery replayed with outcome: ${data.data.status}`);
        if (selectedSubId) {
          handleLoadDeliveries(selectedSubId);
        }
      } else {
        alert(data.error?.message || "Failed to replay delivery");
      }
    } catch {
      alert("Error replaying delivery.");
    }
  }

  return (
    <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-50 border border-indigo-200 rounded-lg text-indigo-600">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
                  Enterprise Security & Organization Administration
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Manage organization governance, roles, team invitations, API
                  credentials, and audit logs.
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-full border border-slate-300">
              Role: {userRole}
            </span>
          </div>
        </div>

        {/* Status banner */}
        {statusMessage && (
          <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-md text-emerald-800 text-sm flex items-center gap-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Revealed Secret Banner */}
        {revealedToken && (
          <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              <span>
                Copy your new API Key now. It will never be displayed again!
              </span>
            </div>
            <div className="flex items-center gap-2">
              <code className="bg-white dark:bg-slate-900 px-3 py-2 border border-amber-200 rounded text-xs font-mono select-all flex-1 text-slate-900 dark:text-slate-100">
                {revealedToken}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(revealedToken);
                  setCopiedToken(true);
                  setTimeout(() => setCopiedToken(false), 2000);
                }}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium rounded flex items-center gap-1.5 transition"
              >
                {copiedToken ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
                <span>{copiedToken ? "Copied" : "Copy"}</span>
              </button>
              <button
                onClick={() => setRevealedToken(null)}
                className="px-3 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-xs font-medium rounded transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
          {[
            { id: "general", label: "General Settings", icon: Shield },
            { id: "members", label: "Members & Roles", icon: Users },
            { id: "invitations", label: "Invitations", icon: Mail },
            { id: "api-keys", label: "API Credentials", icon: Key },
            {
              id: "integrations",
              label: "Integrations & Connectors",
              icon: Plug,
            },
            { id: "notifications", label: "Notifications", icon: Bell },
            { id: "webhooks", label: "Outbound Webhooks", icon: Radio },
            { id: "audit", label: "Security Audit Trail", icon: FileText },
            { id: "retention", label: "Data Retention", icon: Database },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition -mb-px whitespace-nowrap ${
                  active
                    ? "border-indigo-600 text-indigo-600"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:text-slate-100 hover:border-slate-300"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
          <Link
            href="/settings/developer"
            className="flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 border-transparent text-indigo-600 hover:text-indigo-700 hover:border-indigo-400 transition -mb-px whitespace-nowrap ml-auto"
          >
            <Code className="w-4 h-4 text-indigo-500" />
            <span>Developer Portal (DLQ & SDK)</span>
          </Link>
        </div>

        {/* TAB 1: GENERAL SETTINGS */}
        {activeTab === "general" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm max-w-4xl">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
              Organization Policy & Security Defaults
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
              Configure organizational display settings, regional timezones, 2FA
              requirements, and IP boundary allowlists.
            </p>

            <form onSubmit={handleSaveSettings} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    Organization Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    System Timezone
                  </label>
                  <select
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="UTC">
                      UTC (Universal Coordinated Time)
                    </option>
                    <option value="America/New_York">
                      America/New_York (EST/EDT)
                    </option>
                    <option value="America/Chicago">
                      America/Chicago (CST/CDT)
                    </option>
                    <option value="America/Los_Angeles">
                      America/Los_Angeles (PST/PDT)
                    </option>
                    <option value="Europe/London">
                      Europe/London (GMT/BST)
                    </option>
                    <option value="Asia/Tokyo">Asia/Tokyo (JST)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                    Administrative / Security Contact Email
                  </label>
                  <input
                    type="email"
                    value={billingEmail}
                    onChange={(e) => setBillingEmail(e.target.value)}
                    placeholder="security@example.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex items-center gap-3 pt-6">
                  <input
                    type="checkbox"
                    id="enforce2fa"
                    checked={enforce2FA}
                    onChange={(e) => setEnforce2FA(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <label
                    htmlFor="enforce2fa"
                    className="text-sm font-medium text-slate-700 dark:text-slate-300"
                  >
                    Enforce Two-Factor Authentication (2FA) for all members
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-2">
                  Allowed IP CIDR Ranges (Comma Separated)
                </label>
                <input
                  type="text"
                  value={allowedIpRanges}
                  onChange={(e) => setAllowedIpRanges(e.target.value)}
                  placeholder="10.0.0.0/8, 192.168.1.0/24"
                  className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 dark:text-slate-100 font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-slate-400 mt-1">
                  Restrict API and management portal access to authorized
                  network segments.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end">
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md shadow-sm transition"
                >
                  Save Organization Settings
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB 2: MEMBERS & ROLES */}
        {activeTab === "members" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Organization Members & Role-Based Access
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Assign administrative, execution, or read-only roles to your
                  organization team.
                </p>
              </div>
              <div className="flex items-center gap-3">
                {userRole === "OWNER" && (
                  <button
                    onClick={() => setShowTransferModal(true)}
                    className="px-3.5 py-2 border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-800 text-sm font-medium rounded-md flex items-center gap-1.5 transition"
                  >
                    <Lock className="w-4 h-4 text-amber-600" />
                    <span>Transfer Ownership</span>
                  </button>
                )}
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md flex items-center gap-1.5 transition"
                >
                  <Plus className="w-4 h-4" />
                  <span>Invite Member</span>
                </button>
              </div>
            </div>

            {/* Member List */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Member</th>
                    <th className="px-4 py-3">Email</th>
                    <th className="px-4 py-3">Current Role</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      className="hover:bg-slate-50 dark:bg-slate-800/50 transition"
                    >
                      <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                        {m.user?.firstName || m.user?.lastName
                          ? `${m.user?.firstName || ""} ${m.user?.lastName || ""}`.trim()
                          : "Team Member"}
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                        {m.user?.email || "Unknown"}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={m.role}
                          disabled={
                            userRole !== "OWNER" && userRole !== "ADMIN"
                          }
                          onChange={(e) =>
                            handleRoleChange(m.id, e.target.value)
                          }
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded font-medium bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value="OWNER">OWNER</option>
                          <option value="ADMIN">ADMIN</option>
                          <option value="MEMBER">MEMBER</option>
                          <option value="VIEWER">VIEWER</option>
                        </select>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleRemoveMember(m.id)}
                          className="text-rose-600 hover:text-rose-800 text-xs font-medium p-1 rounded hover:bg-rose-50 transition"
                          title="Remove Member"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: INVITATIONS */}
        {activeTab === "invitations" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Pending & Historical Invitations
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Track single-use, cryptographically hashed invitations issued
                  to new team members.
                </p>
              </div>
              <button
                onClick={() => setShowInviteModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>New Invitation</span>
              </button>
            </div>

            {revealedInviteUrl && (
              <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-md text-indigo-900 space-y-1">
                <div className="font-semibold text-sm">Invitation Created!</div>
                <p className="text-xs text-indigo-700">
                  Share this one-time link with the invited person:
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <code className="bg-white dark:bg-slate-900 px-3 py-1.5 border border-indigo-300 rounded text-xs flex-1 select-all font-mono">
                    {revealedInviteUrl}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(revealedInviteUrl);
                      alert("Invitation URL copied to clipboard.");
                    }}
                    className="px-3 py-1.5 bg-indigo-600 text-white text-xs font-medium rounded hover:bg-indigo-700"
                  >
                    Copy Link
                  </button>
                </div>
              </div>
            )}

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Recipient Email</th>
                    <th className="px-4 py-3">Assigned Role</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Expires At</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invitations.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        className="px-4 py-6 text-center text-slate-400 text-sm"
                      >
                        No invitations sent yet.
                      </td>
                    </tr>
                  ) : (
                    invitations.map((inv) => (
                      <tr
                        key={inv.id}
                        className="hover:bg-slate-50 dark:bg-slate-800/50 transition"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {inv.email}
                        </td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded text-xs font-mono">
                            {inv.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              inv.status === "PENDING"
                                ? "bg-amber-100 text-amber-800"
                                : inv.status === "ACCEPTED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {inv.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-500 dark:text-slate-400 text-xs">
                          {new Date(inv.expiresAt).toLocaleDateString()}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {inv.status === "PENDING" && (
                            <button
                              onClick={() => handleRevokeInvitation(inv.id)}
                              className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: API CREDENTIALS */}
        {activeTab === "api-keys" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  API Credentials & Service Access
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Generate scoped API keys for programmatic execution and CI/CD
                  automation. Plaintext keys are never stored.
                </p>
              </div>
              <button
                onClick={() => setShowApiKeyModal(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-md flex items-center gap-1.5 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Create API Key</span>
              </button>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Key Name</th>
                    <th className="px-4 py-3">Prefix</th>
                    <th className="px-4 py-3">Authorized Scopes</th>
                    <th className="px-4 py-3">Last Used</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {apiKeys.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-6 text-center text-slate-400 text-sm"
                      >
                        No API credentials generated yet.
                      </td>
                    </tr>
                  ) : (
                    apiKeys.map((k) => (
                      <tr
                        key={k.id}
                        className="hover:bg-slate-50 dark:bg-slate-800/50 transition"
                      >
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-slate-100">
                          {k.name}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {k.keyPrefix}...
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {k.scopes.map((s) => (
                              <span
                                key={s}
                                className="px-1.5 py-0.5 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded text-xs"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                          {k.lastUsedAt
                            ? new Date(k.lastUsedAt).toLocaleString()
                            : "Never"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              k.revokedAt
                                ? "bg-rose-100 text-rose-800"
                                : k.expiresAt &&
                                    new Date() > new Date(k.expiresAt)
                                  ? "bg-slate-200 text-slate-700 dark:text-slate-300"
                                  : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {k.revokedAt ? "REVOKED" : "ACTIVE"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          {!k.revokedAt && (
                            <button
                              onClick={() => handleRevokeApiKey(k.id)}
                              className="text-xs text-rose-600 hover:text-rose-800 font-medium"
                            >
                              Revoke
                            </button>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: AUDIT LOGS */}
        {activeTab === "audit" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Security Audit Trail
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Immutable audit records of administrative, authorization, and
                  sensitive lifecycle operations.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Filter by action..."
                  value={auditFilterAction}
                  onChange={(e) => setAuditFilterAction(e.target.value)}
                  className="px-3 py-1.5 border border-slate-300 rounded text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Timestamp (UTC)</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Resource Type</th>
                    <th className="px-4 py-3">Resource ID</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Metadata</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs
                    .filter((l) =>
                      auditFilterAction
                        ? l.action.includes(auditFilterAction)
                        : true,
                    )
                    .map((log) => (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50 dark:bg-slate-800/50 transition"
                      >
                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400 font-mono">
                          {new Date(log.createdAt).toISOString()}
                        </td>
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-indigo-700">
                          {log.action}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400">
                          {log.resourceType}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-mono truncate max-w-[120px]">
                          {log.resourceId}
                        </td>
                        <td className="px-4 py-3 text-xs text-slate-600 dark:text-slate-400 font-mono truncate max-w-[100px]">
                          {log.userId || "System"}
                        </td>
                        <td className="px-4 py-3 text-xs font-mono text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
                          {log.metadata ? JSON.stringify(log.metadata) : "-"}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: RETENTION */}
        {activeTab === "retention" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-6 max-w-4xl">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Data Retention & Privacy Controls
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Automated pruning for completed workflow runs and security logs
                according to organizational policy.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Execution Retention
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {executionRetentionDays} Days
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Terminal executions (SUCCEEDED, FAILED, CANCELLED) older than
                  this window are eligible for purge.
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg">
                <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  Audit Log Retention
                </div>
                <div className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1">
                  {auditRetentionDays} Days
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Security logs are preserved for compliance before scheduled
                  rotation.
                </p>
              </div>
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg space-y-3">
              <div className="flex items-center gap-2 font-semibold text-sm text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Active Execution Invariant Guarantee</span>
              </div>
              <p className="text-xs text-amber-800">
                Under no circumstances will non-terminal workflows (QUEUED,
                RUNNING, WAITING_APPROVAL, WAITING_DELAY) be pruned by retention
                policies.
              </p>
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => handleRunRetention(true)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-medium rounded-md transition"
                >
                  Run Dry Run Assessment
                </button>
                <button
                  onClick={() => {
                    if (
                      confirm(
                        "Confirm execution purge? All eligible terminal records will be permanently removed.",
                      )
                    ) {
                      handleRunRetention(false);
                    }
                  }}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-medium rounded-md transition"
                >
                  Execute Purge Now
                </button>
              </div>
            </div>

            {cleanupResult && (
              <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-md text-emerald-900 text-xs font-mono space-y-1">
                <div className="font-bold">Cleanup Outcome:</div>
                <div>Dry Run: {cleanupResult.dryRun ? "YES" : "NO"}</div>
                <div>
                  Candidate Terminal Executions:{" "}
                  {cleanupResult.candidateExecutionsCount}
                </div>
                <div>
                  Pruned Executions: {cleanupResult.prunedExecutionsCount}
                </div>
                <div>Cutoff Timestamp: {cleanupResult.cutoff}</div>
              </div>
            )}
          </div>
        )}

        {/* TAB 5: INTEGRATIONS & CONNECTORS */}
        {activeTab === "integrations" && (
          <div className="space-y-6">
            {/* Header / Add connection button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  Configured Integration Connections
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Manage organization-scoped authenticated connections with
                  AES-256-GCM encryption at rest, health probes, and credential
                  rotation.
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAddConnModal(true);
                  setTestResult(null);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-md shadow-xs transition"
              >
                <Plus className="w-4 h-4" />
                <span>Add Connection</span>
              </button>
            </div>

            {/* Test result banner if active */}
            {testResult && (
              <div
                className={`p-4 rounded-lg border text-xs space-y-1 ${
                  testResult.success
                    ? "bg-emerald-50 border-emerald-300 text-emerald-900"
                    : "bg-red-50 border-red-300 text-red-900"
                }`}
              >
                <div className="flex items-center justify-between font-bold">
                  <span>
                    {testResult.success
                      ? "âœ“ Connection Test Succeeded"
                      : "âœ• Connection Test Failed"}
                  </span>
                  {testResult.latencyMs !== undefined && (
                    <span>{testResult.latencyMs}ms</span>
                  )}
                </div>
                <div>{testResult.message}</div>
                {testResult.errorCategory && (
                  <div className="text-[11px] font-mono text-red-700">
                    Category: {testResult.errorCategory}
                  </div>
                )}
              </div>
            )}

            {/* Connections Table */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm text-slate-700 dark:text-slate-300">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold uppercase text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-4 py-3">Connection Name</th>
                    <th className="px-4 py-3">Connector Service</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Masked Credentials</th>
                    <th className="px-4 py-3">Last Test Diagnostics</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {connections.length === 0 ? (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-slate-500 dark:text-slate-400 text-xs"
                      >
                        No active connections configured yet. Click "Add
                        Connection" to connect HTTP, Email, or Slack.
                      </td>
                    </tr>
                  ) : (
                    connections.map((conn) => (
                      <tr
                        key={conn.id}
                        className="hover:bg-slate-50 dark:bg-slate-800/50 transition"
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {conn.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {conn.id}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-indigo-700">
                          {conn.connectorId}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              conn.status === "ACTIVE"
                                ? "bg-emerald-100 text-emerald-800"
                                : conn.status === "DISABLED"
                                  ? "bg-slate-200 text-slate-700 dark:text-slate-300"
                                  : "bg-red-100 text-red-800"
                            }`}
                          >
                            {conn.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-400">
                          {Object.entries(conn.maskedSummary || {})
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(", ") || "â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {conn.lastTestedAt ? (
                            <div>
                              <span
                                className={`px-1.5 py-0.5 rounded text-[10px] font-semibold mr-1.5 ${
                                  conn.lastTestStatus === "SUCCESS"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : "bg-red-100 text-red-700"
                                }`}
                              >
                                {conn.lastTestStatus}
                              </span>
                              <span className="text-[11px] text-slate-400 font-mono">
                                {new Date(
                                  conn.lastTestedAt,
                                ).toLocaleTimeString()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs italic">
                              Never tested
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right space-x-1.5">
                          <button
                            onClick={() => handleTestConnection(conn.id)}
                            disabled={testingConnectionId === conn.id}
                            className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 dark:bg-slate-800/50 font-medium text-slate-700 dark:text-slate-300 disabled:opacity-50"
                          >
                            {testingConnectionId === conn.id
                              ? "Testing..."
                              : "Test"}
                          </button>
                          <button
                            onClick={() => {
                              setSelectedConnForRotate(conn);
                              setRotateCredentialValue("");
                              setShowRotateModal(true);
                            }}
                            className="px-2.5 py-1 text-xs border border-indigo-200 text-indigo-700 rounded hover:bg-indigo-50 font-medium"
                          >
                            Rotate
                          </button>
                          <button
                            onClick={() =>
                              handleRevokeConnection(conn.id, conn.name)
                            }
                            className="px-2.5 py-1 text-xs text-red-600 hover:text-red-800 font-medium"
                          >
                            Revoke
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Available Connectors Registry Catalog */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Connector Registry Catalog
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Standardized, typed connector specifications available for
                  workflow execution and connection configuration.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {connectors.map((c) => (
                  <div
                    key={c.id}
                    className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3 bg-slate-50 dark:bg-slate-800/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-semibold rounded uppercase">
                        {c.category}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        v{c.version}
                      </span>
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 dark:text-slate-100 text-sm">
                        {c.name}
                      </h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2">
                        {c.description}
                      </p>
                    </div>
                    <div>
                      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                        Supported Operations
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {c.operations.map((op) => (
                          <span
                            key={op.id}
                            className="px-2 py-0.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-[10px] font-mono text-slate-700 dark:text-slate-300"
                          >
                            {op.id}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* MODAL: TRANSFER OWNERSHIP */}
        {showTransferModal && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md w-full shadow-xl space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Transfer Organization Ownership
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Select an existing member to assume total control of this
                organization. You will remain an Administrator.
              </p>
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1">
                  Select New Owner
                </label>
                <select
                  value={selectedNewOwner}
                  onChange={(e) => setSelectedNewOwner(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900 dark:text-slate-100"
                >
                  <option value="">-- Choose Member --</option>
                  {members.map((m) => (
                    <option key={m.userId} value={m.userId}>
                      {m.user?.email || m.userId} ({m.role})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setShowTransferModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 dark:text-slate-300 text-sm font-medium rounded hover:bg-slate-50 dark:bg-slate-800/50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTransferOwnership}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded"
                >
                  Confirm Transfer
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL: INVITE MEMBER */}
        {showInviteModal && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md w-full shadow-xl space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Invite New Member
              </h3>
              <form onSubmit={handleCreateInvitation} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    required
                    placeholder="teammate@company.com"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Assign Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900 dark:text-slate-100"
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="MEMBER">MEMBER</option>
                    <option value="VIEWER">VIEWER</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 dark:text-slate-300 text-sm font-medium rounded hover:bg-slate-50 dark:bg-slate-800/50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded"
                  >
                    Send Invitation
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: CREATE API KEY */}
        {showApiKeyModal && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md w-full shadow-xl space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Generate New API Key
              </h3>
              <form onSubmit={handleCreateApiKey} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Key Name / Service
                  </label>
                  <input
                    type="text"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    required
                    placeholder="e.g. CI/CD GitHub Action Runner"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Expiration (Days)
                  </label>
                  <input
                    type="number"
                    value={keyExpiryDays}
                    onChange={(e) => setKeyExpiryDays(e.target.value)}
                    min="1"
                    max="365"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Authorized Scopes
                  </label>
                  <div className="space-y-1.5 border border-slate-200 dark:border-slate-800 rounded p-3 text-xs">
                    {[
                      "workflow:read",
                      "workflow:execute",
                      "workflow:write",
                      "analytics:read",
                      "audit:read",
                    ].map((scope) => (
                      <label
                        key={scope}
                        className="flex items-center gap-2 text-slate-700 dark:text-slate-300"
                      >
                        <input
                          type="checkbox"
                          checked={keyScopes.includes(scope)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setKeyScopes([...keyScopes, scope]);
                            } else {
                              setKeyScopes(
                                keyScopes.filter((s) => s !== scope),
                              );
                            }
                          }}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-mono">{scope}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowApiKeyModal(false)}
                    className="px-4 py-2 border border-slate-300 text-slate-700 dark:text-slate-300 text-sm font-medium rounded hover:bg-slate-50 dark:bg-slate-800/50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded"
                  >
                    Generate Key
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: ADD CONNECTION */}
        {showAddConnModal && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-lg w-full shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Add Integration Connection
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Credentials are encrypted with AES-256-GCM authenticated
                encryption and never returned in plaintext.
              </p>

              {testResult && (
                <div
                  className={`p-3 rounded text-xs ${
                    testResult.success
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : "bg-red-50 text-red-800 border border-red-200"
                  }`}
                >
                  <div className="font-bold">
                    {testResult.success ? "Test Passed" : "Test Failed"}
                  </div>
                  <div>{testResult.message}</div>
                </div>
              )}

              <form onSubmit={handleCreateConnection} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Connection Name
                  </label>
                  <input
                    type="text"
                    value={newConnName}
                    onChange={(e) => setNewConnName(e.target.value)}
                    required
                    placeholder="e.g. Production Stripe API or Office Alerts"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900 dark:text-slate-100"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    Connector Service
                  </label>
                  <select
                    value={newConnConnectorId}
                    onChange={(e) => {
                      setNewConnConnectorId(e.target.value);
                      setNewConnFields({});
                      setTestResult(null);
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900 dark:text-slate-100"
                  >
                    <option value="http-api">HTTP & REST API (http-api)</option>
                    <option value="smtp-email">
                      SMTP / Email Notifications (smtp-email)
                    </option>
                    <option value="slack-webhook">
                      Slack Incoming Webhook (slack-webhook)
                    </option>
                  </select>
                </div>

                {newConnConnectorId === "http-api" && (
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-200 dark:border-slate-800">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Base URL (Optional)
                      </label>
                      <input
                        type="url"
                        placeholder="https://api.example.com"
                        value={newConnFields.baseUrl || ""}
                        onChange={(e) =>
                          setNewConnFields({
                            ...newConnFields,
                            baseUrl: e.target.value,
                          })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        API Key / Token (Secret)
                      </label>
                      <input
                        type="password"
                        placeholder="sk_live_..."
                        value={newConnFields.apiKey || ""}
                        onChange={(e) =>
                          setNewConnFields({
                            ...newConnFields,
                            apiKey: e.target.value,
                          })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                {newConnConnectorId === "smtp-email" && (
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-200 dark:border-slate-800">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          SMTP Host
                        </label>
                        <input
                          type="text"
                          placeholder="smtp.sendgrid.net"
                          value={newConnFields.host || ""}
                          onChange={(e) =>
                            setNewConnFields({
                              ...newConnFields,
                              host: e.target.value,
                            })
                          }
                          className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                          Port
                        </label>
                        <input
                          type="number"
                          placeholder="587"
                          value={newConnFields.port || "587"}
                          onChange={(e) =>
                            setNewConnFields({
                              ...newConnFields,
                              port: e.target.value,
                            })
                          }
                          className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Username / API Key
                      </label>
                      <input
                        type="text"
                        placeholder="apikey"
                        value={newConnFields.username || ""}
                        onChange={(e) =>
                          setNewConnFields({
                            ...newConnFields,
                            username: e.target.value,
                          })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Password / Secret
                      </label>
                      <input
                        type="password"
                        placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
                        value={newConnFields.password || ""}
                        onChange={(e) =>
                          setNewConnFields({
                            ...newConnFields,
                            password: e.target.value,
                          })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                      />
                    </div>
                  </div>
                )}

                {newConnConnectorId === "slack-webhook" && (
                  <div className="space-y-3 bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-200 dark:border-slate-800">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Incoming Webhook URL
                      </label>
                      <input
                        type="url"
                        placeholder="https://hooks.slack.com/services/..."
                        value={newConnFields.webhookUrl || ""}
                        onChange={(e) =>
                          setNewConnFields({
                            ...newConnFields,
                            webhookUrl: e.target.value,
                          })
                        }
                        required
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                        Default Channel (Optional)
                      </label>
                      <input
                        type="text"
                        placeholder="#general"
                        value={newConnFields.defaultChannel || ""}
                        onChange={(e) =>
                          setNewConnFields({
                            ...newConnFields,
                            defaultChannel: e.target.value,
                          })
                        }
                        className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                      />
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleTestDraft}
                    disabled={testingConnectionId === "draft"}
                    className="px-3 py-2 border border-slate-300 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded hover:bg-slate-50 dark:bg-slate-800/50 disabled:opacity-50"
                  >
                    {testingConnectionId === "draft"
                      ? "Testing..."
                      : "Test Connection"}
                  </button>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setShowAddConnModal(false)}
                      className="px-4 py-2 border border-slate-300 text-slate-700 dark:text-slate-300 text-sm font-medium rounded hover:bg-slate-50 dark:bg-slate-800/50"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded"
                    >
                      Save Connection
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* TAB: NOTIFICATIONS */}
        {activeTab === "notifications" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm max-w-4xl space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
                Notification Preferences
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Choose how and when you receive operational alerts, approval
                decisions, and workflow updates.
              </p>
            </div>

            <form onSubmit={handleSaveNotificationPrefs} className="space-y-4">
              <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-200">
                <div className="grid grid-cols-12 bg-slate-50 dark:bg-slate-800/50 p-3 text-xs font-semibold text-slate-600 dark:text-slate-400">
                  <div className="col-span-6">Category</div>
                  <div className="col-span-3 text-center">
                    In-App Notification
                  </div>
                  <div className="col-span-3 text-center">Email Dispatch</div>
                </div>

                {notificationPrefs.map((pref, idx) => (
                  <div
                    key={pref.category}
                    className="grid grid-cols-12 p-3 text-xs items-center hover:bg-slate-50 dark:bg-slate-800/50"
                  >
                    <div className="col-span-6">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 block">
                        {pref.category}
                      </span>
                      <span className="text-slate-400 text-[11px]">
                        {pref.category === "WORKFLOW" &&
                          "Execution failures, success summaries, and publishing updates."}
                        {pref.category === "APPROVAL" &&
                          "Approval decisions assigned to you or decided by peers."}
                        {pref.category === "COLLABORATION" &&
                          "Team invitations, role updates, and ownership assignments."}
                        {pref.category === "SYSTEM" &&
                          "Integration connection failures and scheduled execution errors."}
                        {pref.category === "SECURITY" &&
                          "Credential rotations, key revocations, and IP boundary alerts."}
                      </span>
                    </div>

                    <div className="col-span-3 flex justify-center">
                      <input
                        type="checkbox"
                        checked={pref.inApp}
                        onChange={(e) => {
                          const updated = [...notificationPrefs];
                          updated[idx].inApp = e.target.checked;
                          setNotificationPrefs(updated);
                        }}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                    </div>

                    <div className="col-span-3 flex justify-center">
                      <input
                        type="checkbox"
                        checked={pref.email}
                        onChange={(e) => {
                          const updated = [...notificationPrefs];
                          updated[idx].email = e.target.checked;
                          setNotificationPrefs(updated);
                        }}
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-xs"
                >
                  Save Notification Preferences
                </button>
              </div>
            </form>
          </div>
        )}

        {/* TAB: OUTBOUND WEBHOOKS */}
        {activeTab === "webhooks" && (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-6 shadow-sm max-w-5xl space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 mb-1">
                  Outbound Webhooks
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Deliver signed domain events directly to external endpoints
                  with SSRF protections and automated retry.
                </p>
              </div>
              <button
                onClick={() => setShowAddWebhookModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-md shadow-xs"
              >
                <Plus className="w-4 h-4" />
                <span>Add Webhook</span>
              </button>
            </div>

            {revealedWebhookSecret && (
              <div className="p-4 bg-amber-50 border border-amber-300 rounded-lg text-amber-900 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 font-semibold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span>
                      Webhook Signing Secret (Copy now! It will not be shown
                      again):
                    </span>
                  </div>
                  <button
                    onClick={() => setRevealedWebhookSecret(null)}
                    className="text-xs text-amber-700 hover:text-amber-900 underline"
                  >
                    Dismiss
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="bg-white dark:bg-slate-900 px-3 py-1.5 border border-amber-200 rounded text-xs font-mono select-all flex-1 text-slate-900 dark:text-slate-100">
                    {revealedWebhookSecret}
                  </code>
                </div>
              </div>
            )}

            <div className="border border-slate-200 dark:border-slate-800 rounded-lg overflow-hidden divide-y divide-slate-200">
              {webhookSubs.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400">
                  No outbound webhook destinations configured yet.
                </div>
              ) : (
                webhookSubs.map((sub) => (
                  <div
                    key={sub.id}
                    className="p-4 space-y-3 hover:bg-slate-50/50"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-slate-900 dark:text-slate-100">
                            {sub.name}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              sub.enabled
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                            }`}
                          >
                            {sub.enabled ? "Active" : "Disabled"}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                          {sub.url}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleLoadDeliveries(sub.id)}
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-100 dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-300"
                        >
                          {selectedSubId === sub.id
                            ? "Hide Logs"
                            : "Delivery Logs"}
                        </button>
                        <button
                          onClick={() => handleRotateWebhookSecret(sub.id)}
                          className="px-2.5 py-1 text-xs border border-slate-300 rounded hover:bg-slate-100 dark:bg-slate-800 font-medium text-slate-700 dark:text-slate-300"
                        >
                          Rotate Secret
                        </button>
                        <button
                          onClick={() => handleDeleteWebhook(sub.id)}
                          className="p-1 text-slate-400 hover:text-red-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[11px] text-slate-400">
                        Events:
                      </span>
                      {sub.events.map((evt: string) => (
                        <span
                          key={evt}
                          className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded text-[10px] font-mono"
                        >
                          {evt}
                        </span>
                      ))}
                    </div>

                    {/* Delivery logs panel */}
                    {selectedSubId === sub.id && (
                      <div className="mt-3 p-3 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 rounded-lg space-y-2">
                        <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                          Recent Delivery Attempts
                        </h4>
                        {selectedSubDeliveries.length === 0 ? (
                          <p className="text-xs text-slate-400">
                            No delivery attempts recorded yet.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-60 overflow-y-auto">
                            {selectedSubDeliveries.map((del) => (
                              <div
                                key={del.id}
                                className="p-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded flex items-center justify-between text-xs"
                              >
                                <div className="space-y-0.5">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                        del.status === "SUCCEEDED"
                                          ? "bg-emerald-100 text-emerald-800"
                                          : del.status ===
                                                "FAILED_PERMANENTLY" ||
                                              del.status === "DEAD_LETTERED"
                                            ? "bg-red-100 text-red-800"
                                            : "bg-amber-100 text-amber-800"
                                      }`}
                                    >
                                      {del.status}
                                    </span>
                                    {del.statusCode && (
                                      <span className="text-slate-500 dark:text-slate-400 font-mono">
                                        HTTP {del.statusCode}
                                      </span>
                                    )}
                                    {del.durationMs && (
                                      <span className="text-slate-400 text-[10px]">
                                        {del.durationMs}ms
                                      </span>
                                    )}
                                  </div>
                                  {del.error && (
                                    <p className="text-[11px] text-red-600 font-mono">
                                      {del.error}
                                    </p>
                                  )}
                                  <span className="text-[10px] text-slate-400">
                                    {new Date(del.createdAt).toLocaleString()}{" "}
                                    (Attempt {del.attemptCount}/
                                    {del.maxAttempts})
                                  </span>
                                </div>

                                {(del.status === "FAILED_PERMANENTLY" ||
                                  del.status === "DEAD_LETTERED") && (
                                  <button
                                    onClick={() => handleRetryDelivery(del.id)}
                                    className="px-2 py-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 font-semibold text-[11px] rounded"
                                  >
                                    Replay
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* MODAL: ADD WEBHOOK SUBSCRIPTION */}
        {showAddWebhookModal && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md w-full shadow-xl space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Add Outbound Webhook
              </h3>
              <form onSubmit={handleCreateWebhook} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Destination Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Datadog / Production Webhook"
                    value={newWebhookName}
                    onChange={(e) => setNewWebhookName(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Destination URL (HTTPS required in prod)
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="https://api.yourdomain.com/flowforge-events"
                    value={newWebhookUrl}
                    onChange={(e) => setNewWebhookUrl(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Internal IPs and loopback destinations are strictly blocked
                    by SSRF defense.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Subscribed Events (comma-separated or &apos;*&apos;)
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="* or workflow.execution.failed, approval.requested"
                    value={newWebhookEvents}
                    onChange={(e) => setNewWebhookEvents(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-300 rounded text-xs font-mono"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddWebhookModal(false)}
                    className="px-3 py-1.5 border border-slate-300 text-slate-700 dark:text-slate-300 text-xs rounded hover:bg-slate-50 dark:bg-slate-800/50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded"
                  >
                    Create Webhook
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* MODAL: ROTATE CREDENTIALS */}
        {showRotateModal && selectedConnForRotate && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
            <div className="bg-white dark:bg-slate-900 rounded-lg p-6 max-w-md w-full shadow-xl space-y-4">
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Rotate Connection Credentials
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Replace credentials for{" "}
                <span className="font-semibold">
                  {selectedConnForRotate.name}
                </span>
                . Existing credentials will be overwritten immediately.
              </p>

              <form onSubmit={handleRotateConnection} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-700 dark:text-slate-300 mb-1">
                    New Secret / API Key / Token
                  </label>
                  <input
                    type="password"
                    value={rotateCredentialValue}
                    onChange={(e) => setRotateCredentialValue(e.target.value)}
                    required
                    placeholder="Enter new credential value..."
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm text-slate-900 dark:text-slate-100 font-mono"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowRotateModal(false);
                      setSelectedConnForRotate(null);
                    }}
                    className="px-4 py-2 border border-slate-300 text-slate-700 dark:text-slate-300 text-sm font-medium rounded hover:bg-slate-50 dark:bg-slate-800/50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded"
                  >
                    Rotate Credentials
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
