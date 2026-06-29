"use client";
import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { motion } from "framer-motion";
import {
  Shuffle, ImagePlus, Loader2, RefreshCw, Wand2, X,
  LayoutGrid, GitBranch, BarChart3, Image as ImageIcon,
} from "lucide-react";
import {
  regenerateSlideImage,
  slideRegenStreamUrl,
  updateSlide as apiUpdateSlide,
  uploadImage,
} from "@/lib/api/presentations";
import SmartLayoutsPanel from "./SmartLayoutsPanel";
import SmartDiagramsPanel from "./SmartDiagramsPanel";
import SmartChartsPanel from "./SmartChartsPanel";
import { readSse } from "@/lib/api/sseStream";
import { streamPatchSlide, pushHistory } from "@/store/presentationSlice";

type PanelKey = "layouts" | "diagrams" | "charts" | "image";

const RAIL_ITEMS: { key: PanelKey; icon: any; label: string }[] = [
  { key: "layouts",  icon: LayoutGrid, label: "Smart Layouts" },
  { key: "diagrams", icon: GitBranch,  label: "Smart Diagrams" },
  { key: "charts",   icon: BarChart3,  label: "Smart Charts" },
  { key: "image",    icon: ImageIcon,  label: "Image & Regen" },
];

const DIAGRAM_LAYOUTS = new Set([
  "funnel", "concentric_circles", "venn", "target", "connected_circles",
]);
const CHART_LAYOUTS = new Set([
  "bar_chart", "line_chart", "area_chart", "pie_chart", "donut_chart",
]);
function isDiagramLayout(k?: string) { return !!k && DIAGRAM_LAYOUTS.has(k); }
function isChartLayout(k?: string)   { return !!k && CHART_LAYOUTS.has(k); }

interface SlidePropertiesProps {
  slide: any;
  theme: Record<string, string>;
  onUpdate: (patch: any) => void;
}

