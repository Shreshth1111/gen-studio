"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageIcon } from "lucide-react";
import { useMotionPrefs } from "@/lib/useMotionPrefs";

/* ════════════════════════════════════════════════════════════════════════
   LiveDeck — a floating 3D stack of cards shown while a Studio tool generates,
   mirroring the dashboard hero. Two themed background cards + a live front card
   that types the prompt, cycles a status line, and fills a progress bar.
   ════════════════════════════════════════════════════════════════════════ */

type Tool = "image" | "notes" | "quiz";

const CONFIG: Record<Tool, {
  accent: string; label: string; steps: string[];
  backs: [React.ReactNode, React.ReactNode];
  frontVariant: "image" | "doc";
}> = {
  image: {
    accent: "#38BDF8",
    label: "Generating",
    steps: ["Understanding your prompt…", "Composing the scene…", "Painting details…", "Upscaling & polishing…"],
    backs: [<ArtCard key="a" />, <PaletteCard key="b" />],
    frontVariant: "image",
  },
  notes: {
    accent: "#34D399",
    label: "Generating",
    steps: ["Researching the topic…", "Structuring sections…", "Writing explanations…", "Adding tables & charts…"],
    backs: [<OutlineCard key="a" />, <TableCard key="b" />],
    frontVariant: "doc",
  },
  quiz: {
    accent: "#FB923C",
    label: "Generating",
    steps: ["Designing questions…", "Tagging Bloom levels…", "Writing answers…", "Finalising the quiz…"],
    backs: [<McqCard key="a" />, <BloomCard key="b" />],
    frontVariant: "doc",
  },
};

