"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import {
  motion, AnimatePresence, useTransform, type MotionValue,
} from "framer-motion";
import { THEMES } from "@/lib/themes";

/* ════════════════════════════════════════════════════════════════════════
   3D slide showcase. A stack of floating slides that auto-cycle through real
   layouts + themes, react to the cursor (tilt is applied by the parent; this
   adds per-card parallax + hover-to-front), and include one live "generating"
   card. Driven by the app's actual THEMES so it always matches output.
   ════════════════════════════════════════════════════════════════════════ */

type Spec = { theme: string; layout: string; data?: any };

// Per-card playlists. Each card crossfades/flips through its list.
const PLAYLISTS: Spec[][] = [
  // Card 0 — back-left
  [
    { theme: "ocean", layout: "image_cards" },
    { theme: "corporate_red", layout: "timeline", data: { events: [["’24", "Launch"], ["’25", "Scale"], ["’26", "Lead"]] } },
    { theme: "royal", layout: "agenda" },
  ],
  // Card 1 — back-right
  [
    { theme: "royal", layout: "quote", data: { quote: "Design is intelligence made visible.", author: "A. Reid" } },
    { theme: "sunset", layout: "bullets", data: { title: "Highlights", items: ["Faster cycles", "On-brand by default", "Zero busywork"] } },
    { theme: "ocean", layout: "stats" },
  ],
  // Card 2 — middle
  [
    { theme: "corporate_red", layout: "stats" },
    { theme: "royal", layout: "timeline", data: { events: [["Q1", "Research"], ["Q2", "Build"], ["Q3", "Ship"]] } },
    { theme: "sunset", layout: "agenda" },
  ],
];

export function HeroDeck({
  mx, my, reduced, active, reflection,
}: {
  mx: MotionValue<number>;
  my: MotionValue<number>;
  reduced: boolean;
  active: boolean;
  reflection?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const cards = [
    { className: "right-44 top-2",  z: -50, rotY: -16, amp: 10, delay: 0.5,  depth: 8 },
    { className: "right-2 top-28",  z: -20, rotY: 15,  amp: 9,  delay: 0.3,  depth: 14 },
    { className: "right-16 top-8",  z: 45,  rotY: 8,   amp: 13, delay: 0.1,  depth: 22 },
  ];

  return (
    <>
      {/* cycling cards */}
      {cards.map((c, i) => (
        <FloatingCard
          key={i}
          {...c}
          mx={mx} my={my} reduced={reduced} active={active && !reflection}
          dim={hovered !== null && hovered !== i && !reflection}
          lifted={hovered === i && !reflection}
          onHover={(v) => !reflection && setHovered(v ? i : (cur) => (cur === i ? null : cur))}
        >
          <CyclingSlide playlist={PLAYLISTS[i]} stagger={i * 1.3} animate={!reduced && active && !reflection} />
        </FloatingCard>
      ))}

      {/* front — live generating card */}
      <FloatingCard
        className="right-36 top-24" z={110} rotY={-5} amp={7} delay={0.55} depth={28} front
        mx={mx} my={my} reduced={reduced} active={active && !reflection}
        dim={hovered !== null && hovered !== 3 && !reflection}
        lifted={hovered === 3 && !reflection}
        onHover={(v) => !reflection && setHovered(v ? 3 : (cur) => (cur === 3 ? null : cur))}
      >
        {reflection
          ? <MiniSlide spec={{ theme: "sunset", layout: "title" }} />
          : <GeneratingSlide animate={!reduced && active} />}
      </FloatingCard>
    </>
  );
}

/* ── Floating 3D card wrapper ─────────────────────────────────────────────── */
function FloatingCard({
  className, z, rotY, amp, delay, depth, front, children,
  mx, my, reduced, active, dim, lifted, onHover,
}: {
  className: string; z: number; rotY: number; amp: number; delay: number; depth: number;
  front?: boolean; children: React.ReactNode;
  mx: MotionValue<number>; my: MotionValue<number>;
  reduced: boolean; active: boolean; dim: boolean; lifted: boolean;
  onHover: (v: boolean) => void;
}) {
  // Per-card parallax — deeper cards drift less; nearer cards drift more.
  const px = useTransform(mx, [-0.5, 0.5], [-depth, depth]);
  const py = useTransform(my, [-0.5, 0.5], [-depth * 0.6, depth * 0.6]);

  return (
    <motion.div
      style={reduced ? undefined : { x: px, y: py }}
      className={`absolute w-64 aspect-video ${className}`}
      onHoverStart={() => onHover(true)}
      onHoverEnd={() => onHover(false)}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.9 }}
        animate={{
          opacity: dim ? 0.55 : 1,
          y: reduced || !active ? 0 : [0, -amp, 0],
          scale: lifted ? 1.09 : 1,
        }}
        transition={{
          opacity: { duration: 0.4 },
          scale: { duration: 0.35, ease: [0.22, 1, 0.36, 1] },
          y: { duration: 6 + amp / 3, repeat: Infinity, ease: "easeInOut", delay },
        }}
        style={{ z: lifted ? z + 90 : z, rotateY: lifted ? 0 : rotY, transformStyle: "preserve-3d" }}
        className="w-full h-full rounded-2xl overflow-hidden border border-white/15
          shadow-[0_34px_70px_-18px_rgba(0,0,0,0.75)] cursor-pointer"
      >
        {children}
        <div className={`pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 ${
          front ? "via-white/15" : "via-white/8"
        } to-white/0`} />
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
      </motion.div>
    </motion.div>
  );
}