export default function SlideProperties({ slide, onUpdate }: SlidePropertiesProps) {
  const dispatch = useDispatch();
  const [generatingImage, setGeneratingImage] = useState(false);
  const [regenStream, setRegenStream] = useState<{
    abort: AbortController | null;
    pending: boolean;
    error: string | null;
  }>({ abort: null, pending: false, error: null });
  const [instruction, setInstruction] = useState("");
  const [blankPrompt, setBlankPrompt] = useState("");
  const [promptDraft, setPromptDraft] = useState<string>(slide?.image_prompt || "");
  // Pick the panel that best matches the current slide's layout so the rail
  // opens on the relevant section when the user lands here.
  const defaultPanel: PanelKey =
    isDiagramLayout(slide?.layout_type) ? "diagrams"
    : isChartLayout(slide?.layout_type) ? "charts"
    : "layouts";
  const [activePanel, setActivePanel] = useState<PanelKey>(defaultPanel);
  useEffect(() => {
    setPromptDraft(slide?.image_prompt || "");
  }, [slide?.id, slide?.image_prompt]);
  useEffect(() => {
    // When the user clicks a different slide, swap the rail to the matching
    // panel — keeps the UI feeling responsive to context.
    setActivePanel(
      isDiagramLayout(slide?.layout_type) ? "diagrams"
      : isChartLayout(slide?.layout_type) ? "charts"
      : "layouts",
    );
  }, [slide?.id]);

  const isRegenerating = regenStream.pending;

  /** Drives a regenerate-stream and patches the slide in-place as content
   *  flows in. `targetLayout` switches layout if different from current. */
  const startRegen = (opts: { targetLayout?: string; instruction?: string } = {}) => {
    if (!slide?.id) return;
    if (regenStream.abort) regenStream.abort.abort();

    dispatch(pushHistory());
    setRegenStream({ abort: null, pending: true, error: null });

    const url = slideRegenStreamUrl(slide.id, {
      layoutType: opts.targetLayout,
      instruction: opts.instruction,
    });

    const abort = readSse(
      url,
      (eventType, data) => {
        switch (eventType) {
          case "slide_start":
            if (data.layout_type) {
              dispatch(streamPatchSlide({ id: slide.id, layout_type: data.layout_type }));
            }
            break;
          case "slide_partial":
            // The reducer shallow-merges `content`, so passing just the
            // newly-detected fields is safe — earlier fields stay put.
            dispatch(
              streamPatchSlide({
                id: slide.id,
                ...(data.layout_type ? { layout_type: data.layout_type } : {}),
                ...(data.content?.title ? { title: data.content.title } : {}),
                content: data.content || {},
              }),
            );
            break;
          case "slide_done":
            // Final payload is authoritative — merge wins because the new
            // content is a complete object.
            dispatch(
              streamPatchSlide({
                id: slide.id,
                layout_type: data.slide?.layout_type,
                title: data.slide?.title,
                content: data.slide?.content,
              }),
            );
            // Persist the final state to the backend so reloading the page
            // shows the new slide. (Streaming endpoint already wrote it,
            // but this also keeps the pptx_path stale-bust correct.)
            setRegenStream({ abort: null, pending: false, error: null });
            break;
          case "error":
            setRegenStream({
              abort: null,
              pending: false,
              error: data.message || "Regeneration failed",
            });
            break;
        }
      },
      (err) => {
        setRegenStream({
          abort: null,
          pending: false,
          error: err?.message || "Connection failed",
        });
      },
    );
    setRegenStream({ abort, pending: true, error: null });
  };

  const handleLayoutChange = async (newLayout: string) => {
    if (!slide?.id || newLayout === slide.layout_type) return;
    // Quick visual swap so the user sees the new shell immediately, even
    // before the LLM finishes producing content for the new schema.
    dispatch(streamPatchSlide({ id: slide.id, layout_type: newLayout }));
    try { await apiUpdateSlide(slide.id, { layout_type: newLayout }); } catch { /* noop */ }
    startRegen({ targetLayout: newLayout });
  };

  const handleRegenSlide = () => {
    startRegen({ instruction: instruction.trim() || undefined });
    setInstruction("");
  };

  /** Upload a user-picked file and append it as a free-positioned overlay
   *  on the slide. The overlay is placed centered-ish at 40% scale so the
   *  user can immediately grab and drag it. */
  const handleAddOverlay = async (file: File) => {
    if (!file || !slide?.id) return;
    setGeneratingImage(true);
    try {
      const { url } = await uploadImage(file);
      const existing = Array.isArray(slide.content?.overlays) ? slide.content.overlays : [];
      const overlay = {
        id: `o-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        type: "image" as const,
        src: url,
        x: 0.3,
        y: 0.3,
        w: 0.4,
        h: 0.4,
      };
      const next = [...existing, overlay];
      onUpdate({ content: { ...slide.content, overlays: next } });
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Image upload failed");
    } finally {
      setGeneratingImage(false);
    }
  };

  const handleRegenImage = async () => {
    if (!slide?.id) return;
    setGeneratingImage(true);
    try {
      const result = await regenerateSlideImage(slide.id, slide.image_prompt);
      onUpdate({
        image_url: result.image_url,
        image_prompt: result.image_prompt,
        content: result.content,
      });
    } catch (e: any) {
      alert(e?.response?.data?.detail || "Image generation failed");
    } finally {
      setGeneratingImage(false);
    }
  };

  // Always show the Regenerate-slide controls underneath whichever picker
  // panel is open — it's the action button for any layout/diagram/chart pick.
  const regenBlock = (
    <div>
      <p className="text-xs uppercase tracking-wider font-medium text-slate-400 mb-3">
        Regenerate slide
      </p>
      <textarea
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
        placeholder="Optional instruction — e.g. 'make it more concrete, focus on Q4 metrics'"
        className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
        rows={2}
      />
      <div className="flex gap-2 mt-2">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleRegenSlide}
          disabled={isRegenerating}
          className="flex-1 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-xs py-2 rounded-lg font-semibold transition-all disabled:opacity-60"
        >
          {isRegenerating ? (
            <><Loader2 className="w-3 h-3 animate-spin" /> Streaming…</>
          ) : (
            <><Wand2 className="w-3 h-3" /> Regenerate slide</>
          )}
        </motion.button>
        {isRegenerating && regenStream.abort && (
          <button
            onClick={() => regenStream.abort?.abort()}
            className="px-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg"
            title="Cancel"
          >
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
      {regenStream.error && (
        <p className="mt-2 text-[10px] text-red-400">{regenStream.error}</p>
      )}
    </div>
  );

  const overlayCount = Array.isArray(slide?.content?.overlays) ? slide.content.overlays.length : 0;

  const imagePanel = (
    <div className="space-y-6">
      {/* Add free-position image overlay */}
      <div>
        <p className="text-xs uppercase tracking-wider font-medium text-slate-400 mb-2">
          Drop an image anywhere
        </p>
        <p className="text-[10px] text-slate-500 mb-2 leading-snug">
          Upload an image and drag it onto the slide canvas. {overlayCount > 0 && `(${overlayCount} on this slide.)`}
        </p>
        <label className="block">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleAddOverlay(f);
              e.target.value = "";
            }}
            className="hidden"
          />
          <span className="w-full inline-flex items-center justify-center gap-2 bg-blue-600/15 hover:bg-blue-600/25 text-blue-300 border border-blue-500/30 rounded-lg text-xs py-2 cursor-pointer transition-colors">
            <ImagePlus className="w-3.5 h-3.5" /> Upload &amp; place
          </span>
        </label>
      </div>

      {/* Slide info */}
      <div>
        <p className="text-xs uppercase tracking-wider font-medium text-slate-400 mb-3">Slide info</p>
        <div className="bg-slate-800 rounded-xl p-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Slide #</span>
            <span className="text-white font-mono">{slide?.slide_number}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-slate-400">Layout</span>
            <span className="text-white capitalize">
              {slide?.layout_type?.replace(/_/g, " ")}
            </span>
          </div>
          {slide?.image_url && (
            <div className="flex justify-between text-xs">
              <span className="text-slate-400">Has image</span>
              <span className="text-emerald-400">Yes</span>
            </div>
          )}
        </div>
      </div>

      {/* Image */}
      <div>
        <p className="text-xs uppercase tracking-wider font-medium text-slate-400 mb-3">Slide image</p>
        {slide?.image_url ? (
          <div className="space-y-2">
            <div className="rounded-xl overflow-hidden border border-slate-700">
              <img src={slide.image_url} alt="Slide image" className="w-full h-28 object-cover" />
            </div>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleRegenImage}
              disabled={generatingImage}
              className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {generatingImage ? (
                <><Loader2 className="w-3 h-3 animate-spin" /> Regenerating…</>
              ) : (
                <><Shuffle className="w-3 h-3" /> Regenerate image</>
              )}
            </motion.button>
          </div>
        ) : (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleRegenImage}
            disabled={generatingImage}
            className="w-full flex items-center justify-center gap-2 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-xs py-3 rounded-xl border border-blue-500/30 transition-colors disabled:opacity-40"
          >
            {generatingImage ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
            ) : (
              <><ImagePlus className="w-3 h-3" /> Generate image</>
            )}
          </motion.button>
        )}
      </div>

      {/* Image prompt */}
      <div>
        <p className="text-xs uppercase tracking-wider font-medium text-slate-400 mb-2">Image prompt</p>
        <textarea
          value={promptDraft}
          onChange={(e) => setPromptDraft(e.target.value)}
          onBlur={() => {
            if (promptDraft !== (slide?.image_prompt || "")) {
              onUpdate({ image_prompt: promptDraft });
            }
          }}
          placeholder="Describe what the image should show…"
          className="w-full text-xs bg-slate-800/60 border border-slate-700 rounded-lg p-2 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
          rows={3}
        />
        {promptDraft && (
          <button
            onClick={async () => {
              if (promptDraft !== (slide?.image_prompt || "")) {
                onUpdate({ image_prompt: promptDraft });
              }
              await handleRegenImage();
            }}
            disabled={generatingImage}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 transition-colors disabled:opacity-40"
          >
            <RefreshCw className="w-3 h-3" /> Regenerate with this prompt
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex gap-3 -m-4 h-full">
      {/* ── Vertical icon rail ─────────────────────────────────────── */}
      <div className="flex flex-col items-center gap-1.5 py-3 px-1 bg-slate-950/40 border-r border-slate-800 flex-shrink-0 w-11">
        {RAIL_ITEMS.map((it) => {
          const Icon = it.icon;
          const isActive = activePanel === it.key;
          return (
            <button
              key={it.key}
              onClick={() => setActivePanel(it.key)}
              title={it.label}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition-colors ${
                isActive
                  ? "bg-blue-600 text-white shadow"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <Icon className="w-4 h-4" />
            </button>
          );
        })}
      </div>

      {/* ── Active panel ───────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto py-3 pr-3 space-y-6">
        {/* Blank slide → generate from a prompt (AI picks the layout) */}
        {slide?.layout_type === "blank" && (
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
            <p className="text-xs font-semibold text-white mb-1 flex items-center gap-1.5">
              <Wand2 className="w-3.5 h-3.5 text-violet-400" /> Generate this slide
            </p>
            <p className="text-[11px] text-slate-400 mb-2 leading-snug">
              Describe what this slide should contain — AI picks the best layout and writes it.
            </p>
            <textarea
              value={blankPrompt}
              onChange={(e) => setBlankPrompt(e.target.value)}
              placeholder="e.g. Compare REST vs GraphQL with pros and cons — or — a Python function that reverses a string"
              rows={3}
              className="w-full text-xs bg-slate-800 border border-slate-700 rounded-lg p-2 text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-blue-500 resize-none"
            />
            <button
              onClick={() => { startRegen({ targetLayout: "auto", instruction: blankPrompt.trim() }); }}
              disabled={isRegenerating || !blankPrompt.trim()}
              className="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 text-white text-xs py-2 rounded-lg font-semibold transition-all disabled:opacity-50"
            >
              {isRegenerating
                ? <><Loader2 className="w-3 h-3 animate-spin" /> Generating…</>
                : <><Wand2 className="w-3 h-3" /> Generate slide</>}
            </button>
            {regenStream.error && <p className="text-red-400 text-[11px] mt-2">{regenStream.error}</p>}
          </div>
        )}

        {activePanel === "layouts" && (
          <SmartLayoutsPanel
            current={slide?.layout_type || "bullets"}
            onPick={handleLayoutChange}
            disabled={isRegenerating}
          />
        )}
        {activePanel === "diagrams" && (
          <SmartDiagramsPanel
            current={slide?.layout_type || ""}
            onPick={handleLayoutChange}
            disabled={isRegenerating}
          />
        )}
        {activePanel === "charts" && (
          <SmartChartsPanel
            current={slide?.layout_type || ""}
            onPick={handleLayoutChange}
            disabled={isRegenerating}
          />
        )}
        {activePanel === "image" && imagePanel}

        {/* Regenerate-slide controls always available regardless of panel —
            it's the universal action for the current slide. */}
        {activePanel !== "image" && regenBlock}
      </div>
    </div>
  );
}
