"use client";
import * as React from "react";
import { useRef } from "react";
import {
  motion, useMotionValue, useSpring, useTransform, useScroll, useMotionTemplate,
  type MotionValue,
} from "framer-motion";
import { Plus, Sparkles } from "lucide-react";
import { Button, Badge } from "@/lib/ui";
import { HeroDeck } from "@/components/dashboard/HeroDeck";
import { useMotionPrefs } from "@/lib/useMotionPrefs";

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export function Hero({
  username, totalDecks, onCreate,
}: {
  username: string; totalDecks: number; onCreate: () => void;
}) {
  const { reduced, active } = useMotionPrefs();
  const ref = useRef<HTMLElement>(null);

  // Cursor — shared by parallax (deck) and the spotlight.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const spotX = useSpring(useMotionValue(50), { stiffness: 120, damping: 20 });
  const spotY = useSpring(useMotionValue(30), { stiffness: 120, damping: 20 });

  const rotX = useSpring(useTransform(my, [-0.5, 0.5], [10, -10]), { stiffness: 110, damping: 16 });
  const rotY = useSpring(useTransform(mx, [-0.5, 0.5], [-15, 15]), { stiffness: 110, damping: 16 });

  // Gentler tilt for the headline so it has its own subtle 3D life.
  const titleRotX = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 130, damping: 18 });
  const titleRotY = useSpring(useTransform(mx, [-0.5, 0.5], [-9, 9]), { stiffness: 130, damping: 18 });

  const onMove = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
    spotX.set(((e.clientX - r.left) / r.width) * 100);
    spotY.set(((e.clientY - r.top) / r.height) * 100);
  };
  const reset = () => { mx.set(0); my.set(0); };

  // Scroll-reactive — the stack tips back and fades as you scroll past.
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const stackRotX = useTransform(scrollYProgress, [0, 1], [0, 22]);
  const stackY = useTransform(scrollYProgress, [0, 1], [0, -50]);
  const stackOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.15]);

  const spotlight = useMotionTemplate`radial-gradient(420px circle at ${spotX}% ${spotY}%, rgb(var(--brand) / 0.16), transparent 70%)`;

  return (
    <section
      ref={ref}
      onMouseMove={reduced ? undefined : onMove}
      onMouseLeave={reset}
      className="relative overflow-hidden border-b border-line"
    >
      {/* ── Atmosphere ─────────────────────────────────────────────── */}
      {/* drifting aurora */}
      {!reduced && active && (
        <>
          <motion.div
            aria-hidden
            animate={{ x: [0, 40, 0], y: [0, 20, 0], opacity: [0.4, 0.65, 0.4] }}
            transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
            className="pointer-events-none absolute -top-40 -left-32 w-[40rem] h-[40rem] rounded-full bg-brand/20 blur-[130px]"
          />
          <motion.div
            aria-hidden
            animate={{ x: [0, -50, 0], y: [0, 30, 0], opacity: [0.25, 0.5, 0.25] }}
            transition={{ duration: 19, repeat: Infinity, ease: "easeInOut", delay: 2 }}
            className="pointer-events-none absolute -top-24 right-0 w-[34rem] h-[34rem] rounded-full bg-indigo-500/15 blur-[130px]"
          />
        </>
      )}

      {/* cursor spotlight */}
      {!reduced && <motion.div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: spotlight }} />}

      {/* floating particles */}
      {!reduced && active && <Particles />}

      {/* dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{ backgroundImage: "radial-gradient(rgb(var(--text)) 1px, transparent 1px)", backgroundSize: "22px 22px" }}
      />

      {/* ── Content ────────────────────────────────────────────────── */}
      <div className="relative max-w-7xl mx-auto px-6 py-16">
        <div className="grid lg:grid-cols-[1.05fr,0.95fr] gap-8 items-center">
          {/* Left */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Badge tone="brand"><Sparkles className="w-3 h-3" /> Artify AI</Badge>
              <span className="text-faint text-xs">
                {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
              </span>
            </div>
            <Title3D greeting={greeting()} username={username} rotX={titleRotX} rotY={titleRotY} reduced={reduced} />

            <p className="text-muted mt-4 text-base max-w-xl leading-relaxed">
              Turn any idea into a polished, on-brand deck in under two minutes —
              written, designed, and illustrated by AI.
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-7">
              <Button size="lg" onClick={onCreate}>
                <Plus className="w-5 h-5" /> Create a presentation
              </Button>
              {totalDecks > 0 && (
                <span className="text-muted text-sm">
                  <span className="text-text font-semibold">{totalDecks}</span> deck{totalDecks !== 1 ? "s" : ""} in your library
                </span>
              )}
            </div>
          </motion.div>

          {/* Right — 3D stack + floor reflection */}
          <motion.div
            style={{ rotateX: stackRotX, y: stackY, opacity: stackOpacity }}
            className="relative hidden lg:block"
          >
            <div className="relative h-[420px]" style={{ perspective: 1400 }}>
              <motion.div
                animate={reduced || !active ? undefined : { rotateY: [-6, 6, -6], rotateX: [2, -2, 2] }}
                transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
                style={{ transformStyle: "preserve-3d" }}
                className="absolute inset-0"
              >
                <motion.div style={{ rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" }} className="absolute inset-0">
                  <HeroDeck mx={mx} my={my} reduced={reduced} active={active} />
                </motion.div>
              </motion.div>
            </div>

            {/* floor reflection — mirrored, blurred, faded */}
            {!reduced && (
              <div
                className="absolute left-0 right-0 top-[400px] h-[220px] opacity-25 blur-[2px] pointer-events-none"
                style={{
                  transform: "scaleY(-1)",
                  maskImage: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 65%)",
                  WebkitMaskImage: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent 65%)",
                  perspective: 1400,
                }}
              >
                <div className="absolute inset-0" style={{ transformStyle: "preserve-3d" }}>
                  <HeroDeck mx={mx} my={my} reduced active reflection />
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </section>
  );
}

/* ── 3D animated headline ─────────────────────────────────────────────────── */
function Title3D({
  greeting, username, rotX, rotY, reduced,
}: {
  greeting: string; username: string;
  rotX: MotionValue<number>; rotY: MotionValue<number>; reduced: boolean;
}) {
  const words = greeting.split(" ");
  return (
    <div style={{ perspective: 800 }}>
      <motion.h1
        style={reduced ? undefined : { rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" }}
        className="text-4xl sm:text-5xl font-bold tracking-tight text-text leading-[1.05]"
      >
        {words.map((w, i) => (
          <motion.span
            key={i}
            initial={{ opacity: 0, y: 24, rotateX: -40 }}
            animate={{ opacity: 1, y: 0, rotateX: 0 }}
            transition={{ delay: 0.05 * i, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="inline-block"
            style={{ transformStyle: "preserve-3d" }}
          >
            {w}{i < words.length - 1 ? " " : ""}
          </motion.span>
        ))}
        {username ? (
          <>
            <span>,&nbsp;</span>
            <motion.span
              initial={{ opacity: 0, y: 24, rotateX: -40 }}
              animate={{
                opacity: 1, y: 0, rotateX: 0,
                ...(reduced ? {} : { backgroundPosition: ["0% 50%", "200% 50%"] }),
              }}
              transition={{
                opacity: { delay: 0.05 * words.length, duration: 0.55 },
                y: { delay: 0.05 * words.length, duration: 0.55, ease: [0.22, 1, 0.36, 1] },
                rotateX: { delay: 0.05 * words.length, duration: 0.55 },
                backgroundPosition: { duration: 6, repeat: Infinity, ease: "linear" },
              }}
              className="inline-block font-bold"
              style={{
                transform: "translateZ(35px)",
                transformStyle: "preserve-3d",
                backgroundImage: "linear-gradient(90deg, #8B7DFF, #6D5EF7, #B7AEFF, #6D5EF7, #8B7DFF)",
                backgroundSize: "200% 100%",
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                filter: "drop-shadow(0 6px 20px rgba(109,94,247,0.45))",
              }}
            >
              {username}
            </motion.span>
          </>
        ) : null}
        <span>.</span>
      </motion.h1>
    </div>
  );
}

/* ── Floating 3D particles ────────────────────────────────────────────────── */
function Particles() {
  const dots = React.useMemo(
    () => Array.from({ length: 14 }).map(() => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      size: 1.5 + Math.random() * 2.5,
      dur: 6 + Math.random() * 8,
      delay: Math.random() * 5,
      drift: 20 + Math.random() * 40,
    })),
    [],
  );
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {dots.map((d, i) => (
        <motion.span
          key={i}
          className="absolute rounded-full bg-brand/40"
          style={{ left: `${d.left}%`, top: `${d.top}%`, width: d.size, height: d.size }}
          animate={{ y: [0, -d.drift, 0], opacity: [0, 0.8, 0] }}
          transition={{ duration: d.dur, repeat: Infinity, ease: "easeInOut", delay: d.delay }}
        />
      ))}
    </div>
  );
}
