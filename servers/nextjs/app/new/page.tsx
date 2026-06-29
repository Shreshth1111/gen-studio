"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import { motion, AnimatePresence } from "framer-motion";
import { Check, ChevronRight, ChevronLeft, Sparkles, ArrowLeft, FileText, Loader2, X } from "lucide-react";
import { createPresentation, parseDocument } from "@/lib/api/presentations";
import { setPresentationConfig } from "@/store/generationSlice";
import { THEMES } from "@/lib/themes";

const TONES = [
  { key: "professional", label: "Professional",  emoji: "👔", desc: "Formal, business-ready" },
  { key: "educational",  label: "Educational",   emoji: "🎓", desc: "Clear, structured learning" },
  { key: "casual",       label: "Casual",         emoji: "😊", desc: "Conversational and friendly" },
  { key: "sales_pitch",  label: "Sales Pitch",    emoji: "🚀", desc: "Persuasive and compelling" },
  { key: "funny",        label: "Funny",           emoji: "😄", desc: "Light-hearted, entertaining" },
  { key: "default",      label: "Balanced",        emoji: "⚡", desc: "Mix of professional & clear" },
];

const DENSITIES = [
  { key: "concise",     label: "Concise",  desc: "Short bullets, key points only",  slides: "5–8" },
  { key: "standard",   label: "Standard", desc: "Balanced text and visuals",         slides: "8–12" },
  { key: "text-heavy", label: "Detailed", desc: "Rich content, deep explanations",   slides: "12–20" },
];

const SLIDE_COUNTS = [5, 8, 10, 12, 15, 20];

