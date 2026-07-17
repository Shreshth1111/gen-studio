"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, LogOut, Clock, LayoutGrid,
  Search, ArrowUpRight, Layers, ShieldCheck,
  CheckCircle2, Loader2, CalendarDays,
} from "lucide-react";
import { listPresentations, deletePresentation, getMe } from "@/lib/api/presentations";
import { useDispatch } from "react-redux";
import { logout } from "@/store/authSlice";
import confetti from "canvas-confetti";
import { Button, IconButton, Card, Badge, Input, cn } from "@/lib/ui";
import { Logo } from "@/components/brand/Logo";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/dashboard/Hero";
import { DeckPreview } from "@/components/dashboard/DeckPreview";

/** Eased count-up for hero stats — gives the numbers a premium "tick up" feel. */
function useCountUp(target: number, duration = 900) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(target * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function timeAgo(dateStr: string) {
  // Server timestamps are UTC but have no timezone suffix — add Z so the
  // browser parses them as UTC instead of local time (avoids IST +5:30 skew).
  let s = dateStr.replace(" ", "T");
  if (!s.endsWith("Z") && !s.includes("+")) s += "Z";
  const diff = Date.now() - new Date(s).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function withinDays(dateStr: string, days: number) {
  let s = dateStr.replace(" ", "T");
  if (!s.endsWith("Z") && !s.includes("+")) s += "Z";
  return Date.now() - new Date(s).getTime() < days * 86400000;
}

type SortKey = "recent" | "name";

export default function DashboardPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const [presentations, setPresentations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("recent");
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState("");

  const load = async () => {
    try {
      setPresentations(await listPresentations());
    } catch {
      router.push("/login");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    getMe()
      .then(me => { setIsAdmin(!!me?.is_admin); setUsername(me?.username || ""); })
      .catch(() => {});
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Delete this presentation? This can't be undone.")) return;
    setDeletingId(id);
    try {
      await deletePresentation(id);
      setPresentations(p => p.filter(pr => pr.id !== id));
    } finally {
      setDeletingId(null);
    }
  };

  const handleLogout = () => {
    dispatch(logout());
    router.push("/login");
  };

  // Delightful burst, then head into the wizard. canvas-confetti renders on its
  // own body-level canvas, so the burst survives the route change.
  const handleCreate = () => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      confetti({
        particleCount: 110,
        spread: 75,
        origin: { y: 0.65 },
        colors: ["#F59E0B", "#FBBF24", "#34D399", "#FFFFFF"],
        disableForReducedMotion: true,
      });
    }
    setTimeout(() => router.push("/new"), 220);
  };

  const stats = useMemo(() => ({
    total: presentations.length,
    ready: presentations.filter(p => p.status === "completed").length,
    generating: presentations.filter(p => p.status === "generating").length,
    thisWeek: presentations.filter(p => p.created_at && withinDays(p.created_at, 7)).length,
  }), [presentations]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = presentations;
    if (q) {
      list = list.filter(p =>
        (p.title || p.topic || "").toLowerCase().includes(q) ||
        (p.theme || "").toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) =>
      sort === "name"
        ? (a.title || a.topic || "").localeCompare(b.title || b.topic || "")
        : new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
  }, [presentations, query, sort]);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-line bg-bg/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="md" onClick={() => router.push("/studio")}>
              <LayoutGrid className="w-4 h-4" /> Studio
            </Button>
            {isAdmin && (
              <Button variant="secondary" size="md" onClick={() => router.push("/admin")}>
                <ShieldCheck className="w-4 h-4" /> Admin
              </Button>
            )}
            <Button onClick={handleCreate} size="md">
              <Plus className="w-4 h-4" /> New presentation
            </Button>
            <IconButton onClick={handleLogout} title="Log out" aria-label="Log out">
              <LogOut className="w-4 h-4" />
            </IconButton>
          </div>
        </div>
      </header>

      {/* ── Hero (3D showcase + atmosphere) ────────────────────────────── */}
      <Hero username={username} totalDecks={stats.total} onCreate={handleCreate} />

      {/* ── Stats strip ────────────────────────────────────────────────── */}
      {!loading && presentations.length > 0 && (
        <section className="border-b border-line">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 lg:grid-cols-4 gap-4"
          >
            <StatPill icon={<Layers className="w-5 h-5" />} label="Total decks" value={stats.total} tone="brand" />
            <StatPill icon={<CheckCircle2 className="w-5 h-5" />} label="Ready to present" value={stats.ready} tone="success" />
            <StatPill icon={<Loader2 className="w-5 h-5" />} label="In progress" value={stats.generating} tone="brand" />
            <StatPill icon={<CalendarDays className="w-5 h-5" />} label="Created this week" value={stats.thisWeek} tone="neutral" />
          </motion.div>
        </section>
      )}

      {/* ── Library ────────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-7">
          <div>
            <h2 className="text-xl font-bold text-text">Your library</h2>
            <p className="text-muted text-sm mt-0.5">
              {loading ? "Loading…" : `${presentations.length} presentation${presentations.length !== 1 ? "s" : ""}`}
            </p>
          </div>

          {!loading && presentations.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-faint pointer-events-none" />
                <Input
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Search decks…"
                  className="pl-9 w-52"
                />
              </div>
              <div className="flex rounded-md border border-line bg-surface p-0.5">
                {(["recent", "name"] as SortKey[]).map(k => (
                  <button
                    key={k}
                    onClick={() => setSort(k)}
                    className={cn(
                      "px-3 h-9 text-xs font-semibold rounded-[6px] capitalize transition-colors",
                      sort === k ? "bg-surface-2 text-text" : "text-muted hover:text-text",
                    )}
                  >
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <SkeletonGrid />
        ) : presentations.length === 0 ? (
          <EmptyState onCreate={() => router.push("/new")} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {/* Create tile */}
            <motion.button
              whileHover={{ y: -3 }}
              onClick={() => router.push("/new")}
              className="group rounded-lg border border-dashed border-line-strong hover:border-brand bg-surface/40 hover:bg-brand-soft/30 transition-colors flex flex-col items-center justify-center gap-3 p-8 min-h-[244px]"
            >
              <span className="w-12 h-12 rounded-xl bg-brand-soft text-brand flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="w-6 h-6" />
              </span>
              <span className="text-muted group-hover:text-text font-medium text-sm transition-colors">
                New presentation
              </span>
            </motion.button>

            <AnimatePresence mode="popLayout">
              {visible.map((pres, i) => (
                <motion.div
                  key={pres.id}
                  layout
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.96 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3), duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  whileHover={{ y: -4 }}
                  onClick={() => router.push(`/presentation/${pres.id}`)}
                  className="group relative rounded-lg border border-line bg-surface overflow-hidden cursor-pointer transition-shadow duration-300 hover:shadow-e3 hover:border-line-strong"
                >
                  {/* brand glow ring on hover */}
                  <div className="pointer-events-none absolute inset-0 rounded-lg ring-1 ring-inset ring-brand/0 group-hover:ring-brand/40 transition-all duration-300" />

                  {/* Preview hero — a real, theme-accurate mini slide */}
                  <div className="h-40 relative overflow-hidden border-b border-line">
                    <div className="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-[1.06]">
                      <DeckPreview theme={pres.theme} title={pres.title || pres.topic} seed={pres.id} />
                    </div>
                    {/* legibility + depth overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-transparent" />
                    {/* sheen sweep on hover */}
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[900ms] ease-out bg-gradient-to-r from-transparent via-white/10 to-transparent" />

                    <div className="absolute top-2.5 right-2.5 z-10">
                      {pres.status === "generating" ? (
                        <Badge tone="brand" className="animate-pulse">Generating</Badge>
                      ) : pres.status === "completed" ? (
                        <Badge tone="success">Ready</Badge>
                      ) : (
                        <Badge tone="neutral">Draft</Badge>
                      )}
                    </div>

                    <IconButton
                      variant="danger"
                      size="sm"
                      onClick={e => handleDelete(pres.id, e)}
                      disabled={deletingId === pres.id}
                      className="absolute top-2.5 left-2.5 z-10 opacity-0 group-hover:opacity-100 bg-black/50 backdrop-blur transition-opacity"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </IconButton>

                    {/* Open pill */}
                    <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/55 backdrop-blur text-white text-xs font-semibold opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all">
                      Open <ArrowUpRight className="w-3.5 h-3.5" />
                    </div>
                  </div>

                  {/* Meta */}
                  <div className="p-4">
                    <h3 className="font-semibold text-text truncate text-sm group-hover:text-brand transition-colors">
                      {pres.title || pres.topic}
                    </h3>
                    <div className="flex items-center gap-2 mt-2 text-xs text-faint">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3 h-3" />{pres.slide_count}
                      </span>
                      <span className="w-1 h-1 rounded-full bg-line-strong" />
                      <span className="capitalize">{(pres.theme || "").replace(/_/g, " ")}</span>
                      <span className="w-1 h-1 rounded-full bg-line-strong" />
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />{timeAgo(pres.created_at)}
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {visible.length === 0 && (
              <div className="col-span-full text-center py-16 text-muted">
                No decks match “{query}”.
              </div>
            )}
          </div>
        )}
      </main>

      <Footer />
    </div>
  );
}

