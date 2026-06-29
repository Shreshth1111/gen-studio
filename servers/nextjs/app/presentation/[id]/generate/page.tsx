"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, CheckCircle2, Loader2, AlertCircle, ArrowRight,
} from "lucide-react";
import {
  startGeneration, outlineChunk, outlineDone, structureDone,
  slideStart, slideContentChunk, slidePartial, slideDone,
  imageStart, imageProgress, imageDone,
  generationComplete, generationError,
  selectGenerationPhase, selectSlidesGenerated, selectTotalSlides,
  selectOutlineText, selectIsGenerating,
  selectOutline, selectPartialSlides, selectCurrentSlide,
} from "@/store/generationSlice";
import { THEMES } from "@/lib/themes";
import { getPresentation } from "@/lib/api/presentations";
import LiveSlide from "@/components/generation/LiveSlide";

const PHASE_ORDER = ["idle", "outline", "structure", "slides", "images", "complete"];
const PHASES = [
  { key: "outline",   label: "Outlining" },
  { key: "structure", label: "Structuring" },
  { key: "slides",    label: "Writing slides" },
  { key: "images",    label: "Generating visuals" },
  { key: "complete",  label: "Ready" },
];

function PhaseIndicator({ current }: { current: string }) {
  const currentIdx = PHASE_ORDER.indexOf(current);
  return (
    <div className="space-y-2">
      {PHASES.map((p) => {
        const idx = PHASE_ORDER.indexOf(p.key);
        const isDone = idx < currentIdx;
        const isActive = p.key === current;
        return (
          <div
            key={p.key}
            className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-colors ${
              isActive
                ? "bg-blue-500/15 border border-blue-500/30 text-blue-100"
                : isDone
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-300"
                  : "border border-transparent text-slate-500"
            }`}
          >
            <div className="w-3.5 h-3.5 flex-shrink-0">
              {isDone ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : isActive ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-300" />
              ) : (
                <div className="w-3.5 h-3.5 rounded-full border border-slate-600" />
              )}
            </div>
            <span className="text-xs font-medium">{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function GeneratePage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useDispatch();
  const id = params.id as string;

  const phase = useSelector(selectGenerationPhase);
  const slidesGenerated = useSelector(selectSlidesGenerated);
  const totalSlides = useSelector(selectTotalSlides);
  const outline = useSelector(selectOutline);
  const outlineText = useSelector(selectOutlineText);
  const isGenerating = useSelector(selectIsGenerating);
  const partialSlides = useSelector(selectPartialSlides);
  const activeSlideNumber = useSelector(selectCurrentSlide);

  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [themeKey, setThemeKey] = useState<string>("dark");

  const startedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef(0);
  const slideRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const outlineRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const theme = THEMES[themeKey] || THEMES.dark;

  // Resolve presentation theme so live preview matches the editor's final look
  useEffect(() => {
    (async () => {
      try {
        const data = await getPresentation(id);
        if (data?.theme && THEMES[data.theme]) setThemeKey(data.theme);
      } catch {
        /* noop — keep default */
      }
    })();
  }, [id]);

  // Outline auto-scroll
  useEffect(() => {
    if (outlineRef.current) {
      outlineRef.current.scrollTop = outlineRef.current.scrollHeight;
    }
  }, [outlineText]);

  // Auto-scroll the stage to the slide currently being generated
  useEffect(() => {
    if (activeSlideNumber == null) return;
    const el = slideRefs.current[activeSlideNumber];
    if (el && stageRef.current) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeSlideNumber]);

  // Elapsed-time ticker
  useEffect(() => {
    if (!isGenerating) return;
    startTimeRef.current = Date.now();
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)),
      1000,
    );
    return () => clearInterval(t);
  }, [isGenerating]);

  // Open the SSE stream
  useEffect(() => {
    if (startedRef.current) return;
    let isMounted = true;
    const abort = new AbortController();

    // Defeat React Strict Mode double-fire
    const startTimer = setTimeout(() => {
      if (!isMounted) return;
      startedRef.current = true;

      const token = localStorage.getItem("token") || "";
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8085";
      const streamUrl = `${backendUrl}/api/v1/presentations/${id}/generate/stream?token=${encodeURIComponent(token)}`;

      dispatch(startGeneration({ totalSlides: 8 }));
      abortRef.current = abort;

      (async () => {
        try {
          const res = await fetch(streamUrl, {
            method: "GET",
            signal: abort.signal,
            headers: { Accept: "text/event-stream" },
          });
          if (!res.ok) {
            const txt = await res.text();
            throw new Error(`HTTP ${res.status}: ${txt.slice(0, 100)}`);
          }
          if (!res.body) throw new Error("No response body");

          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const parts = buffer.split("\n\n");
            buffer = parts.pop() ?? "";

            for (const part of parts) {
              if (!part.trim()) continue;
              const lines = part.trim().split("\n");
              let eventType = "";
              let dataStr = "";
              for (const line of lines) {
                if (line.startsWith("event: ")) eventType = line.slice(7).trim();
                else if (line.startsWith("data: ")) dataStr = line.slice(6).trim();
              }
              if (!eventType || !dataStr) continue;
              let data: any = {};
              try { data = JSON.parse(dataStr); } catch { /* noop */ }

              switch (eventType) {
                case "outline_chunk":      dispatch(outlineChunk(data)); break;
                case "outline_done":       dispatch(outlineDone(data)); break;
                case "structure_done":     dispatch(structureDone(data)); break;
                case "slide_start":        dispatch(slideStart(data)); break;
                case "slide_content_chunk":dispatch(slideContentChunk(data)); break;
                case "slide_partial":      dispatch(slidePartial(data)); break;
                case "slide_done":         dispatch(slideDone(data)); break;
                case "image_start":        dispatch(imageStart(data)); break;
                case "image_progress":     dispatch(imageProgress(data)); break;
                case "image_done":         dispatch(imageDone(data)); break;
                case "generation_complete":dispatch(generationComplete(data)); break;
                case "error":
                  dispatch(generationError(data));
                  setError(data.message || "Generation failed");
                  break;
              }
            }
          }
        } catch (err: any) {
          if (err.name === "AbortError") return;
          const msg = err.message || "Connection failed";
          setError(msg);
          dispatch(generationError({ message: msg }));
        }
      })();
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(startTimer);
      if (startedRef.current) abort.abort();
    };
  }, []);

  // After completion, give the user a moment to read, then jump to the editor
  useEffect(() => {
    if (phase !== "complete") return;
    const t = setTimeout(() => router.push(`/presentation/${id}`), 2500);
    return () => clearTimeout(t);
  }, [phase]);

  const liveSlides = useMemo(() => {
    const numbersFromOutline = outline.map((o: any) => o.slide_number);
    const numbersFromPartial = Object.keys(partialSlides).map((n) => parseInt(n));
    const all = Array.from(new Set([...numbersFromOutline, ...numbersFromPartial]))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    return all.map((num) => {
      const partial = partialSlides[num];
      const outlineSlot = outline.find((o: any) => o.slide_number === num);
      if (partial) return partial;
      // Outline-known slot, content not started yet
      return {
        slide_number: num,
        layout_type: outlineSlot?.layout_type || "bullets",
        title: outlineSlot?.title || `Slide ${num}`,
        content: { title: outlineSlot?.title || `Slide ${num}` },
        done: false,
      };
    });
  }, [partialSlides, outline]);

  const progress = totalSlides > 0
    ? Math.min(100, Math.round((slidesGenerated / totalSlides) * 100))
    : 0;
  const fmt = (s: number) =>
    s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col selection:bg-blue-500/30">
      {/* Header */}
      <div className="sticky top-0 z-50 border-b border-slate-800/80 bg-slate-900/70 backdrop-blur-xl px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/30">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="font-bold text-white text-sm tracking-tight">PPT Generator</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                Live generation
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="text-right">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              Elapsed
            </div>
            <div className="font-mono text-white text-sm tabular-nums">{fmt(elapsed)}</div>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div className="text-right min-w-[68px]">
            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              Progress
            </div>
            <div className="flex items-center gap-2 justify-end">
              <span className="font-mono text-white text-sm tabular-nums">{progress}%</span>
              <div className="w-16 h-1 rounded-full bg-slate-800 overflow-hidden">
                <motion.div
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.4 }}
                  className="h-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px,1fr] gap-0 overflow-hidden">
        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <aside className="border-r border-slate-800/60 bg-slate-900/40 flex flex-col h-[calc(100vh-57px)] overflow-hidden">
          <div className="p-5 space-y-5 flex flex-col flex-1 overflow-hidden">
            <PhaseIndicator current={phase} />

            <div className="flex flex-col flex-1 min-h-0 bg-slate-950/60 border border-slate-800/60 rounded-xl overflow-hidden">
              <div className="px-3 py-2 border-b border-slate-800/60 bg-slate-900/40 flex items-center justify-between">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Outline stream
                </span>
                <Loader2 className={`w-3 h-3 ${phase === "outline" ? "animate-spin text-blue-400" : "text-slate-700"}`} />
              </div>
              <div
                ref={outlineRef}
                className="flex-1 p-3 overflow-y-auto font-mono text-[10px] leading-snug text-slate-400 custom-scrollbar"
              >
                {outlineText ? (
                  <>
                    {outlineText}
                    {phase === "outline" && (
                      <span className="inline-block w-1.5 h-3 bg-blue-400 animate-pulse ml-0.5 align-middle" />
                    )}
                  </>
                ) : (
                  <span className="opacity-30 italic">Awaiting outline…</span>
                )}
              </div>
            </div>

            {outline.length > 0 && (
              <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 max-h-[240px] overflow-y-auto custom-scrollbar">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">
                  Slides ({outline.length})
                </div>
                <div className="space-y-1">
                  {outline.map((o: any) => {
                    const p = partialSlides[o.slide_number];
                    const status = p?.done
                      ? "done"
                      : activeSlideNumber === o.slide_number
                        ? "active"
                        : p
                          ? "queued"
                          : "pending";
                    return (
                      <button
                        key={o.slide_number}
                        onClick={() => {
                          slideRefs.current[o.slide_number]?.scrollIntoView({
                            behavior: "smooth", block: "center",
                          });
                        }}
                        className={`w-full text-left flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-colors ${
                          status === "active"
                            ? "bg-blue-500/15 text-blue-200"
                            : status === "done"
                              ? "text-emerald-300 hover:bg-emerald-500/10"
                              : "text-slate-400 hover:bg-slate-800/40"
                        }`}
                      >
                        <span className="font-mono text-[10px] text-slate-500 w-4">
                          {String(o.slide_number).padStart(2, "0")}
                        </span>
                        <span className="truncate flex-1">{o.title}</span>
                        {status === "active" && <Loader2 className="w-3 h-3 animate-spin text-blue-400" />}
                        {status === "done" && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {error && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-red-500/10 border border-red-500/30 rounded-xl p-3"
              >
                <div className="flex gap-2">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-red-300 text-xs font-bold">Generation failed</p>
                    <p className="text-red-300/70 text-[10px] mt-1 leading-relaxed break-words">{error}</p>
                    <button
                      onClick={() => router.push("/dashboard")}
                      className="mt-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-md text-[10px] font-bold uppercase transition-colors"
                    >
                      Back to dashboard
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {phase === "complete" && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-200 text-xs font-bold">Presentation ready</span>
                </div>
                <p className="text-emerald-300/70 text-[10px]">Opening editor…</p>
                <button
                  onClick={() => router.push(`/presentation/${id}`)}
                  className="mt-2 w-full flex items-center justify-center gap-1 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 rounded-md text-[10px] font-bold uppercase transition-colors"
                >
                  Open now <ArrowRight className="w-3 h-3" />
                </button>
              </motion.div>
            )}
          </div>
        </aside>

        {/* ── Live stage ───────────────────────────────────────────── */}
        <main
          ref={stageRef}
          className="overflow-y-auto custom-scrollbar h-[calc(100vh-57px)] py-12 px-12"
        >
          <div className="max-w-[1100px] mx-auto space-y-12">
            {liveSlides.length === 0 ? (
              <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600/20 via-indigo-600/20 to-violet-600/20 border border-slate-800 flex items-center justify-center mb-4">
                  <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                </div>
                <h2 className="text-xl font-bold text-white">Drafting your outline…</h2>
                <p className="text-slate-500 text-sm mt-2 max-w-md">
                  Slides will start appearing here as the model finishes the outline. Each one
                  fills in live — title first, then content, then visuals.
                </p>
              </div>
            ) : (
              <AnimatePresence>
                {liveSlides.map((s: any) => (
                  <div
                    key={s.slide_number}
                    ref={(el) => { slideRefs.current[s.slide_number] = el; }}
                    className="scroll-mt-16"
                  >
                    <LiveSlide
                      slide={s}
                      theme={theme}
                      isActive={activeSlideNumber === s.slide_number}
                    />
                  </div>
                ))}
              </AnimatePresence>
            )}
          </div>
        </main>
      </div>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(51, 65, 85, 0.5);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(71, 85, 105, 0.8);
        }
      `}</style>
    </div>
  );
}
