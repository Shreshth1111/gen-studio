"use client";
import * as React from "react";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ImageIcon, Loader2 } from "lucide-react";
import { useMotionPrefs } from "@/lib/useMotionPrefs";
import { cn } from "@/lib/ui";

/** A 3D, dynamic "live generation" card shown while a Studio request is in
 *  flight. Mirrors the hero's generating-slide feel: a floating, tilting card
 *  with a GENERATING badge, cycling status line, and a creeping progress bar. */
export function LiveGenerating({
  title, label, steps, variant = "doc", aspect, accent = "#F59E0B",
}: {
  title: string;
  label: string;
  steps: string[];
  variant?: "doc" | "image";
  aspect?: string;     // tailwind aspect-* class for image variant
  accent?: string;
}) {
  const { reduced } = useMotionPrefs();
  const [step, setStep] = useState(0);
  const [prog, setProg] = useState(8);

  useEffect(() => {
    const s = setInterval(() => setStep(i => (i + 1) % steps.length), 1600);
    let p = 8;
    const g = setInterval(() => {
      p += Math.random() * 6.5;
      if (p > 93) p = 93;
      setProg(Math.round(p));
    }, 420);
    return () => { clearInterval(s); clearInterval(g); };
  }, [steps.length]);

  const float = reduced ? {} : { y: [0, -8, 0], rotateY: [-4, 4, -4] };

  return (
    <div style={{ perspective: 1200 }} className="w-full">
      {/* glow */}
      <div className="relative">
        <div className="absolute inset-x-8 -inset-y-2 rounded-3xl blur-2xl opacity-40"
          style={{ background: `radial-gradient(circle, ${accent}55, transparent 70%)` }} />

        <motion.div
          initial={{ opacity: 0, y: 30, rotateX: -10, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1, rotateX: 0, ...float }}
          transition={{
            opacity: { duration: 0.5 }, scale: { duration: 0.5 }, rotateX: { duration: 0.6 },
            y: { duration: 5, repeat: Infinity, ease: "easeInOut" },
            rotateY: { duration: 9, repeat: Infinity, ease: "easeInOut" },
          }}
          style={{ transformStyle: "preserve-3d" }}
          className="relative rounded-2xl border border-line bg-surface shadow-e3 overflow-hidden"
        >
          {/* sheen sweep */}
          {!reduced && (
            <motion.div
              aria-hidden
              animate={{ x: ["-120%", "220%"] }}
              transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
              className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/8 to-transparent skew-x-12"
            />
          )}

          {variant === "image" ? (
            <div className={cn("relative", aspect || "aspect-square")}>
              {/* shimmering gradient canvas */}
              <div className="absolute inset-0"
                style={{ background: `linear-gradient(135deg, ${accent}30, #0e0e16 60%, ${accent}22)` }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                <motion.div animate={reduced ? {} : { scale: [1, 1.12, 1], opacity: [0.6, 1, 0.6] }}
                  transition={{ duration: 1.8, repeat: Infinity }}
                  className="w-14 h-14 rounded-2xl flex items-center justify-center"
                  style={{ background: `${accent}33`, color: accent }}>
                  <ImageIcon className="w-7 h-7" />
                </motion.div>
                <Status step={steps[step]} />
              </div>
              <Progress prog={prog} accent={accent} />
            </div>
          ) : (
            <div className="p-6">
              <Badge label={label} accent={accent} />
              <h3 className="text-text font-bold text-lg mt-3 leading-tight line-clamp-2">{title}</h3>

              {/* writing lines */}
              <div className="mt-4 space-y-2.5">
                {[0, 1, 2, 3].map(i => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, width: "30%" }}
                    animate={reduced ? { opacity: 0.5 } : { opacity: [0.25, 0.6, 0.25], width: ["40%", "92%", "70%"] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut", delay: i * 0.25 }}
                    className="h-2.5 rounded-full bg-surface-2"
                    style={{ width: `${85 - i * 12}%` }}
                  />
                ))}
              </div>

              <div className="mt-5"><Status step={steps[step]} /></div>
              <div className="relative mt-3 h-1.5"><Progress prog={prog} accent={accent} inline /></div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Badge({ label, accent }: { label: string; accent: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: accent }} />
      <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: accent }}>{label}</span>
    </div>
  );
}

function Status({ step }: { step: string }) {
  return (
    <div className="h-4 overflow-hidden">
      <AnimatePresence mode="wait">
        <motion.p
          key={step}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.3 }}
          className="text-xs text-muted flex items-center gap-1.5"
        >
          <Loader2 className="w-3 h-3 animate-spin" /> {step}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

function Progress({ prog, accent, inline }: { prog: number; accent: string; inline?: boolean }) {
  return (
    <div className={cn(inline ? "" : "absolute bottom-0 left-0 right-0", "h-1.5 bg-black/30")}>
      <motion.div className="h-full rounded-r-full" style={{ width: `${prog}%`, background: accent }}
        transition={{ ease: "linear" }} />
    </div>
  );
}
