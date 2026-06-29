"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Users, FileStack, Image as ImageIcon, Layers, ShieldCheck,
  TrendingUp, ArrowLeft, Trash2, Search, UserCog, Shield, Ban, CircleCheck,
  Activity as ActivityIcon, Settings as SettingsIcon, Save, Sparkles, Eye, X, History,
} from "lucide-react";
import { getMe } from "@/lib/api/presentations";
import {
  getAdminStats, getAdminUsers, updateAdminUser, deleteAdminUser,
  getAdminPresentations, deleteAdminPresentation,
  getAdminActivity, getAdminSettings, updateAdminSetting,
  getAdminGenerations, getAdminGeneration,
  type AdminStats, type AdminUser, type AdminPresentation,
  type ActivityRow, type SettingRow, type GenerationRow, type GenerationDetail,
} from "@/lib/api/admin";
import { Button, IconButton, Card, Badge, Input, Spinner, cn } from "@/lib/ui";
import { Logo } from "@/components/brand/Logo";

const GEN_KIND_TONE: Record<string, "brand" | "success" | "warning" | "neutral"> = {
  deck: "brand", slide_regen: "neutral", slide_image: "neutral",
  voiceover: "warning", quiz: "success", notes: "success", image: "neutral",
};

function fmtDateTime(s: string) {
  let t = s.replace(" ", "T");
  if (!t.endsWith("Z") && !t.includes("+")) t += "Z";
  return new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}
const BOOL_KEYS = new Set(["signups_enabled", "maintenance_mode", "studio_enabled", "allow_pptx_export"]);