export function LiveDeck({ tool, title }: { tool: Tool; title: string }) {
  const { reduced } = useMotionPrefs();
  const cfg = CONFIG[tool];

  const [typed, setTyped] = useState(reduced ? title : "");
  const [step, setStep] = useState(0);
  const [prog, setProg] = useState(8);

  useEffect(() => {
    if (reduced) { setTyped(title); setProg(60); return; }
    let ci = 0;
    const typer = setInterval(() => { ci++; setTyped(title.slice(0, ci)); if (ci >= title.length) clearInterval(typer); }, 55);
    const stepper = setInterval(() => setStep(i => (i + 1) % cfg.steps.length), 1600);
    let p = 8;
    const prg = setInterval(() => { p += Math.random() * 6; if (p > 93) p = 93; setProg(Math.round(p)); }, 420);
    return () => { clearInterval(typer); clearInterval(stepper); clearInterval(prg); };
  }, [title, reduced, cfg.steps.length]);

  return (
    <div className="relative h-[360px] w-full" style={{ perspective: 1300 }} aria-label="Generating">
      {/* ambient glow */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full blur-[90px] opacity-40"
        style={{ background: `radial-gradient(circle, ${cfg.accent}66, transparent 70%)` }} />
      <div className="absolute left-1/2 bottom-8 -translate-x-1/2 w-72 h-8 rounded-[50%] bg-black/50 blur-2xl" />

      {/* auto-orbit scene */}
      <motion.div
        animate={reduced ? undefined : { rotateY: [-6, 6, -6], rotateX: [2, -2, 2] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        style={{ transformStyle: "preserve-3d" }}
        className="absolute inset-0"
      >
        <Card3D offset={-95} top={6}  z={-40} rotY={-14} amp={9}  delay={0.4}>{cfg.backs[0]}</Card3D>
        <Card3D offset={70}  top={0}  z={25}  rotY={11}  amp={12} delay={0.15}>{cfg.backs[1]}</Card3D>
        <Card3D offset={-25} top={64} z={100} rotY={-4}  amp={7}  delay={0.5} front>
          {cfg.frontVariant === "image"
            ? <ImageFront accent={cfg.accent} label={cfg.label} typed={typed} status={cfg.steps[step]} prog={prog} />
            : <DocFront accent={cfg.accent} label={cfg.label} typed={typed} status={cfg.steps[step]} prog={prog} />}
        </Card3D>
      </motion.div>
    </div>
  );
}

/* ── 3D card wrapper ──────────────────────────────────────────────────────── */
function Card3D({
  offset, top, z, rotY, amp, delay, front, children,
}: {
  offset: number; top: number; z: number; rotY: number; amp: number;
  delay: number; front?: boolean; children: React.ReactNode;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 36, scale: 0.9 }}
      animate={{ opacity: 1, y: [0, -amp, 0], scale: 1 }}
      transition={{
        opacity: { duration: 0.6, delay }, scale: { duration: 0.6, delay },
        y: { duration: 6 + amp / 3, repeat: Infinity, ease: "easeInOut", delay },
      }}
      style={{ left: "50%", top, marginLeft: -128 + offset, z, rotateY: rotY, transformStyle: "preserve-3d" }}
      className="absolute w-64 aspect-video rounded-2xl overflow-hidden border border-white/15 shadow-[0_34px_70px_-18px_rgba(0,0,0,0.75)]"
    >
      {children}
      <div className={`pointer-events-none absolute inset-0 bg-gradient-to-tr from-white/0 ${front ? "via-white/12" : "via-white/7"} to-white/0`} />
      <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10" />
    </motion.div>
  );
}

/* ── Front cards (live) ───────────────────────────────────────────────────── */
function Badge({ label, accent }: { label: string; accent: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} />
      <span className="text-[9px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>{label}</span>
    </div>
  );
}
function Cursor({ accent }: { accent: string }) {
  return <span className="inline-block w-[2px] h-[14px] ml-0.5 align-middle animate-pulse" style={{ background: accent }} />;
}
function StatusLine({ status }: { status: string }) {
  return (
    <div className="h-3 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.span key={status} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3 }} className="block text-[8.5px]" style={{ color: "#8a8a98" }}>
          {status}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

function DocFront({ accent, label, typed, status, prog }: { accent: string; label: string; typed: string; status: string; prog: number }) {
  return (
    <div className="absolute inset-0 bg-[#fbfaf8] p-4 flex flex-col">
      <Badge label={label} accent={accent} />
      <h3 className="font-black leading-tight mt-1.5 text-[#1a1414] min-h-[30px]" style={{ fontSize: 15 }}>
        {typed}<Cursor accent={accent} />
      </h3>
      <div className="mt-2 space-y-1.5 flex-1">
        {[0, 1, 2].map(i => (
          <motion.div key={i} animate={{ opacity: [0.25, 0.5, 0.25] }} transition={{ duration: 2, repeat: Infinity, delay: i * 0.25 }}
            className="h-1.5 rounded-full bg-[#e7e2da]" style={{ width: `${82 - i * 14}%` }} />
        ))}
      </div>
      <div className="mt-1"><StatusLine status={status} /></div>
      <div className="mt-1.5 h-1 w-full rounded-full bg-[#ece7df] overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${prog}%`, background: accent }} />
      </div>
    </div>
  );
}

function ImageFront({ accent, label, typed, status, prog }: { accent: string; label: string; typed: string; status: string; prog: number }) {
  return (
    <div className="absolute inset-0 flex flex-col" style={{ background: `linear-gradient(135deg, ${accent}33, #0e0e16 60%, ${accent}22)` }}>
      <div className="flex-1 flex items-center justify-center">
        <motion.div animate={{ scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }} transition={{ duration: 1.8, repeat: Infinity }}
          className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${accent}33`, color: accent }}>
          <ImageIcon className="w-6 h-6" />
        </motion.div>
      </div>
      <div className="p-3 bg-black/35 backdrop-blur-sm">
        <Badge label={label} accent={accent} />
        <p className="text-white font-bold mt-1 leading-tight line-clamp-1" style={{ fontSize: 11 }}>{typed}<Cursor accent={accent} /></p>
        <div className="mt-1"><StatusLine status={status} /></div>
        <div className="mt-1.5 h-1 w-full rounded-full bg-white/15 overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${prog}%`, background: accent }} />
        </div>
      </div>
    </div>
  );
}

