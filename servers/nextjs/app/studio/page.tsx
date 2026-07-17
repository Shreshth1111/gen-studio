"use client";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  ArrowLeft, ImageIcon, BookOpen, ListChecks, Presentation, ArrowUpRight,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { IconButton, cn } from "@/lib/ui";
import { Footer } from "@/components/Footer";

const TOOLS = [
  { href: "/new",          icon: Presentation, title: "Presentation",  desc: "Generate a full, on-brand slide deck — live.", grad: "from-brand to-[#5B4DE8]" },
  { href: "/studio/images", icon: ImageIcon,    title: "Image Studio",  desc: "Create crisp visuals from a prompt and download.", grad: "from-sky-500 to-cyan-600" },
  { href: "/studio/notes",  icon: BookOpen,     title: "Lecture Notes", desc: "Structured notes with tables, charts & a PDF.", grad: "from-emerald-500 to-teal-600" },
  { href: "/studio/quiz",   icon: ListChecks,   title: "Quiz Builder",  desc: "Bloom-tagged questions with reveal-able answers.", grad: "from-orange-500 to-amber-600" },
];

export default function StudioHub() {
  const router = useRouter();
  return (
    <div className="min-h-screen flex flex-col">
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute -top-40 -left-32 w-[40rem] h-[40rem] rounded-full bg-brand/10 blur-[140px]" />
        <div className="absolute top-1/4 right-0 w-[32rem] h-[32rem] rounded-full bg-indigo-500/8 blur-[140px]" />
      </div>

      <header className="sticky top-0 z-30 border-b border-line bg-bg/70 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-3">
          <IconButton onClick={() => router.push("/dashboard")} title="Dashboard" aria-label="Dashboard">
            <ArrowLeft className="w-4 h-4" />
          </IconButton>
          <Logo />
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-14">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
          <h1 className="text-display text-text">GenStudio</h1>
          <p className="text-muted mt-2 max-w-lg">Four AI tools, one workspace. Pick what you want to create.</p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-5 mt-10" style={{ perspective: 1400 }}>
          {TOOLS.map((t, i) => (
            <motion.button
              key={t.href}
              initial={{ opacity: 0, y: 24, rotateX: -8 }}
              animate={{ opacity: 1, y: 0, rotateX: 0 }}
              transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -6, rotateX: 5, rotateY: -4 }}
              style={{ transformStyle: "preserve-3d" }}
              onClick={() => router.push(t.href)}
              className="group relative text-left rounded-2xl border border-line bg-surface p-6 overflow-hidden shadow-e1 hover:shadow-e3 hover:border-line-strong transition-shadow"
            >
              <div className={cn("absolute -right-10 -top-10 w-40 h-40 rounded-full blur-2xl opacity-20 bg-gradient-to-br transition-opacity group-hover:opacity-40", t.grad)} />
              <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center bg-gradient-to-br shadow-lg", t.grad)} style={{ transform: "translateZ(40px)" }}>
                <t.icon className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-xl font-bold text-text mt-5 flex items-center gap-2">
                {t.title}
                <ArrowUpRight className="w-4 h-4 text-faint group-hover:text-brand transition-colors" />
              </h3>
              <p className="text-muted text-sm mt-1.5 leading-relaxed">{t.desc}</p>
            </motion.button>
          ))}
        </div>
      </main>

      <Footer />
    </div>
  );
}