/* ── Sub-components ───────────────────────────────────────────────────────── */

function StatPill({ icon, label, value, tone = "neutral" }: {
  icon: React.ReactNode; label: string; value: number;
  tone?: "neutral" | "success" | "brand";
}) {
  const count = useCountUp(value);
  const toneCfg = {
    neutral: { chip: "bg-surface-2 text-muted", bar: "bg-line-strong" },
    success: { chip: "bg-success/12 text-success", bar: "bg-success" },
    brand:   { chip: "bg-brand-soft text-brand", bar: "bg-brand" },
  }[tone];
  return (
    <Card className="relative p-5 overflow-hidden group hover:border-line-strong transition-colors">
      {/* top accent */}
      <div className={cn("absolute top-0 left-0 h-0.5 w-full opacity-60", toneCfg.bar)} />
      <div className="flex items-center justify-between">
        <span className={cn("w-11 h-11 rounded-xl flex items-center justify-center", toneCfg.chip)}>
          {icon}
        </span>
        <span className="text-4xl font-bold text-text tabular-nums leading-none">{count}</span>
      </div>
      <p className="text-muted text-sm mt-3 font-medium">{label}</p>
    </Card>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-line bg-surface overflow-hidden">
          <div className="h-40 bg-surface-2 animate-pulse" />
          <div className="p-4 space-y-2.5">
            <div className="h-4 bg-surface-2 rounded w-3/4 animate-pulse" />
            <div className="h-3 bg-line rounded w-1/2 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-24"
    >
      <div className="w-20 h-20 rounded-2xl bg-brand-soft border border-brand/20 flex items-center justify-center mx-auto mb-6">
        <LayoutGrid className="w-9 h-9 text-brand" />
      </div>
      <h2 className="text-xl font-semibold text-text mb-2">Create your first deck</h2>
      <p className="text-muted mb-8 max-w-sm mx-auto">
        Describe a topic and watch Artify write, design, and illustrate a full
        presentation — live.
      </p>
      <Button size="lg" onClick={onCreate} className="mx-auto">
        <Plus className="w-5 h-5" /> New presentation
      </Button>
    </motion.div>
  );
}
