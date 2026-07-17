"use client";
import * as React from "react";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  Wand2, Upload, FileText, X, Download, Clock, BookOpen, Quote, Table2, BarChart3,
} from "lucide-react";
import { StudioShell } from "@/components/studio/StudioShell";
import { Button, Card, Badge, cn } from "@/lib/ui";
import { LiveDeck } from "@/components/studio/LiveDeck";
import { generateNotes, parseDoc, type LectureNotes, type NotesSection } from "@/lib/api/studio";

const DEPTHS = [
  { key: "brief", label: "Brief" },
  { key: "standard", label: "Standard" },
  { key: "detailed", label: "Detailed" },
];

/* ── tiny inline-markdown renderer (bold + code) ──────────────────────────── */
function inline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="text-text font-semibold">{p.slice(2, -2)}</strong>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="px-1.5 py-0.5 rounded bg-surface-2 text-brand text-[0.85em] font-mono">{p.slice(1, -1)}</code>;
    return <React.Fragment key={i}>{p}</React.Fragment>;
  });
}
function Body({ text }: { text: string }) {
  const lines = (text || "").split("\n").filter(l => l.trim());
  const out: React.ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: number) => {
    if (bullets.length) {
      out.push(<ul key={`u${k}`} className="my-2 space-y-1.5">{bullets.map((b, i) =>
        <li key={i} className="flex gap-2 text-muted leading-relaxed"><span className="text-brand mt-1.5 w-1 h-1 rounded-full bg-brand shrink-0" />{inline(b)}</li>)}</ul>);
      bullets = [];
    }
  };
  lines.forEach((l, i) => {
    if (/^[-*]\s+/.test(l)) bullets.push(l.replace(/^[-*]\s+/, ""));
    else { flush(i); out.push(<p key={i} className="text-muted leading-relaxed my-2">{inline(l)}</p>); }
  });
  flush(999);
  return <>{out}</>;
}

