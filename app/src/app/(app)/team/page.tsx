"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, Loader2, Plus, Trash2, UserCog } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useSession } from "@/context/session-context";
import type { Invite, Role, RunRecord } from "@/lib/types";

interface TeamUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  createdAt: string;
}

export default function TeamPage() {
  const { user: me, isAdmin, loading: sessionLoading } = useSession();
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add-user dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newRole, setNewRole] = useState<Role>("editor");
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);

  // Invite links
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteRole, setInviteRole] = useState<Role>("editor");
  const [inviteLabel, setInviteLabel] = useState("");
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [usersRes, runsRes, invitesRes] = await Promise.all([
        fetch("/api/users"),
        fetch("/api/runs"),
        fetch("/api/invites"),
      ]);
      if (usersRes.ok) setUsers(await usersRes.json());
      if (runsRes.ok) setRuns(await runsRes.json());
      if (invitesRes.ok) setInvites(await invitesRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  const inviteUrl = (id: string) => `${window.location.origin}/invite?token=${id}`;

  async function createInvite() {
    setCreatingInvite(true);
    setError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: inviteRole, label: inviteLabel }),
      });
      if (!res.ok) {
        setError((await res.json()).error || "Failed to create invite");
        return;
      }
      const invite: Invite = await res.json();
      setInviteLabel("");
      await load();
      // Copy the fresh link right away — one less click.
      try {
        await navigator.clipboard.writeText(inviteUrl(invite.id));
        setCopiedId(invite.id);
        setTimeout(() => setCopiedId(null), 2500);
      } catch { /* clipboard unavailable — the list has a copy button */ }
    } finally {
      setCreatingInvite(false);
    }
  }

  async function copyInvite(id: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(id));
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2500);
    } catch { /* ignore */ }
  }

  async function revokeInvite(id: string) {
    setError(null);
    const res = await fetch(`/api/invites?id=${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error || "Failed to revoke invite");
    await load();
  }

  useEffect(() => {
    void load();
  }, [load]);

  async function addUser(e: React.FormEvent) {
    e.preventDefault();
    setDialogError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDialogError(data.error || "Failed to create user");
        return;
      }
      setDialogOpen(false);
      setNewName("");
      setNewEmail("");
      setNewPassword("");
      setNewRole("editor");
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function changeRole(id: string, role: Role) {
    setError(null);
    const res = await fetch("/api/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role }),
    });
    if (!res.ok) setError((await res.json()).error || "Failed to change role");
    await load();
  }

  async function removeUser(id: string, email: string) {
    if (!window.confirm(`Remove ${email}? They will no longer be able to sign in.`)) return;
    setError(null);
    const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
    if (!res.ok) setError((await res.json()).error || "Failed to remove user");
    await load();
  }

  if (sessionLoading || loading) {
    return (
      <div className="flex items-center justify-center py-24 text-[#6e6e7a]">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="py-24 text-center">
        <UserCog className="mx-auto mb-3 h-8 w-8 text-[#4a4a55]" />
        <p className="text-[13px] text-[#8a8a96]">Team management is only available to admins.</p>
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {/* Users */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-[#e2e2e5]">Users</h2>
            <p className="mt-0.5 text-[12.5px] text-[#8a8a96]">
              Admins can run the pipeline and manage the workspace. Editors browse videos, analysis, and concepts.
            </p>
          </div>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-[#5e6ad2] text-[12.5px] text-white hover:bg-[#6b76e0]">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add user
              </Button>
            </DialogTrigger>
            <DialogContent className="border-white/[0.08] bg-[#111113] sm:max-w-sm">
              <DialogHeader>
                <DialogTitle className="text-[14px] text-[#e2e2e5]">Add user</DialogTitle>
              </DialogHeader>
              <form onSubmit={addUser} className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-[12px] text-[#a8a8b3]">Name</Label>
                  <Input value={newName} onChange={(e) => setNewName(e.target.value)} required className="border-white/[0.08] bg-[#0f0f11] text-[13px] text-[#e2e2e5]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px] text-[#a8a8b3]">Email</Label>
                  <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} required className="border-white/[0.08] bg-[#0f0f11] text-[13px] text-[#e2e2e5]" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px] text-[#a8a8b3]">Temporary password</Label>
                  <Input type="text" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} className="border-white/[0.08] bg-[#0f0f11] text-[13px] text-[#e2e2e5]" />
                  <p className="text-[11px] text-[#6e6e7a]">Share it with them directly — they can’t reset it themselves yet.</p>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[12px] text-[#a8a8b3]">Role</Label>
                  <Select value={newRole} onValueChange={(v) => setNewRole(v as Role)}>
                    <SelectTrigger className="border-white/[0.08] bg-[#0f0f11] text-[13px] text-[#e2e2e5]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="border-white/[0.08] bg-[#111113]">
                      <SelectItem value="editor">Editor</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {dialogError && (
                  <p className="rounded-[6px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">{dialogError}</p>
                )}
                <Button type="submit" disabled={saving} className="w-full bg-[#5e6ad2] text-[13px] text-white hover:bg-[#6b76e0]">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create user"}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {error && (
          <p className="mb-3 rounded-[6px] border border-red-500/20 bg-red-500/10 px-3 py-2 text-[12.5px] text-red-400">{error}</p>
        )}

        <div className="rounded-[10px] border border-white/[0.06] bg-[#111113]">
          <Table>
            <TableHeader>
              <TableRow className="border-white/[0.06] hover:bg-transparent">
                <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">Name</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">Email</TableHead>
                <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">Role</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                  <TableCell className="text-[13px] text-[#e2e2e5]">
                    {u.name}
                    {u.id === me?.id && <span className="ml-2 text-[11px] text-[#6e6e7a]">(you)</span>}
                  </TableCell>
                  <TableCell className="text-[13px] text-[#8a8a96]">{u.email}</TableCell>
                  <TableCell>
                    <Select value={u.role} onValueChange={(v) => void changeRole(u.id, v as Role)}>
                      <SelectTrigger className="h-7 w-[110px] border-white/[0.08] bg-[#0f0f11] text-[12px] text-[#e2e2e5]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="border-white/[0.08] bg-[#111113]">
                        <SelectItem value="editor">Editor</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    {u.id !== me?.id && (
                      <button
                        onClick={() => void removeUser(u.id, u.email)}
                        title="Remove user"
                        className="rounded-[5px] p-1.5 text-[#6e6e7a] transition-colors hover:bg-red-500/10 hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      {/* Invite links */}
      <section>
        <h2 className="text-[15px] font-semibold text-[#e2e2e5]">Invite links</h2>
        <p className="mt-0.5 mb-4 text-[12.5px] text-[#8a8a96]">
          Share a link and the person creates their own account — single-use, expires in 7 days, revocable.
        </p>

        <div className="mb-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#a8a8b3]">For (label, optional)</Label>
            <Input
              value={inviteLabel}
              onChange={(e) => setInviteLabel(e.target.value)}
              placeholder="e.g. Rishi — eyewa"
              className="w-[220px] border-white/[0.08] bg-[#0f0f11] text-[13px] text-[#e2e2e5]"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[12px] text-[#a8a8b3]">Role</Label>
            <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as Role)}>
              <SelectTrigger className="w-[120px] border-white/[0.08] bg-[#0f0f11] text-[13px] text-[#e2e2e5]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-white/[0.08] bg-[#111113]">
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => void createInvite()}
            disabled={creatingInvite}
            className="bg-[#5e6ad2] text-[12.5px] text-white hover:bg-[#6b76e0]"
          >
            {creatingInvite ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create & copy link"}
          </Button>
        </div>

        <div className="rounded-[10px] border border-white/[0.06] bg-[#111113]">
          {invites.length === 0 ? (
            <p className="px-4 py-6 text-center text-[12.5px] text-[#6e6e7a]">No invites yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">For</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">Role</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {invites.map((inv) => {
                  const expired = !inv.usedAt && new Date(inv.expiresAt).getTime() < Date.now();
                  return (
                    <TableRow key={inv.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                      <TableCell className="text-[13px] text-[#e2e2e5]">{inv.label || "—"}</TableCell>
                      <TableCell className="text-[12.5px] uppercase tracking-wider text-[#8a93e8]">{inv.role}</TableCell>
                      <TableCell>
                        {inv.usedAt ? (
                          <Badge variant="outline" className="border-emerald-500/30 text-emerald-400">
                            joined: {inv.usedBy}
                          </Badge>
                        ) : expired ? (
                          <Badge variant="outline" className="border-red-500/30 text-red-400">expired</Badge>
                        ) : (
                          <Badge variant="outline" className="border-[#5e6ad2]/40 text-[#8a93e8]">
                            active until {new Date(inv.expiresAt).toLocaleDateString()}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {!inv.usedAt && !expired && (
                            <button
                              onClick={() => void copyInvite(inv.id)}
                              title="Copy invite link"
                              className="rounded-[5px] p-1.5 text-[#6e6e7a] transition-colors hover:bg-white/[0.06] hover:text-[#e2e2e5]"
                            >
                              {copiedId === inv.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          )}
                          {!inv.usedAt && (
                            <button
                              onClick={() => void revokeInvite(inv.id)}
                              title="Revoke invite"
                              className="rounded-[5px] p-1.5 text-[#6e6e7a] transition-colors hover:bg-red-500/10 hover:text-red-400"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </div>
      </section>

      {/* Usage */}
      <section>
        <h2 className="text-[15px] font-semibold text-[#e2e2e5]">Pipeline usage</h2>
        <p className="mt-0.5 mb-4 text-[12.5px] text-[#8a8a96]">
          Every run costs Apify, Gemini, and Claude credits — this log attributes that spend to a user.
        </p>
        <div className="rounded-[10px] border border-white/[0.06] bg-[#111113]">
          {runs.length === 0 ? (
            <p className="px-4 py-8 text-center text-[12.5px] text-[#6e6e7a]">No pipeline runs recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-white/[0.06] hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">Started</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">By</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">Config</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">Videos</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-[#6e6e7a]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.map((r) => (
                  <TableRow key={r.id} className="border-white/[0.06] hover:bg-white/[0.02]">
                    <TableCell className="text-[12.5px] text-[#8a8a96]">
                      {r.startedAt ? new Date(r.startedAt).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell className="text-[12.5px] text-[#e2e2e5]">{r.startedBy}</TableCell>
                    <TableCell className="text-[12.5px] text-[#8a8a96]">{r.configName}</TableCell>
                    <TableCell className="text-[12.5px] text-[#8a8a96]">
                      {r.videosAnalyzed}/{r.videosTotal}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          r.status === "completed"
                            ? "border-emerald-500/30 text-emerald-400"
                            : r.status === "running"
                              ? "border-[#5e6ad2]/40 text-[#8a93e8]"
                              : "border-red-500/30 text-red-400"
                        }
                      >
                        {r.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