const STEP_TITLES = [
  "What's your presentation about?",
  "Who's your audience & tone?",
  "How detailed should it be?",
  "Pick your theme",
  "Source document (optional)",
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center">
          <motion.div
            animate={{
              backgroundColor: i <= current ? "#3B82F6" : "transparent",
              borderColor: i <= current ? "#3B82F6" : "#475569",
              scale: i === current ? 1.15 : 1,
            }}
            transition={{ duration: 0.25 }}
            className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold text-white"
          >
            {i < current ? <Check className="w-3.5 h-3.5" /> : i + 1}
          </motion.div>
          {i < total - 1 && (
            <motion.div
              animate={{ backgroundColor: i < current ? "#3B82F6" : "#334155" }}
              transition={{ duration: 0.3 }}
              className="h-0.5 w-8"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export default function NewPresentationPage() {
  const router = useRouter();
  const dispatch = useDispatch();
  const [step, setStep] = useState(0);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");
  const [config, setConfig] = useState({
    topic: "",
    audience: "",
    tone: "professional",
    contentDensity: "standard",
    slideCount: 8,
    theme: "dark",
    language: "English",
  });
  const [sourceDoc, setSourceDoc] = useState<{
    filename: string;
    length: number;
    truncated: boolean;
    text: string;
  } | null>(null);
  const [docUploading, setDocUploading] = useState(false);
  const [docError, setDocError] = useState("");

  const handleSourceFile = async (file: File) => {
    setDocError("");
    setDocUploading(true);
    try {
      const parsed = await parseDocument(file);
      setSourceDoc(parsed);
    } catch (err: any) {
      setDocError(
        err?.response?.data?.detail || err?.message || "Failed to parse document",
      );
    } finally {
      setDocUploading(false);
    }
  };

  const update = (patch: Partial<typeof config>) => setConfig(c => ({ ...c, ...patch }));

  const canProceed = () => {
    if (step === 0) return config.topic.trim().length >= 5;
    if (step === 1) return !!config.tone;
    if (step === 2) return !!config.contentDensity && config.slideCount > 0;
    if (step === 3) return !!config.theme;
    return true;
  };

  const handleFinish = async () => {
    setIsCreating(true);
    setError("");
    try {
      const pres = await createPresentation({
        topic: config.topic,
        audience: config.audience,
        tone: config.tone,
        content_density: config.contentDensity,
        slide_count: config.slideCount,
        theme: config.theme,
        language: config.language,
        source_text: sourceDoc?.text,
      });
      dispatch(setPresentationConfig({ presentationId: pres.id, config }));
      router.push(`/presentation/${pres.id}/generate`);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Failed to create presentation");
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Back */}
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 text-slate-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>

        <StepIndicator current={step} total={5} />

        {/* Title */}
        <AnimatePresence mode="wait">
          <motion.h2
            key={step + "title"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="text-2xl font-bold text-white text-center mb-6"
          >
            {STEP_TITLES[step]}
          </motion.h2>
        </AnimatePresence>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 mb-4 text-sm text-center">
            {error}
          </div>
        )}

        {/* Step content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-2xl p-8 shadow-2xl"
          >
            {step === 0 && (
              <div className="space-y-4">
                <textarea
                  autoFocus
                  placeholder="e.g. The future of artificial intelligence and its impact on healthcare by 2030"
                  value={config.topic}
                  onChange={e => update({ topic: e.target.value })}
                  className="w-full min-h-[120px] bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none text-lg transition-colors"
                />
                <input
                  placeholder="Language (default: English)"
                  value={config.language}
                  onChange={e => update({ language: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <p className="text-slate-500 text-sm">
                  Be specific. Include your audience, goal, and key points. — {config.topic.length} chars
                </p>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-4">
                <input
                  placeholder="Who is your audience? (e.g. investors, students, clients)"
                  value={config.audience}
                  onChange={e => update({ audience: e.target.value })}
                  className="w-full bg-slate-900 border border-slate-600 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <div className="grid grid-cols-2 gap-3 mt-2">
                  {TONES.map(t => (
                    <motion.button
                      key={t.key}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => update({ tone: t.key })}
                      className={`p-4 rounded-xl border-2 text-left transition-colors ${
                        config.tone === t.key
                          ? "border-blue-500 bg-blue-500/10 text-white"
                          : "border-slate-600 bg-slate-900/60 text-slate-300 hover:border-slate-400"
                      }`}
                    >
                      <span className="text-2xl">{t.emoji}</span>
                      <p className="font-semibold mt-1 text-sm">{t.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t.desc}</p>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-6">
                <div>
                  <p className="text-slate-300 text-sm font-medium mb-3">Content density</p>
                  <div className="grid grid-cols-3 gap-3">
                    {DENSITIES.map(d => (
                      <motion.button
                        key={d.key}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => update({ contentDensity: d.key })}
                        className={`p-4 rounded-xl border-2 text-left transition-colors ${
                          config.contentDensity === d.key
                            ? "border-blue-500 bg-blue-500/10 text-white"
                            : "border-slate-600 bg-slate-900/60 text-slate-300 hover:border-slate-400"
                        }`}
                      >
                        <p className="font-semibold text-sm">{d.label}</p>
                        <p className="text-xs text-slate-400 mt-1">{d.desc}</p>
                        <p className="text-xs text-blue-400 mt-1">{d.slides} slides</p>
                      </motion.button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-slate-300 text-sm font-medium mb-3">
                    Slide count: <span className="text-blue-400 font-bold">{config.slideCount}</span>
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {SLIDE_COUNTS.map(n => (
                      <motion.button
                        key={n}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => update({ slideCount: n })}
                        className={`w-12 h-12 rounded-xl border-2 font-semibold text-sm transition-colors ${
                          config.slideCount === n
                            ? "border-blue-500 bg-blue-500 text-white"
                            : "border-slate-600 bg-slate-900 text-slate-300 hover:border-slate-400"
                        }`}
                      >
                        {n}
                      </motion.button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div>
                <p className="text-slate-300 text-sm font-medium mb-4">Choose a color theme</p>
                <div className="grid grid-cols-3 gap-3">
                  {Object.entries(THEMES).map(([key, theme]) => (
                    <motion.button
                      key={key}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => update({ theme: key })}
                      className={`rounded-xl overflow-hidden border-2 transition-all ${
                        config.theme === key ? "border-blue-500 ring-2 ring-blue-500/30" : "border-slate-700"
                      }`}
                    >
                      <div
                        className="h-16 flex items-center justify-center relative"
                        style={{ backgroundColor: theme.bg }}
                      >
                        <div className="flex gap-1">
                          <div className="w-6 h-1.5 rounded" style={{ backgroundColor: theme.heading }} />
                          <div className="w-4 h-1.5 rounded" style={{ backgroundColor: theme.accent }} />
                        </div>
                        {config.theme === key && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                            <Check className="w-3 h-3 text-white" />
                          </div>
                        )}
                      </div>
                      <div className="bg-slate-800 px-2 py-1.5 text-center">
                        <span className="text-xs font-medium text-slate-200 capitalize">{key.replace(/_/g, " ")}</span>
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="space-y-4">
                <p className="text-slate-400 text-sm">
                  Upload a PDF or DOCX file. Its contents will be used as the
                  primary source for your presentation. Optional — skip to
                  generate from your topic prompt only.
                </p>

                {sourceDoc ? (
                  <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4 flex items-start gap-3">
                    <FileText className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <p className="text-emerald-200 font-semibold text-sm truncate">
                        {sourceDoc.filename}
                      </p>
                      <p className="text-emerald-300/70 text-xs mt-1">
                        {sourceDoc.length.toLocaleString()} characters extracted
                        {sourceDoc.truncated && " (truncated to fit context)"}
                      </p>
                    </div>
                    <button
                      onClick={() => setSourceDoc(null)}
                      className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
                      title="Remove"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      const f = e.dataTransfer.files?.[0];
                      if (f) handleSourceFile(f);
                    }}
                    className={`relative block border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                      docUploading
                        ? "border-blue-500/50 bg-blue-500/5"
                        : "border-slate-600 hover:border-slate-400"
                    }`}
                  >
                    <input
                      type="file"
                      accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleSourceFile(f);
                        e.target.value = "";
                      }}
                      disabled={docUploading}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                    {docUploading ? (
                      <div className="flex flex-col items-center gap-2">
                        <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
                        <p className="text-blue-300 text-sm">Reading document…</p>
                      </div>
                    ) : (
                      <>
                        <p className="text-slate-300 text-sm">Drag & drop or click to upload</p>
                        <p className="text-slate-500 text-xs mt-1">.pdf, .docx — up to 10 MB</p>
                      </>
                    )}
                  </label>
                )}

                {docError && (
                  <p className="text-red-400 text-xs text-center">{docError}</p>
                )}

                <p className="text-slate-500 text-xs text-center">
                  Skip this step to generate from your topic only.
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Navigation */}
        <div className="flex justify-between mt-6">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setStep(s => s - 1)}
            disabled={step === 0}
            className="flex items-center gap-1 px-4 py-2 text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> Back
          </motion.button>

          {step < 4 ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setStep(s => s + 1)}
              disabled={!canProceed()}
              className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white px-6 py-2 rounded-xl font-semibold transition-colors"
            >
              Next <ChevronRight className="w-4 h-4" />
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleFinish}
              disabled={isCreating}
              className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white px-8 py-2 rounded-xl font-semibold transition-all disabled:opacity-60"
            >
              {isCreating ? (
                <><span className="animate-spin">⟳</span> Creating...</>
              ) : (
                <><Sparkles className="w-4 h-4" /> Generate Presentation</>
              )}
            </motion.button>
          )}
        </div>
      </div>
    </div>
  );
}