/* ── simple bar chart ─────────────────────────────────────────────────────── */
function Chart({ chart }: { chart: NonNullable<NotesSection["chart"]> }) {
  const max = Math.max(...chart.values, 1);
  return (
    <div className="my-4 rounded-xl border border-line bg-surface-2/50 p-4">
      {chart.title && <p className="text-xs font-bold text-text mb-3 flex items-center gap-1.5"><BarChart3 className="w-3.5 h-3.5 text-brand" />{chart.title}</p>}
      <div className="space-y-2.5">
        {chart.labels.map((lab, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-muted w-24 truncate text-right shrink-0">{lab}</span>
            <div className="flex-1 h-5 rounded-md bg-surface overflow-hidden">
              <motion.div initial={{ width: 0 }} whileInView={{ width: `${(chart.values[i] / max) * 100}%` }}
                viewport={{ once: true }} transition={{ duration: 0.7, delay: i * 0.06 }}
                className="h-full rounded-md bg-gradient-to-r from-brand to-[#8B7DFF]" />
            </div>
            <span className="text-xs font-semibold text-text w-10">{chart.values[i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DataTable({ table }: { table: NonNullable<NotesSection["table"]> }) {
  return (
    <div className="my-4 rounded-xl border border-line overflow-hidden">
      {table.title && <p className="text-xs font-bold text-text px-4 py-2.5 bg-surface-2 flex items-center gap-1.5"><Table2 className="w-3.5 h-3.5 text-brand" />{table.title}</p>}
      <table className="w-full text-sm">
        <thead><tr className="bg-brand-soft/40">
          {table.headers.map((h, i) => <th key={i} className="px-4 py-2.5 text-left font-bold text-text text-xs">{h}</th>)}
        </tr></thead>
        <tbody>
          {table.rows.map((row, ri) => (
            <tr key={ri} className={cn("border-t border-line", ri % 2 ? "bg-surface-2/30" : "")}>
              {row.map((c, ci) => <td key={ci} className={cn("px-4 py-2.5", ci === 0 ? "text-text font-medium" : "text-muted")}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function NotesStudioPage() {
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState("standard");
  const [doc, setDoc] = useState<{ text: string; filename: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notes, setNotes] = useState<LectureNotes | null>(null);

  const upload = async (file: File) => {
    try { const r = await parseDoc(file); setDoc({ text: r.text, filename: file.name }); }
    catch { setError("Could not read that document."); }
  };

  const run = async () => {
    if (!topic.trim()) return;
    setLoading(true); setError("");
    try { setNotes(await generateNotes({ topic, source_text: doc?.text, depth })); }
    catch (e: any) { setError(e?.response?.data?.detail || "Could not generate notes. Try again."); }
    finally { setLoading(false); }
  };

  const downloadPdf = () => {
    if (!notes) return;
    const esc = (s: string) => (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const md = (s: string) => esc(s).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
    const sectionsHtml = notes.sections.map(s => `
      <section><h2>${esc(s.heading)}</h2>
      ${(s.body || "").split("\n").filter(Boolean).map(l => /^[-*]\s/.test(l) ? `<li>${md(l.replace(/^[-*]\s/, ""))}</li>` : `<p>${md(l)}</p>`).join("")}
      ${s.table ? `<table><thead><tr>${s.table.headers.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${s.table.rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>` : ""}
      ${s.chart ? `<table><thead><tr><th>${esc(s.chart.title || "Data")}</th><th>Value</th></tr></thead><tbody>${s.chart.labels.map((l, i) => `<tr><td>${esc(l)}</td><td>${s.chart!.values[i]}</td></tr>`).join("")}</tbody></table>` : ""}
      </section>`).join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(notes.title)}</title>
      <style>
        body{font-family:Georgia,serif;max-width:760px;margin:40px auto;padding:0 24px;color:#1a1a1a;line-height:1.6}
        h1{font-size:30px;margin-bottom:4px;font-family:Arial}h2{font-size:20px;margin-top:28px;border-bottom:2px solid #F59E0B;padding-bottom:4px;font-family:Arial;color:#B45309}
        .sub{color:#666;font-size:15px}table{border-collapse:collapse;width:100%;margin:14px 0;font-size:14px}
        th,td{border:1px solid #ddd;padding:8px 10px;text-align:left}th{background:#efeaff}
        code{background:#f3f3f3;padding:2px 5px;border-radius:3px;font-size:13px}li{margin:4px 0}
        .terms{margin-top:24px}.terms dt{font-weight:bold;color:#3b2bb3}.terms dd{margin:0 0 8px;color:#444}
        .refs{margin-top:24px;font-size:13px;color:#555}.refs li{margin:6px 0}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>${esc(notes.title)}</h1><p class="sub">${esc(notes.subtitle || "")}</p>
      ${sectionsHtml}
      ${notes.key_terms?.length ? `<div class="terms"><h2>Key Terms</h2><dl>${notes.key_terms.map(t => `<dt>${esc(t.term)}</dt><dd>${esc(t.definition)}</dd>`).join("")}</dl></div>` : ""}
      ${notes.references?.length ? `<div class="refs"><h2>References</h2><ol>${notes.references.map(r => `<li>${esc(r)}</li>`).join("")}</ol></div>` : ""}
      </body></html>`;
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html); w.document.close();
    setTimeout(() => w.print(), 350);
  };

  return (
    <StudioShell title="Lecture Notes" eyebrow="Notes & Summaries">
      <p className="text-muted mb-8">Generate richly formatted study notes — sections, tables, charts, key terms, and references — then export a clean PDF.</p>

      <div className="grid lg:grid-cols-[360px,1fr] gap-8">
        {/* ── Controls ──────────────────────────────────────────────── */}
        <Card className="p-6 h-fit lg:sticky lg:top-24">
          <label className="text-xs font-semibold text-muted mb-2 block">Topic</label>
          <input value={topic} onChange={e => setTopic(e.target.value)}
            placeholder="e.g. Photosynthesis"
            className="w-full h-10 rounded-md bg-surface-2 border border-line px-3.5 text-sm text-text placeholder:text-faint focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20" />

          <label className="text-xs font-semibold text-muted mt-5 mb-2 block">Depth</label>
          <div className="grid grid-cols-3 gap-2">
            {DEPTHS.map(d => (
              <button key={d.key} onClick={() => setDepth(d.key)}
                className={cn("h-9 rounded-md border text-xs font-semibold transition-colors",
                  depth === d.key ? "bg-brand text-brand-fg border-brand" : "border-line text-muted hover:text-text")}>
                {d.label}
              </button>
            ))}
          </div>

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

          <Button onClick={run} loading={loading} size="lg" className="w-full mt-6" disabled={!topic.trim() || loading}>
            <Wand2 className="w-4 h-4" /> {loading ? "Writing…" : "Generate notes"}
          </Button>
          {error && <p className="text-danger text-xs mt-3 text-center">{error}</p>}
        </Card>

        {/* ── Rendered notes ────────────────────────────────────────── */}
        <div>
          {loading ? (
            <LiveDeck tool="notes" title={topic} />
          ) : !notes ? (
            <div className="rounded-xl border border-dashed border-line-strong h-[420px] flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-soft flex items-center justify-center mb-4">
                <BookOpen className="w-8 h-8 text-brand" />
              </div>
              <p className="text-text font-semibold">Your notes will appear here</p>
              <p className="text-muted text-sm mt-1">Enter a topic and hit Generate.</p>
            </div>
          ) : (
            <motion.article initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="p-8">
                {/* header */}
                <div className="flex items-start justify-between gap-4 pb-5 border-b border-line">
                  <div>
                    <h2 className="text-2xl font-bold text-text leading-tight">{notes.title}</h2>
                    {notes.subtitle && <p className="text-muted mt-1.5">{notes.subtitle}</p>}
                    {notes.reading_time && (
                      <Badge tone="neutral" className="mt-3"><Clock className="w-3 h-3" /> {notes.reading_time} read</Badge>
                    )}
                  </div>
                  <Button variant="secondary" size="sm" onClick={downloadPdf}>
                    <Download className="w-4 h-4" /> PDF
                  </Button>
                </div>

                {/* sections */}
                {notes.sections.map((s, i) => (
                  <motion.section key={i} initial={{ opacity: 0, y: 14 }} whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }} transition={{ delay: 0.04 * i }} className="mt-7">
                    <h3 className="text-lg font-bold text-text flex items-center gap-2">
                      <span className="w-1.5 h-5 rounded-full bg-brand" />{s.heading}
                    </h3>
                    <div className="mt-2 pl-3.5"><Body text={s.body} /></div>
                    {s.table && <div className="pl-3.5"><DataTable table={s.table} /></div>}
                    {s.chart && <div className="pl-3.5"><Chart chart={s.chart} /></div>}
                  </motion.section>
                ))}

                {/* key terms */}
                {notes.key_terms?.length > 0 && (
                  <div className="mt-9">
                    <h3 className="text-lg font-bold text-text mb-3">Key Terms</h3>
                    <div className="grid sm:grid-cols-2 gap-3">
                      {notes.key_terms.map((t, i) => (
                        <div key={i} className="rounded-xl border border-line bg-surface-2/40 p-3.5">
                          <p className="text-brand font-bold text-sm">{t.term}</p>
                          <p className="text-muted text-sm mt-1 leading-relaxed">{t.definition}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* references */}
                {notes.references?.length > 0 && (
                  <div className="mt-9">
                    <h3 className="text-lg font-bold text-text mb-3 flex items-center gap-2"><Quote className="w-4 h-4 text-brand" /> References</h3>
                    <ol className="space-y-2 list-decimal list-inside">
                      {notes.references.map((r, i) => <li key={i} className="text-muted text-sm leading-relaxed">{r}</li>)}
                    </ol>
                  </div>
                )}
              </Card>
            </motion.article>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