/* ── Auto-cycling slide (3D flip between layouts) ─────────────────────────── */
function CyclingSlide({ playlist, stagger, animate }: {
  playlist: Spec[]; stagger: number; animate: boolean;
}) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!animate) return;
    const id = setInterval(() => setI((p) => (p + 1) % playlist.length), 4200);
    return () => clearInterval(id);
  }, [animate, playlist.length]);

  return (
    <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          exit={{ rotateY: -90, opacity: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: stagger * 0.05 }}
          className="absolute inset-0"
          style={{ backfaceVisibility: "hidden" }}
        >
          <MiniSlide spec={playlist[i]} />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ── Live "generating" card ───────────────────────────────────────────────── */
const GEN_TOPICS = ["The Future of AI", "Go-to-Market Plan", "Climate Solutions", "Product Strategy"];

function GeneratingSlide({ animate }: { animate: boolean }) {
  const t = THEMES.sunset;
  const [topicIdx, setTopicIdx] = useState(0);
  const [typed, setTyped] = useState("");
  const [progress, setProgress] = useState(0);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!animate) { setTyped(GEN_TOPICS[0]); setProgress(100); setDone(true); return; }
    let raf = 0, timers: any[] = [];
    const topic = GEN_TOPICS[topicIdx];
    setTyped(""); setProgress(0); setDone(false);

    // type the title
    let ci = 0;
    const typer = setInterval(() => {
      ci++;
      setTyped(topic.slice(0, ci));
      if (ci >= topic.length) clearInterval(typer);
    }, 70);
    timers.push(typer);

    // fill progress
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(100, ((now - start) / 2600) * 100);
      setProgress(p);
      if (p < 100) raf = requestAnimationFrame(tick);
      else { setDone(true); timers.push(setTimeout(() => setTopicIdx((x) => (x + 1) % GEN_TOPICS.length), 1500)); }
    };
    raf = requestAnimationFrame(tick);

    return () => { clearInterval(typer); cancelAnimationFrame(raf); timers.forEach(clearTimeout); };
  }, [topicIdx, animate]);

  return (
    <div className="absolute inset-0 p-5 flex flex-col justify-center" style={{ background: t.bg }}>
      <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: t.accent }} />
      <div className="flex items-center gap-1.5 mb-2">
        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: done ? "#10B981" : t.accent }} />
        <span className="text-[8px] font-bold uppercase tracking-[0.18em]" style={{ color: done ? "#10B981" : t.accent }}>
          {done ? "Ready" : "Generating"}
        </span>
      </div>
      <h3 className="font-black leading-tight min-h-[34px]" style={{ color: t.heading, fontSize: 16 }}>
        {typed}
        {!done && <span className="inline-block w-[2px] h-[14px] ml-0.5 align-middle animate-pulse" style={{ background: t.accent }} />}
      </h3>
      <p className="mt-1.5" style={{ color: t.muted, fontSize: 9 }}>Trends shaping 2026</p>
      <div className="mt-3 h-1 w-full rounded-full overflow-hidden" style={{ background: t.secondary }}>
        <motion.div className="h-full rounded-full" style={{ width: `${progress}%`, background: t.accent }} />
      </div>
    </div>
  );
}

/* ── Mini slide layouts (theme-driven) ────────────────────────────────────── */
function bgOf(t: Record<string, string>) {
  return t.bgGradient && t.bgGradient.length > 0 ? t.bgGradient : t.bg;
}

