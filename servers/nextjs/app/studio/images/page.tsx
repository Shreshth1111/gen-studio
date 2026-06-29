"use client";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Download, ImageIcon, Wand2, RefreshCw } from "lucide-react";
import { StudioShell } from "@/components/studio/StudioShell";
import { Button, Card, cn } from "@/lib/ui";
import { LiveDeck } from "@/components/studio/LiveDeck";
import { generateImages, type GenImage } from "@/lib/api/studio";

const ASPECTS = [
  { key: "square",    label: "Square",    w: 1024, h: 1024, ratio: "aspect-square" },
  { key: "landscape", label: "Landscape", w: 1280, h: 768,  ratio: "aspect-video" },
  { key: "portrait",  label: "Portrait",  w: 768,  h: 1152, ratio: "aspect-[3/4]" },
];
const STYLES = ["Photorealistic", "3D render", "Watercolor", "Cinematic", "Minimal vector", "Neon cyberpunk"];

function absUrl(u: string) {
  if (u.startsWith("http")) return u;
  const base = process.env.NEXT_PUBLIC_API_URL || "";
  return `${base}${u}`;
}

export default function ImageStudioPage() {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("");
  const [aspect, setAspect] = useState(ASPECTS[0]);
  const [count, setCount] = useState(2);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [images, setImages] = useState<GenImage[]>([]);

  const run = async () => {
    if (!prompt.trim()) return;
    setLoading(true); setError("");
    try {
      const fullPrompt = style ? `${prompt}, ${style} style` : prompt;
      const { images } = await generateImages({ prompt: fullPrompt, count, width: aspect.w, height: aspect.h });
      setImages(images);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Generation failed. Try again.");
    } finally { setLoading(false); }
  };

  const download = async (img: GenImage) => {
    try {
      const res = await fetch(absUrl(img.url));
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `artify-${img.id.slice(0, 8)}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { window.open(absUrl(img.url), "_blank"); }
  };

  return (
    <StudioShell title="Image Studio" eyebrow="AI Images">
      <p className="text-muted mb-8">Describe anything and generate crisp visuals you can drop into decks, docs, or anywhere.</p>

      <div className="grid lg:grid-cols-[380px,1fr] gap-8">
        {/* ── Controls ──────────────────────────────────────────────── */}
        <Card className="p-6 h-fit lg:sticky lg:top-24">
          <label className="text-xs font-semibold text-muted mb-2 block">Prompt</label>
          <textarea
            autoFocus
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="A serene mountain lake at golden hour, mist over the water…"
            className="w-full min-h-[110px] rounded-md bg-surface-2 border border-line px-3.5 py-3 text-sm text-text placeholder:text-faint resize-none focus:outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          />

          <label className="text-xs font-semibold text-muted mt-5 mb-2 block">Style</label>
          <div className="flex flex-wrap gap-2">
            {STYLES.map(s => (
              <button key={s} onClick={() => setStyle(style === s ? "" : s)}
                className={cn("px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
                  style === s ? "bg-brand-soft border-brand/40 text-brand" : "border-line text-muted hover:text-text hover:border-line-strong")}>
                {s}
              </button>
            ))}
          </div>

          <label className="text-xs font-semibold text-muted mt-5 mb-2 block">Aspect ratio</label>
          <div className="grid grid-cols-3 gap-2">
            {ASPECTS.map(a => (
              <button key={a.key} onClick={() => setAspect(a)}
                className={cn("rounded-md border p-2 flex flex-col items-center gap-1.5 transition-colors",
                  aspect.key === a.key ? "bg-brand-soft border-brand/40" : "border-line hover:border-line-strong")}>
                <span className={cn("w-7 rounded-sm bg-line-strong", a.key === "square" ? "h-7" : a.key === "landscape" ? "h-4 mt-1.5" : "h-9 -mb-1")} />
                <span className={cn("text-[11px]", aspect.key === a.key ? "text-brand" : "text-muted")}>{a.label}</span>
              </button>
            ))}
          </div>

          <label className="text-xs font-semibold text-muted mt-5 mb-2 block">Number of images</label>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map(n => (
              <button key={n} onClick={() => setCount(n)}
                className={cn("w-11 h-10 rounded-md border font-semibold text-sm transition-colors",
                  count === n ? "bg-brand text-brand-fg border-brand" : "border-line text-muted hover:text-text")}>
                {n}
              </button>
            ))}
          </div>

          <Button onClick={run} loading={loading} size="lg" className="w-full mt-6"
            disabled={!prompt.trim() || loading}>
            <Wand2 className="w-4 h-4" /> {loading ? "Generating…" : "Generate"}
          </Button>
          {error && <p className="text-danger text-xs mt-3 text-center">{error}</p>}
        </Card>

        {/* ── Results ───────────────────────────────────────────────── */}
        <div>
          {loading && images.length === 0 ? (
            <LiveDeck tool="image" title={prompt} />
          ) : images.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-strong h-[420px] flex flex-col items-center justify-center text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-soft flex items-center justify-center mb-4">
                <ImageIcon className="w-8 h-8 text-brand" />
              </div>
              <p className="text-text font-semibold">Your images will appear here</p>
              <p className="text-muted text-sm mt-1">Write a prompt and hit Generate.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-5" style={{ perspective: 1200 }}>
              <AnimatePresence>
                {images.map((img, i) => (
                  <motion.div
                    key={img.id}
                    initial={{ opacity: 0, y: 30, rotateX: -12 }}
                    animate={{ opacity: 1, y: 0, rotateX: 0 }}
                    transition={{ delay: i * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                    whileHover={{ y: -6, rotateY: 4, rotateX: 4 }}
                    style={{ transformStyle: "preserve-3d" }}
                    className="group relative rounded-xl overflow-hidden border border-line bg-surface shadow-e2 hover:shadow-e3 transition-shadow"
                  >
                    <div className={cn("relative", aspect.ratio)}>
                      <img src={absUrl(img.url)} alt={img.prompt} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      <button onClick={() => download(img)}
                        className="absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-black text-xs font-bold opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all">
                        <Download className="w-3.5 h-3.5" /> Download
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}

          {images.length > 0 && !loading && (
            <Button variant="secondary" onClick={run} className="mt-5">
              <RefreshCw className="w-4 h-4" /> Generate again
            </Button>
          )}
        </div>
      </div>
    </StudioShell>
  );
}
