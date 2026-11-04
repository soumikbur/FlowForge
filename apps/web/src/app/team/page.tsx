"use client";

import React, { useState, useId, useMemo } from "react";
import {
  Users,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  CheckCircle2,
  Mail,
  UserCheck,
  MoreVertical,
  Check,
  Lock,
} from "lucide-react";
import { useProjectData, TeamMemberItem } from "@/lib/project-store";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { FormField, Input } from "@/components/ui/FormField";

export default function TeamPage() {
  const { team, addTeamMember } = useProjectData();

  const [searchQuery, setSearchQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("ALL");
  const [isInviteOpen, setIsInviteOpen] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"Admin" | "Editor" | "Viewer">("Editor");

  const nameId = useId();
  const emailId = useId();
  const roleId = useId();

  const filteredTeam = useMemo(() => {
    return team.filter((m) => {
      const matchesSearch =
        m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        m.email.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesRole =
        roleFilter === "ALL" || m.role.toUpperCase() === roleFilter;
      return matchesSearch && matchesRole;
    });
  }, [team, searchQuery, roleFilter]);

  const activeCount = team.filter((m) => m.status === "Active").length;
  const adminCount = team.filter(
    (m) => m.role === "Owner" || m.role === "Admin",
  ).length;

  const handleInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;

    const initials = name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);

    const colors = ["#6738E8", "#20B779", "#F3A72F", "#4285F4", "#EC4899"];
    const avatarColor = colors[team.length % colors.length];

    addTeamMember({
      name: name.trim(),
      email: email.trim(),
      role,
      initials: initials || "TM",
      avatarColor,
      status: "Active",
      permissions:
        role === "Admin"
          ? ["Full Workflow Deploy", "Manage Members", "Manage Secrets"]
          : role === "Editor"
            ? ["Create Workflows", "Edit Drafts", "Execute Triggers"]
            : ["View Dashboards", "View Executions"],
    });

    setName("");
    setEmail("");
    setIsInviteOpen(false);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-text-primary">
            Team & Permissions
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Manage workspace collaborators, access privileges, and security
            roles.
          </p>
        </div>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsInviteOpen(true)}
          icon={<Plus className="w-4 h-4" />}
        >
          Invite Member
        </Button>
      </div>

      {/* Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              Team Size
            </div>
            <div className="text-xl font-bold text-text-primary mt-0.5">
              {team.length}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400 flex items-center justify-center">
            <Users className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              Active Now
            </div>
            <div className="text-xl font-bold text-text-primary mt-0.5">
              {activeCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-[#20B779]/10 text-[#20B779] flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              Admins
            </div>
            <div className="text-xl font-bold text-text-primary mt-0.5">
              {adminCount}
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400 flex items-center justify-center">
            <ShieldCheck className="w-4 h-4" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-surface-primary border border-border-default shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs text-text-secondary font-medium">
              Security Policy
            </div>
            <div className="text-sm font-bold text-[#20B779] mt-1">
              2FA Enforced
            </div>
          </div>
          <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400 flex items-center justify-center">
            <Lock className="w-4 h-4" />
          </div>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="p-4 rounded-2xl bg-surface-primary border border-border-default shadow-card flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-text-muted absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 rounded-xl border border-border-default bg-surface-secondary text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
          />
        </div>

        <div className="inline-flex rounded-xl bg-surface-secondary p-1 border border-border-default text-xs font-semibold">
          {["ALL", "OWNER", "ADMIN", "EDITOR", "VIEWER"].map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setRoleFilter(tab)}
              className={`px-3 py-1.5 rounded-lg transition ${
                roleFilter === tab
                  ? "bg-surface-primary text-text-primary shadow-xs font-bold"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              {tab === "ALL"
                ? "All Roles"
                : tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Roster Table */}
      <div className="bg-surface-primary rounded-2xl border border-border-default shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-border-default bg-surface-secondary/40 text-text-secondary uppercase tracking-wider font-semibold">
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-4">Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Assigned Projects</th>
                <th className="py-3 px-4">Permissions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-default">
              {filteredTeam.map((member) => (
                <tr
                  key={member.id}
                  className="hover:bg-surface-secondary/30 transition group"
                >
                  {/* Member Name & Avatar */}
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="relative shrink-0">
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-xs"
                          style={{ backgroundColor: member.avatarColor }}
                        >
                          {member.initials}
                        </div>
                        <span
                          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-surface-primary ${
                            member.status === "Active"
                              ? "bg-[#20B779]"
                              : member.status === "Away"
                                ? "bg-[#F3A72F]"
                                : "bg-text-muted"
                          }`}
                        />
                      </div>
                      <div>
                        <div className="font-bold text-text-primary text-sm">
                          {member.name}
                        </div>
                        <div className="text-text-muted text-[11px]">
                          {member.email}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="py-3.5 px-4">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold ${
                        member.role === "Owner"
                          ? "bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800"
                          : member.role === "Admin"
                            ? "bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800"
                            : "bg-surface-secondary text-text-secondary border border-border-default"
                      }`}
                    >
                      <Shield className="w-3 h-3" />
                      {member.role}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="py-3.5 px-4">
                    <Badge
                      status={member.status === "Active" ? "ACTIVE" : "PENDING"}
                      label={member.status}
                      size="xs"
                      showIcon={false}
                      showDot
                    />
                  </td>

                  {/* Projects */}
                  <td className="py-3.5 px-4">
                    <span className="font-semibold text-text-primary">
                      {member.activeProjects} active
                    </span>
                  </td>

                  {/* Permissions */}
                  <td className="py-3.5 px-4">
                    <div className="flex flex-wrap gap-1.5 max-w-xs">
                      {member.permissions.map((perm) => (
                        <span
                          key={perm}
                          className="px-2 py-0.5 rounded text-[10px] bg-surface-secondary text-text-secondary border border-border-default font-medium"
                        >
                          {perm}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Invite Modal */}
      <Modal
        isOpen={isInviteOpen}
        onClose={() => setIsInviteOpen(false)}
        title="Invite Team Member"
        description="Add a coworker to your FlowForge workspace with custom authorization."
      >
        <form onSubmit={handleInvite} className="space-y-4">
          <FormField label="Full Name" name="m-name" required htmlFor={nameId}>
            <Input
              id={nameId}
              name="m-name"
              required
              placeholder="e.g. Jordan Miller"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </FormField>

          <FormField
            label="Email Address"
            name="m-email"
            required
            htmlFor={emailId}
          >
            <Input
              id={emailId}
              name="m-email"
              type="email"
              required
              placeholder="e.g. jordan@flowforge.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>

          <FormField label="Role Assignment" name="m-role" htmlFor={roleId}>
            <select
              id={roleId}
              name="m-role"
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-border-default bg-surface-primary text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500"
            >
              <option value="Admin">
                Admin (Full workflow & team privileges)
              </option>
              <option value="Editor">
                Editor (Build and execute automations)
              </option>
              <option value="Viewer">
                Viewer (Read-only analytics and executions)
              </option>
            </select>
          </FormField>

          <div className="flex justify-end gap-3 pt-4 border-t border-border-default">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setIsInviteOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!name.trim() || !email.trim()}
            >
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