/* ── Themed background cards ───────────────────────────────────────────────── */
function ArtCard() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-sky-700 to-cyan-900 p-3">
      <div className="h-full rounded-lg border border-white/15 relative overflow-hidden">
        <div className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(circle at 30% 30%, #7dd3fc88, transparent 60%)" }} />
        <div className="absolute bottom-2 left-2 text-[9px] font-bold text-white/80">Composition</div>
      </div>
    </div>
  );
}
function PaletteCard() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950 p-3.5">
      <p className="text-[10px] font-bold text-white">Palette</p>
      <div className="h-[2px] w-6 rounded bg-sky-400 mt-0.5 mb-2.5" />
      <div className="flex gap-1.5">
        {["#38BDF8", "#818CF8", "#34D399", "#FBBF24", "#F472B6"].map(c => (
          <div key={c} className="w-6 h-6 rounded-md" style={{ background: c }} />
        ))}
      </div>
      <div className="mt-2.5 space-y-1.5">
        {[70, 50].map(w => <div key={w} className="h-1.5 rounded bg-white/20" style={{ width: `${w}%` }} />)}
      </div>
    </div>
  );
}
function OutlineCard() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-emerald-800 to-teal-950 p-3.5">
      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-emerald-400" />
      <p className="text-[10px] font-bold text-white pl-1">Outline</p>
      <div className="h-[2px] w-6 rounded bg-emerald-400 ml-1 mt-0.5 mb-2.5" />
      <ul className="pl-1 space-y-[7px]">
        {["Introduction", "Core concepts", "Worked example"].map((t, i) => (
          <li key={i} className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-white/80" style={{ fontSize: 8.5 }}>{t}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
function TableCard() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950 p-3">
      <p className="text-[9px] font-bold text-white mb-1.5">Comparison</p>
      <div className="rounded-md overflow-hidden border border-white/10">
        <div className="grid grid-cols-3 bg-emerald-500/20">
          {["A", "B", "C"].map(h => <div key={h} className="px-1.5 py-1 text-[7.5px] font-bold text-white">{h}</div>)}
        </div>
        {[0, 1, 2].map(r => (
          <div key={r} className="grid grid-cols-3 border-t border-white/10">
            {[0, 1, 2].map(c => <div key={c} className="px-1.5 py-1"><div className="h-1 rounded bg-white/25" /></div>)}
          </div>
        ))}
      </div>
    </div>
  );
}
function McqCard() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-orange-800 to-amber-950 p-3.5">
      <span className="inline-flex items-center justify-center w-4 h-4 rounded-md bg-orange-400 text-[8px] font-black text-black">1</span>
      <div className="h-1.5 w-3/4 rounded bg-white/35 mt-2 mb-2.5" />
      <div className="space-y-1.5">
        {[0, 1, 2].map(i => (
          <div key={i} className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 ${i === 1 ? "bg-emerald-500/25" : "bg-white/8"}`}>
            <span className="w-3 h-3 rounded-full border border-white/40 text-[6px] font-bold text-white/70 flex items-center justify-center">{String.fromCharCode(65 + i)}</span>
            <div className="h-1 rounded bg-white/30 flex-1" />
          </div>
        ))}
      </div>
    </div>
  );
}
function BloomCard() {
  return (
    <div className="absolute inset-0 bg-gradient-to-br from-slate-800 to-slate-950 p-3.5">
      <p className="text-[10px] font-bold text-white">Bloom levels</p>
      <div className="h-[2px] w-6 rounded bg-orange-400 mt-0.5 mb-2.5" />
      <div className="flex flex-wrap gap-1.5">
        {["Remember", "Apply", "Analyze", "Evaluate", "Create"].map((b, i) => (
          <span key={b} className={`px-1.5 py-0.5 rounded-full text-[7.5px] font-bold border ${
            i === 2 ? "bg-orange-400/25 border-orange-400/50 text-orange-200" : "border-white/20 text-white/70"}`}>{b}</span>
        ))}
      </div>
    </div>
  );
}