function fmtDate(s: string | null) {
  if (!s) return "—";
  let t = s.replace(" ", "T");
  if (!t.endsWith("Z") && !t.includes("+")) t += "Z";
  return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AdminPage() {
  const router = useRouter();
  const [authState, setAuthState] = useState<"checking" | "ok" | "denied">("checking");
  const [tab, setTab] = useState<"users" | "presentations" | "generations" | "activity" | "settings">("users");

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [presentations, setPresentations] = useState<AdminPresentation[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [generations, setGenerations] = useState<GenerationRow[]>([]);
  const [genUserFilter, setGenUserFilter] = useState<{ id: string; name: string } | null>(null);
  const [genDetail, setGenDetail] = useState<GenerationDetail | null>(null);
  const [query, setQuery] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  // Auth guard — only admins past this point.
  useEffect(() => {
    (async () => {
      try {
        const me = await getMe();
        if (!me?.is_admin) { setAuthState("denied"); return; }
        setAuthState("ok");
        const [s, u, p, a, st, g] = await Promise.all([
          getAdminStats(), getAdminUsers(), getAdminPresentations(),
          getAdminActivity().catch(() => []), getAdminSettings().catch(() => []),
          getAdminGenerations().catch(() => []),
        ]);
        setStats(s); setUsers(u); setPresentations(p); setActivity(a); setSettings(st); setGenerations(g);
      } catch {
        router.push("/login");
      }
    })();
  }, []);

  // View a single user's full generation history.
  const viewUserGenerations = async (u: AdminUser) => {
    setGenUserFilter({ id: u.id, name: u.username });
    setTab("generations");
    try { setGenerations(await getAdminGenerations({ user_id: u.id })); } catch {}
  };
  const clearGenFilter = async () => {
    setGenUserFilter(null);
    try { setGenerations(await getAdminGenerations()); } catch {}
  };
  const openGen = async (id: string) => {
    try { setGenDetail(await getAdminGeneration(id)); } catch {}
  };

  const saveSetting = async (key: string, value: string) => {
    setBusyId(key);
    try {
      const updated = await updateAdminSetting(key, value);
      setSettings(list => list.map(s => s.key === key ? updated : s));
    } catch (e: any) { alert(e?.response?.data?.detail || "Update failed"); }
    finally { setBusyId(null); }
  };

  const refreshStats = async () => { try { setStats(await getAdminStats()); } catch {} };

  const toggleActive = async (u: AdminUser) => {
    setBusyId(u.id);
    try {
      const updated = await updateAdminUser(u.id, { is_active: !u.is_active });
      setUsers(list => list.map(x => x.id === u.id ? updated : x));
      refreshStats();
    } catch (e: any) { alert(e?.response?.data?.detail || "Update failed"); }
    finally { setBusyId(null); }
  };

  const toggleAdmin = async (u: AdminUser) => {
    setBusyId(u.id);
    try {
      const updated = await updateAdminUser(u.id, { is_admin: !u.is_admin });
      setUsers(list => list.map(x => x.id === u.id ? updated : x));
      refreshStats();
    } catch (e: any) { alert(e?.response?.data?.detail || "Update failed"); }
    finally { setBusyId(null); }
  };

  const removeUser = async (u: AdminUser) => {
    if (!confirm(`Delete ${u.username} and all their presentations? This can't be undone.`)) return;
    setBusyId(u.id);
    try {
      await deleteAdminUser(u.id);
      setUsers(list => list.filter(x => x.id !== u.id));
      refreshStats();
    } catch (e: any) { alert(e?.response?.data?.detail || "Delete failed"); }
    finally { setBusyId(null); }
  };

  const removePresentation = async (p: AdminPresentation) => {
    if (!confirm(`Delete "${p.title}"? This can't be undone.`)) return;
    setBusyId(p.id);
    try {
      await deleteAdminPresentation(p.id);
      setPresentations(list => list.filter(x => x.id !== p.id));
      refreshStats();
    } catch (e: any) { alert(e?.response?.data?.detail || "Delete failed"); }
    finally { setBusyId(null); }
  };

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  }, [users, query]);

  const filteredPres = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return presentations;
    return presentations.filter(p =>
      (p.title || "").toLowerCase().includes(q) ||
      (p.owner_username || "").toLowerCase().includes(q) ||
      (p.owner_email || "").toLowerCase().includes(q));
  }, [presentations, query]);

  if (authState === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner className="w-8 h-8 text-brand" />
      </div>
    );
  }

  if (authState === "denied") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center px-6">
        <div className="w-16 h-16 rounded-2xl bg-danger/15 border border-danger/30 flex items-center justify-center">
          <Ban className="w-8 h-8 text-danger" />
        </div>
        <h1 className="text-xl font-semibold text-text">Admin access required</h1>
        <p className="text-muted max-w-sm">This area is restricted to administrators.</p>
        <Button variant="secondary" onClick={() => router.push("/dashboard")}>
          <ArrowLeft className="w-4 h-4" /> Back to dashboard
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-line bg-bg/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <Badge tone="brand" className="ml-1"><ShieldCheck className="w-3 h-3" /> Admin</Badge>
          </div>
          <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard")}>
            <ArrowLeft className="w-4 h-4" /> Dashboard
          </Button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">
        <div className="mb-8">
          <h1 className="text-display text-text">Control center</h1>
          <p className="text-muted mt-1.5 text-sm">Full visibility and control over users, decks, and activity.</p>
        </div>

        {/* ── KPI grid ──────────────────────────────────────────────────── */}
        {stats && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard icon={<Users className="w-5 h-5" />} label="Users"
              value={stats.total_users}
              sub={`${stats.active_users} active · ${stats.admin_users} admin`} />
            <StatCard icon={<FileStack className="w-5 h-5" />} label="Presentations"
              value={stats.total_presentations}
              sub={`+${stats.new_presentations_7d} this week`} accent />
            <StatCard icon={<Layers className="w-5 h-5" />} label="Slides"
              value={stats.total_slides} sub="across all decks" />
            <StatCard icon={<ImageIcon className="w-5 h-5" />} label="Images"
              value={stats.total_images} sub="generated" />
          </div>
        )}

        {/* Status + growth strip */}
        {stats && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
            <Card className="p-5">
              <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-3">
                Presentations by status
              </p>
              <div className="flex flex-wrap gap-2">
                {Object.entries(stats.presentations_by_status).map(([k, v]) => (
                  <Badge key={k} tone={
                    k === "completed" ? "success" : k === "generating" ? "brand" :
                    k === "failed" ? "danger" : "neutral"
                  } className="capitalize">
                    {k}: {v}
                  </Badge>
                ))}
                {Object.keys(stats.presentations_by_status).length === 0 && (
                  <span className="text-faint text-sm">No data yet.</span>
                )}
              </div>
            </Card>
            <Card className="p-5 flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-success/12 border border-success/25 flex items-center justify-center text-success">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <p className="text-2xl font-bold text-text">+{stats.new_users_7d}</p>
                <p className="text-muted text-sm">new users in the last 7 days</p>
              </div>
            </Card>
          </div>
        )}

        {/* ── Tabs + search ─────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex rounded-md border border-line bg-surface p-0.5 w-fit flex-wrap">
            {([
              { k: "users", icon: <Users className="w-4 h-4" />, n: users.length },
              { k: "presentations", icon: <FileStack className="w-4 h-4" />, n: presentations.length },
              { k: "generations", icon: <Sparkles className="w-4 h-4" />, n: generations.length },
              { k: "activity", icon: <ActivityIcon className="w-4 h-4" />, n: activity.length },
              { k: "settings", icon: <SettingsIcon className="w-4 h-4" />, n: settings.length },
            ] as const).map(t => (
              <button key={t.k} onClick={() => setTab(t.k as any)}
                className={cn(
                  "px-4 h-9 text-sm font-semibold rounded-[6px] capitalize transition-colors flex items-center gap-2",
                  tab === t.k ? "bg-surface-2 text-text" : "text-muted hover:text-text",
                )}>
                {t.icon}{t.k} ({t.n})
              </button>
            ))}
          </div>
          {(tab === "users" || tab === "presentations") && (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
              <Input value={query} onChange={e => setQuery(e.target.value)}
                placeholder={`Search ${tab}…`} className="pl-9 w-64" />
            </div>
          )}
        </div>

        {/* ── Users table ───────────────────────────────────────────────── */}
        {tab === "users" && (
          <Card className="overflow-hidden">
            <Table head={["User", "Joined", "Last login", "Decks", "Role", "Status", ""]}>
              {filteredUsers.map(u => (
                <tr key={u.id} className="border-t border-line hover:bg-surface-2/50 transition-colors">
                  <Td>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.username} admin={u.is_admin} />
                      <div className="min-w-0">
                        <p className="text-text font-medium text-sm truncate">{u.username}</p>
                        <p className="text-faint text-xs truncate">{u.email}</p>
                      </div>
                    </div>
                  </Td>
                  <Td className="text-muted text-sm">{fmtDate(u.created_at)}</Td>
                  <Td className="text-muted text-sm">{fmtDate(u.last_login_at)}</Td>
                  <Td className="text-muted text-sm tabular-nums">{u.presentation_count}</Td>
                  <Td>
                    {u.is_admin
                      ? <Badge tone="brand"><Shield className="w-3 h-3" /> Admin</Badge>
                      : <Badge tone="neutral">Member</Badge>}
                  </Td>
                  <Td>
                    {u.is_active
                      ? <Badge tone="success">Active</Badge>
                      : <Badge tone="danger">Disabled</Badge>}
                  </Td>
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <IconButton size="sm" title="View this user's generations"
                        onClick={() => viewUserGenerations(u)}>
                        <History className="w-4 h-4" />
                      </IconButton>
                      <IconButton size="sm" title={u.is_admin ? "Revoke admin" : "Make admin"}
                        onClick={() => toggleAdmin(u)} disabled={busyId === u.id}>
                        <UserCog className={cn("w-4 h-4", u.is_admin && "text-brand")} />
                      </IconButton>
                      <IconButton size="sm" title={u.is_active ? "Deactivate" : "Activate"}
                        onClick={() => toggleActive(u)} disabled={busyId === u.id}>
                        {u.is_active
                          ? <Ban className="w-4 h-4" />
                          : <CircleCheck className="w-4 h-4 text-success" />}
                      </IconButton>
                      <IconButton size="sm" variant="danger" title="Delete user"
                        onClick={() => removeUser(u)} disabled={busyId === u.id}>
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            {filteredUsers.length === 0 && <Empty>No users match your search.</Empty>}
          </Card>
        )}

        {/* ── Presentations table ───────────────────────────────────────── */}
        {tab === "presentations" && (
          <Card className="overflow-hidden">
            <Table head={["Title", "Owner", "Theme", "Slides", "Status", "Created", ""]}>
              {filteredPres.map(p => (
                <tr key={p.id} className="border-t border-line hover:bg-surface-2/50 transition-colors">
                  <Td>
                    <button onClick={() => router.push(`/presentation/${p.id}`)}
                      className="text-text font-medium text-sm hover:text-brand transition-colors text-left truncate max-w-[260px] block">
                      {p.title}
                    </button>
                  </Td>
                  <Td>
                    <div className="min-w-0">
                      <p className="text-muted text-sm truncate">{p.owner_username || "—"}</p>
                      <p className="text-faint text-xs truncate">{p.owner_email}</p>
                    </div>
                  </Td>
                  <Td className="text-muted text-sm capitalize">{(p.theme || "").replace(/_/g, " ")}</Td>
                  <Td className="text-muted text-sm tabular-nums">{p.slide_count}</Td>
                  <Td>
                    <Badge tone={
                      p.status === "completed" ? "success" : p.status === "generating" ? "brand" :
                      p.status === "failed" ? "danger" : "neutral"
                    } className="capitalize">{p.status}</Badge>
                  </Td>
                  <Td className="text-muted text-sm">{fmtDate(p.created_at)}</Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton size="sm" variant="danger" title="Delete presentation"
                        onClick={() => removePresentation(p)} disabled={busyId === p.id}>
                        <Trash2 className="w-4 h-4" />
                      </IconButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            {filteredPres.length === 0 && <Empty>No presentations match your search.</Empty>}
          </Card>
        )}

        {/* ── Generations (all prompts & outputs) ───────────────────────── */}
        {tab === "generations" && (
          <Card className="overflow-hidden">
            {genUserFilter && (
              <div className="flex items-center justify-between px-4 py-2.5 bg-brand-soft/40 border-b border-line">
                <span className="text-sm text-text">Showing generations by <b className="text-brand">{genUserFilter.name}</b></span>
                <button onClick={clearGenFilter} className="text-xs text-muted hover:text-text flex items-center gap-1">
                  <X className="w-3.5 h-3.5" /> Clear filter
                </button>
              </div>
            )}
            <Table head={["When", "User", "Type", "Prompt", ""]}>
              {generations.map(g => (
                <tr key={g.id} className="border-t border-line hover:bg-surface-2/50 transition-colors">
                  <Td className="text-muted text-xs whitespace-nowrap">{fmtDateTime(g.created_at)}</Td>
                  <Td className="text-text text-sm">{g.username || "—"}</Td>
                  <Td><Badge tone={GEN_KIND_TONE[g.kind] || "neutral"} className="capitalize">{g.kind.replace("_", " ")}</Badge></Td>
                  <Td className="text-muted text-xs max-w-[360px]"><span className="line-clamp-2">{g.prompt || g.title || "—"}</span></Td>
                  <Td>
                    <div className="flex justify-end">
                      <IconButton size="sm" title="View full prompt & output" onClick={() => openGen(g.id)}>
                        <Eye className="w-4 h-4" />
                      </IconButton>
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
            {generations.length === 0 && <Empty>No generations recorded yet.</Empty>}
          </Card>
        )}

        {/* ── Activity log ──────────────────────────────────────────────── */}
        {tab === "activity" && (
          <Card className="overflow-hidden">
            <Table head={["When", "Who", "Action", "Detail"]}>
              {activity.map(a => (
                <tr key={a.id} className="border-t border-line hover:bg-surface-2/50 transition-colors">
                  <Td className="text-muted text-xs whitespace-nowrap">{fmtDateTime(a.created_at)}</Td>
                  <Td className="text-text text-sm">{a.username || <span className="text-faint">—</span>}</Td>
                  <Td><Badge tone={
                    a.action.startsWith("admin.") ? "brand" :
                    a.action.includes("delete") ? "danger" :
                    a.action.includes("login") || a.action.includes("register") ? "success" : "neutral"
                  } className="font-mono text-[10px]">{a.action}</Badge></Td>
                  <Td className="text-muted text-xs">{a.detail || a.entity_type || ""}{a.ip_address ? <span className="text-faint"> · {a.ip_address}</span> : ""}</Td>
                </tr>
              ))}
            </Table>
            {activity.length === 0 && <Empty>No activity recorded yet.</Empty>}
          </Card>
        )}

        {/* ── Settings ──────────────────────────────────────────────────── */}
        {tab === "settings" && (
          <div className="grid sm:grid-cols-2 gap-4">
            {settings.map(s => (
              <Card key={s.key} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-text font-semibold text-sm font-mono">{s.key}</p>
                    {s.description && <p className="text-muted text-xs mt-1">{s.description}</p>}
                  </div>
                  {BOOL_KEYS.has(s.key) ? (
                    <button
                      onClick={() => saveSetting(s.key, s.value === "true" ? "false" : "true")}
                      disabled={busyId === s.key}
                      className={cn(
                        "relative w-11 h-6 rounded-full transition-colors shrink-0",
                        s.value === "true" ? "bg-brand" : "bg-line-strong",
                      )}
                      title="Toggle"
                    >
                      <span className={cn(
                        "absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all",
                        s.value === "true" ? "left-[22px]" : "left-0.5",
                      )} />
                    </button>
                  ) : null}
                </div>
                {!BOOL_KEYS.has(s.key) && (
                  <div className="flex items-center gap-2 mt-3">
                    <Input
                      defaultValue={s.value}
                      onBlur={e => { if (e.target.value !== s.value) saveSetting(s.key, e.target.value); }}
                      className="flex-1"
                    />
                    <IconButton size="md" variant="solid" disabled={busyId === s.key} title="Saved on blur">
                      <Save className="w-4 h-4" />
                    </IconButton>
                  </div>
                )}
              </Card>
            ))}
            {settings.length === 0 && <Empty>No settings available.</Empty>}
          </div>
        )}
      </main>

      {/* ── Generation detail modal ─────────────────────────────────────── */}
      {genDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setGenDetail(null)}>
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 10 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-xl border border-line bg-surface shadow-e3"
          >
            <div className="sticky top-0 bg-surface/95 backdrop-blur border-b border-line px-5 py-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge tone={GEN_KIND_TONE[genDetail.kind] || "neutral"} className="capitalize">{genDetail.kind.replace("_", " ")}</Badge>
                <span className="text-sm text-text font-medium">{genDetail.username}</span>
                <span className="text-faint text-xs">{fmtDateTime(genDetail.created_at)}</span>
              </div>
              <IconButton size="sm" onClick={() => setGenDetail(null)}><X className="w-4 h-4" /></IconButton>
            </div>
            <div className="p-5 space-y-4">
              {genDetail.title && <div><p className="text-[10px] font-bold uppercase tracking-wide text-faint mb-1">Title</p><p className="text-text text-sm">{genDetail.title}</p></div>}
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wide text-faint mb-1">Prompt</p>
                <pre className="text-xs text-text bg-surface-2 rounded-lg p-3 whitespace-pre-wrap break-words">{genDetail.prompt || "—"}</pre>
              </div>
              {genDetail.params && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-faint mb-1">Parameters</p>
                  <pre className="text-xs text-muted bg-surface-2 rounded-lg p-3 whitespace-pre-wrap break-words">{genDetail.params}</pre>
                </div>
              )}
              {genDetail.result && (
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wide text-faint mb-1">Output</p>
                  <pre className="text-xs text-muted bg-surface-2 rounded-lg p-3 whitespace-pre-wrap break-words max-h-[40vh] overflow-y-auto">{genDetail.result}</pre>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function StatCard({ icon, label, value, sub, accent }: {
  icon: React.ReactNode; label: string; value: number; sub?: string; accent?: boolean;
}) {
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="p-5">
        <div className="flex items-center justify-between">
          <span className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center",
            accent ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted",
          )}>{icon}</span>
        </div>
        <p className="text-3xl font-bold text-text mt-3 tabular-nums">{value.toLocaleString()}</p>
        <p className="text-muted text-sm mt-0.5">{label}</p>
        {sub && <p className="text-faint text-xs mt-1">{sub}</p>}
      </Card>
    </motion.div>
  );
}

function Table({ head, children }: { head: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className={cn(
                "px-4 py-3 text-[11px] font-bold uppercase tracking-wider text-faint",
                i === head.length - 1 && "text-right",
              )}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3 align-middle", className)}>{children}</td>;
}

function Avatar({ name, admin }: { name: string; admin: boolean }) {
  return (
    <div className={cn(
      "w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0",
      admin ? "bg-brand text-brand-fg" : "bg-surface-2 text-muted border border-line",
    )}>
      {(name[0] || "?").toUpperCase()}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="text-center py-14 text-muted text-sm">{children}</div>;
}
