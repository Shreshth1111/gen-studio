"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wand2, Upload, FileText, X, Eye, EyeOff, CheckCircle2, ListChecks, PenLine, Download,
} from "lucide-react";
import { StudioShell } from "@/components/studio/StudioShell";
import { Button, Card, Badge, cn } from "@/lib/ui";
import { LiveDeck } from "@/components/studio/LiveDeck";
import { generateQuiz, parseDoc, type QuizQuestion } from "@/lib/api/studio";

const DIFFS = ["easy", "medium", "hard"] as const;
const DIFF_TONE: Record<string, "success" | "warning" | "danger"> = { easy: "success", medium: "warning", hard: "danger" };

export default function QuizBuilderPage() {
  const [topic, setTopic] = useState("");
  const [doc, setDoc] = useState<{ text: string; filename: string } | null>(null);
  const [counts, setCounts] = useState({
    mcq_easy: 2, mcq_medium: 2, mcq_hard: 1,
    subj_easy: 0, subj_medium: 1, subj_hard: 1,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [revealAll, setRevealAll] = useState(false);
  const [revealed, setRevealed] = useState<Set<number>>(new Set());

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const set = (k: keyof typeof counts, v: number) => setCounts(c => ({ ...c, [k]: Math.max(0, Math.min(10, v)) }));

  const upload = async (file: File) => {
    try { const r = await parseDoc(file); setDoc({ text: r.text, filename: file.name }); }
    catch { setError("Could not read that document."); }
  };

  const run = async () => {
    if (!topic.trim() || total === 0) return;
    setLoading(true); setError(""); setRevealed(new Set()); setRevealAll(false);
    try {
      const { questions } = await generateQuiz({ topic, source_text: doc?.text, ...counts });
      setQuestions(questions);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Could not generate the quiz. Try again.");
    } finally { setLoading(false); }
  };

  const isRevealed = (id: number) => revealAll || revealed.has(id);
  const toggle = (id: number) => setRevealed(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const downloadPdf = (withAnswers: boolean) => {
    if (!questions.length) return;
    const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const items = questions.map(q => {
      const opts = q.type === "mcq" && q.options
        ? `<ol type="A" class="opts">${q.options.map(o => `<li${withAnswers && o.trim() === q.answer.trim() ? ' class="correct"' : ""}>${esc(o)}</li>`).join("")}</ol>`
        : "";
      const ans = withAnswers
        ? `<div class="ans"><strong>Answer:</strong> ${esc(q.answer)}${q.explanation ? `<br><em>Why:</em> ${esc(q.explanation)}` : ""}</div>`
        : "";
      return `<div class="q"><div class="meta">Q${q.id} · ${q.difficulty} · ${esc(q.bloom)} · ${q.type === "mcq" ? "MCQ" : "Subjective"}</div>
        <p class="qt">${esc(q.question)}</p>${opts}${ans}</div>`;
    }).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(topic)} — Quiz</title>
      <style>
        body{font-family:Arial,sans-serif;max-width:760px;margin:36px auto;padding:0 24px;color:#1a1a1a;line-height:1.5}
        h1{font-size:26px;border-bottom:2px solid #F59E0B;padding-bottom:6px}
        .q{margin:24px 0;page-break-inside:avoid}.q strong{display:block;margin-bottom:8px;font-size:16px}
        .meta{font-size:11px;text-transform:capitalize;color:#F59E0B;font-weight:bold;letter-spacing:.04em}
        .qt{font-weight:bold;margin:6px 0}.opts{margin:6px 0 0 4px}.opts li{margin:3px 0}
        .opts li.correct{color:#0a7d36;font-weight:bold}
        .ans{margin-top:10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px 10px;font-size:14px}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>${esc(topic)} — Quiz</h1>
      <p style="color:#666;font-size:13px">${questions.length} questions${withAnswers ? " · with answer key" : ""}</p>
      ${items}</body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 350);
  };

  return (
    <StudioShell title="Quiz Builder" eyebrow="Assessments">
      <p className="text-muted mb-8">Generate Bloom-tagged questions with answers — pick exactly how many of each type and difficulty.</p>

      <div className="grid lg:grid-cols-[380px,1fr] gap-8">
        {/* ── Controls ──────────────────────────────────────────────── */}
        <Card className="p-6 h-fit lg:sticky lg:top-24">
          <label className="text-xs font-semibold text-muted mb-2 block">Topic</label>
          <input value={topic} onChange={e => setTopic(e.target.value)}
            placeholder="e.g. Newton's Laws of Motion"
            className="w-full h-10 rounded-md bg-surface-2 border border-line px-3.5 text-sm text-text placeholder:text-faint focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />

          {/* doc upload */}
          <label className="text-xs font-semibold text-muted mt-5 mb-2 block">Source document (optional)</label>
          {doc ? (
            <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success/5 p-2.5">
              <FileText className="w-4 h-4 text-success shrink-0" />
              <span className="text-xs text-text truncate flex-1">{doc.filename}</span>
              <button onClick={() => setDoc(null)}><X className="w-4 h-4 text-muted hover:text-text" /></button>
            </div>
          ) : (
            <label className="flex items-center justify-center gap-2 rounded-md border border-dashed border-line-strong p-3 text-xs text-muted hover:text-text hover:border-brand cursor-pointer transition-colors">
              <Upload className="w-4 h-4" /> Upload PDF / DOCX
              <input type="file" accept=".pdf,.docx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
            </label>
          )}

          {/* count matrix */}
          <label className="text-xs font-semibold text-muted mt-5 mb-2 block">Questions ({total})</label>
          <div className="rounded-lg border border-line overflow-hidden">
            <div className="grid grid-cols-4 bg-surface-2 text-[10px] font-bold uppercase tracking-wide text-faint">
              <div className="px-3 py-2">Type</div>
              {DIFFS.map(d => <div key={d} className="px-2 py-2 text-center capitalize">{d}</div>)}
            </div>
            {[
              { label: "MCQ", icon: <ListChecks className="w-3.5 h-3.5" />, keys: ["mcq_easy", "mcq_medium", "mcq_hard"] as const },
              { label: "Subjective", icon: <PenLine className="w-3.5 h-3.5" />, keys: ["subj_easy", "subj_medium", "subj_hard"] as const },
            ].map(row => (
              <div key={row.label} className="grid grid-cols-4 border-t border-line items-center">
                <div className="px-3 py-2 flex items-center gap-1.5 text-xs text-text font-medium">{row.icon}{row.label}</div>
                {row.keys.map(k => (
                  <div key={k} className="px-2 py-1.5 flex justify-center">
                    <input type="number" min={0} max={10} value={counts[k]}
                      onChange={e => set(k, parseInt(e.target.value) || 0)}
                      className="w-12 h-8 rounded-md bg-surface border border-line text-center text-sm text-text focus:outline-none focus:border-brand" />
                  </div>
                ))}
              </div>
            ))}
          </div>

          <Button onClick={run} loading={loading} size="lg" className="w-full mt-6"
            disabled={!topic.trim() || total === 0 || loading}>
            <Wand2 className="w-4 h-4" /> {loading ? "Building…" : `Generate ${total} questions`}
          </Button>
          {error && <p className="text-danger text-xs mt-3 text-center">{error}</p>}
        </Card>

        {/* ── Questions ─────────────────────────────────────────────── */}
        <div>
          {questions.length > 0 && (
            <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
              <p className="text-muted text-sm"><span className="text-text font-semibold">{questions.length}</span> questions</p>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => downloadPdf(false)} title="Question paper only">
                  <Download className="w-4 h-4" /> Paper
                </Button>
                <Button variant="ghost" size="sm" onClick={() => downloadPdf(true)} title="With answer key">
                  <Download className="w-4 h-4" /> Answer key
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setRevealAll(v => !v)}>
                  {revealAll ? <><EyeOff className="w-4 h-4" /> Hide answers</> : <><Eye className="w-4 h-4" /> Reveal all</>}
                </Button>
              </div>
            </div>
          )}

          {loading ? (
            <LiveDeck tool="quiz" title={topic} />
          ) : questions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong h-[420px] flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-soft flex items-center justify-center mb-4">
                <ListChecks className="w-8 h-8 text-brand" />
              </div>
              <p className="text-text font-semibold">Your quiz will appear here</p>
              <p className="text-muted text-sm mt-1">Set the counts and hit Generate.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {questions.map((q, i) => (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 18 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.05, 0.4) }}
                >
                  <Card className="p-5">
                    <div className="flex items-center gap-2 mb-3 flex-wrap">
                      <span className="w-7 h-7 rounded-lg bg-brand text-brand-fg flex items-center justify-center text-xs font-bold">{q.id}</span>
                      <Badge tone={DIFF_TONE[q.difficulty]} className="capitalize">{q.difficulty}</Badge>
                      <Badge tone="brand">{q.bloom}</Badge>
                      <Badge tone="neutral">{q.type === "mcq" ? "MCQ" : "Subjective"}</Badge>
                    </div>

                    <p className="text-text font-medium leading-relaxed">{q.question}</p>

                    {q.type === "mcq" && q.options && (
                      <div className="grid sm:grid-cols-2 gap-2 mt-3">
                        {q.options.map((opt, oi) => {
                          const correct = isRevealed(q.id) && opt.trim() === q.answer.trim();
                          return (
                            <div key={oi} className={cn(
                              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors",
                              correct ? "border-success/50 bg-success/10 text-success" : "border-line text-muted")}>
                              <span className="w-5 h-5 rounded-full border border-current flex items-center justify-center text-[10px] font-bold shrink-0">
                                {String.fromCharCode(65 + oi)}
                              </span>
                              <span className="flex-1">{opt}</span>
                              {correct && <CheckCircle2 className="w-4 h-4" />}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    <div className="mt-3 flex items-center gap-3">
                      <button onClick={() => toggle(q.id)}
                        className="text-xs font-semibold text-brand hover:text-brand-hover flex items-center gap-1.5">
                        {isRevealed(q.id) ? <><EyeOff className="w-3.5 h-3.5" /> Hide answer</> : <><Eye className="w-3.5 h-3.5" /> Reveal answer</>}
                      </button>
                    </div>

                    <AnimatePresence>
                      {isRevealed(q.id) && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 rounded-lg border border-success/30 bg-success/5 p-3.5">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-success mb-1">Answer</p>
                            <p className="text-sm text-text">{q.answer}</p>
                            {q.explanation && (
                              <p className="text-xs text-muted mt-2 leading-relaxed"><span className="font-semibold text-text">Why: </span>{q.explanation}</p>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