function MiniSlide({ spec }: { spec: Spec }) {
  const t = THEMES[spec.theme] || THEMES.dark;
  const bg = bgOf(t);

  switch (spec.layout) {
    case "title":
      return (
        <div className="absolute inset-0 p-5 flex flex-col justify-center" style={{ background: bg }}>
          <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: t.accent }} />
          <div className="w-6 h-[3px] rounded-full mb-2.5" style={{ background: t.accent }} />
          <p className="text-[8px] font-bold uppercase tracking-[0.18em] mb-1" style={{ color: t.accent }}>Presentation</p>
          <h3 className="font-black leading-tight" style={{ color: t.heading, fontSize: 17 }}>The Future<br />of AI</h3>
          <p className="mt-1.5" style={{ color: t.muted, fontSize: 9 }}>Trends shaping 2026</p>
        </div>
      );
    case "stats": {
      const stats = spec.data?.stats || [{ v: "94%", l: "faster" }, { v: "3.4×", l: "output" }, { v: "12k", l: "decks" }];
      return (
        <div className="absolute inset-0 p-4" style={{ background: bg }}>
          <h3 className="font-bold leading-tight" style={{ color: t.heading, fontSize: 11 }}>Impact at a glance</h3>
          <div className="h-[2px] w-7 rounded mt-0.5 mb-3" style={{ background: t.accent }} />
          <div className="grid grid-cols-3 gap-2 h-[58%]">
            {stats.map((s: any, i: number) => (
              <div key={i} className="rounded-lg flex flex-col items-center justify-center"
                style={{ background: t.secondary, border: `1px solid ${t.border}` }}>
                <span className="font-black" style={{ color: t.accent, fontSize: 15 }}>{s.v}</span>
                <span className="mt-0.5" style={{ color: t.muted, fontSize: 7.5 }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "agenda": {
      const items = spec.data?.items || ["Market overview", "Our approach", "Roadmap", "Q&A"];
      return (
        <div className="absolute inset-0 p-4" style={{ background: bg }}>
          <h3 className="font-black leading-tight" style={{ color: t.heading, fontSize: 13 }}>Agenda</h3>
          <div className="h-[2px] w-7 rounded mt-0.5 mb-2.5" style={{ background: t.accent }} />
          <ul className="space-y-[7px]">
            {items.map((it: string, i: number) => (
              <li key={i} className="flex items-center gap-2 border-b pb-[5px]" style={{ borderColor: t.border }}>
                <span className="font-black w-3" style={{ color: t.accent, fontSize: 9 }}>{String(i + 1).padStart(2, "0")}</span>
                <span style={{ color: t.text, fontSize: 9 }}>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "bullets": {
      const title = spec.data?.title || "Key Capabilities";
      const items = spec.data?.items || ["Generative models", "Edge inference", "Agentic workflows"];
      return (
        <div className="absolute inset-0 p-4" style={{ background: bg }}>
          <div className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: t.accent }} />
          <h3 className="font-bold leading-tight mb-0.5 pl-1.5" style={{ color: t.heading, fontSize: 11 }}>{title}</h3>
          <div className="h-[2px] w-7 rounded ml-1.5 mb-2.5" style={{ background: t.accent }} />
          <ul className="pl-1.5 space-y-[7px]">
            {items.map((it: string, i: number) => (
              <li key={i} className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.accent }} />
                <span style={{ color: t.text, opacity: 0.85, fontSize: 9 }}>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      );
    }
    case "timeline": {
      const events = spec.data?.events || [["’24", "Launch"], ["’25", "Scale"], ["’26", "Lead"]];
      return (
        <div className="absolute inset-0 p-4" style={{ background: bg }}>
          <h3 className="font-bold leading-tight" style={{ color: t.heading, fontSize: 11 }}>Roadmap</h3>
          <div className="h-[2px] w-7 rounded mt-0.5 mb-4" style={{ background: t.accent }} />
          <div className="relative flex justify-between">
            <div className="absolute left-1 right-1 top-[5px] h-[2px]" style={{ background: t.border }} />
            {events.map((e: string[], i: number) => (
              <div key={i} className="relative flex flex-col items-center" style={{ width: `${100 / events.length}%` }}>
                <span className="w-2.5 h-2.5 rounded-full z-10" style={{ background: t.accent }} />
                <span className="font-bold mt-1.5" style={{ color: t.accent, fontSize: 9 }}>{e[0]}</span>
                <span style={{ color: t.text, opacity: 0.7, fontSize: 7.5 }}>{e[1]}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case "quote": {
      const quote = spec.data?.quote || "Design is intelligence made visible.";
      const author = spec.data?.author || "A. Reid";
      return (
        <div className="absolute inset-0 p-5 flex flex-col justify-center" style={{ background: bg }}>
          <span className="font-serif leading-none" style={{ color: t.accent, fontSize: 30 }}>&ldquo;</span>
          <p className="font-bold leading-snug -mt-1" style={{ color: t.heading, fontSize: 11 }}>{quote}</p>
          <div className="h-[2px] w-6 rounded my-2" style={{ background: t.accent }} />
          <p className="font-bold" style={{ color: t.accent, fontSize: 8.5 }}>{author}</p>
        </div>
      );
    }
    case "image_cards":
      return (
        <div className="absolute inset-0 flex" style={{ background: bg }}>
          <div className="w-2/5 relative overflow-hidden" style={{ background: t.secondary }}>
            <div className="absolute inset-0 opacity-70" style={{ background: `linear-gradient(135deg, ${t.accent}66, transparent)` }} />
          </div>
          <div className="flex-1 p-3.5 flex flex-col justify-center">
            <h3 className="font-bold leading-tight mb-2" style={{ color: t.heading, fontSize: 10 }}>Why it matters</h3>
            {[0, 1].map((i) => (
              <div key={i} className="rounded-md p-1.5 mb-1.5" style={{ background: t.secondary, border: `1px solid ${t.border}` }}>
                <div className="h-1.5 w-2/3 rounded mb-1" style={{ background: t.heading, opacity: 0.7 }} />
                <div className="h-1 w-full rounded" style={{ background: t.text, opacity: 0.3 }} />
              </div>
            ))}
          </div>
        </div>
      );
    default:
      return <div className="absolute inset-0" style={{ background: bg }} />;
  }
}
