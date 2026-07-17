"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useDispatch, useSelector } from "react-redux";
import { motion } from "framer-motion";
import {
  ArrowLeft, Download, ChevronLeft, ChevronRight,
  ZoomIn, ZoomOut, Undo, Redo, Save, Mic, RefreshCw, Loader2, GripVertical,
  Plus, Trash2,
} from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext, verticalListSortingStrategy, arrayMove, useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  getPresentation,
  exportPptx,
  updateSlide,
  pptxDownloadUrl,
  reorderSlidesApi,
  generateVoiceover,
  generateAllVoiceovers,
  addSlideApi,
  deleteSlideApi,
} from "@/lib/api/presentations";
import {
  setPresentation, setSlides, setActiveSlide, updateSlide as updateSlideStore,
  selectActiveSlide, undo, redo, reorderSlides, addSlideAt, removeSlide,
} from "@/store/presentationSlice";
import { setZoom } from "@/store/editorSlice";
import { THEMES } from "@/lib/themes";
import SlideRenderer from "@/components/editor/SlideRenderer";
import SlideThumbnail from "@/components/editor/SlideThumbnail";
import SlideProperties from "@/components/editor/SlideProperties";

/** Drag-sortable wrapper around a slide thumbnail. */
function SortableSlide({ slide, index, isActive, theme, onClick, onDelete }: any) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: slide.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="relative group"
    >
      <button
        {...attributes} {...listeners}
        className="absolute -left-0.5 top-1/2 -translate-y-1/2 z-10 p-0.5 rounded opacity-0 group-hover:opacity-100 text-faint hover:text-text cursor-grab active:cursor-grabbing transition-opacity"
        title="Drag to reorder"
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-3.5 h-3.5" />
      </button>
      <button
        onClick={(e) => onDelete?.(slide.id, e)}
        className="absolute -right-1 -top-1 z-10 w-5 h-5 rounded-full bg-red-500/90 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 hover:bg-red-500 transition-opacity shadow"
        title="Delete slide"
      >
        <Trash2 className="w-3 h-3" />
      </button>
      <SlideThumbnail slide={slide} index={index} isActive={isActive} theme={theme} onClick={onClick} />
    </div>
  );
}

export default function PresentationEditorPage() {
  const params = useParams();
  const router = useRouter();
  const dispatch = useDispatch();
  const presentationId = params.id as string;

  const { slides, presentation, activeSlideId } = useSelector((s: any) => s.presentation);
  const activeSlide = useSelector(selectActiveSlide);
  const zoom = useSelector((s: any) => s.editor.zoom);
  const canUndo = useSelector((s: any) => s.presentation.history.length > 0);
  const canRedo = useSelector((s: any) => s.presentation.future.length > 0);

  const [loading, setLoading]       = useState(true);
  const [exporting, setExporting]   = useState(false);
  const [pushing, setPushing]       = useState(false);
  const [saved, setSaved]           = useState(false);
  const [rightPanel, setRightPanel] = useState<"properties" | "notes">("properties");
  const [voLimit, setVoLimit]       = useState(120);
  const [voGenerating, setVoGenerating] = useState(false);
  const [voAllGenerating, setVoAllGenerating] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleReorder = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = slides.findIndex((s: any) => s.id === active.id);
    const newIndex = slides.findIndex((s: any) => s.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const newOrder = arrayMove(slides, oldIndex, newIndex);
    const ids = newOrder.map((s: any) => s.id);
    dispatch(reorderSlides(ids));
    try { await reorderSlidesApi(presentationId, ids); } catch {}
  };

  const handleAddSlide = async () => {
    const after = activeSlide?.slide_number;  // insert right after the active slide
    try {
      const newSlide = await addSlideApi(presentationId, { after_slide_number: after, layout_type: "blank" });
      dispatch(addSlideAt({ ...newSlide, content: newSlide.content || {} }));
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Could not add a slide.");
    }
  };

  const handleDeleteSlide = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (slides.length <= 1) { alert("A presentation needs at least one slide."); return; }
    if (!confirm("Delete this slide?")) return;
    dispatch(removeSlide(id));
    try { await deleteSlideApi(id); } catch {}
  };

  const handleGenerateVoiceover = async () => {
    if (!activeSlide) return;
    setVoGenerating(true);
    try {
      const { speaker_notes } = await generateVoiceover(activeSlide.id, { word_limit: voLimit });
      dispatch(updateSlideStore({ id: activeSlide.id, speaker_notes }));
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Could not generate the voiceover script.");
    } finally {
      setVoGenerating(false);
    }
  };

  const handleGenerateAllVoiceovers = async () => {
    setVoAllGenerating(true);
    try {
      const { slides: updated } = await generateAllVoiceovers(presentationId);
      for (const s of updated) {
        if (s.speaker_notes) dispatch(updateSlideStore({ id: s.id, speaker_notes: s.speaker_notes }));
      }
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Could not generate voiceover scripts.");
    } finally {
      setVoAllGenerating(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const data = await getPresentation(presentationId);
        dispatch(setPresentation(data));
        dispatch(setSlides(data.slides || []));
      } catch {
        router.push("/login");
      } finally {
        setLoading(false);
      }
    })();
  }, [presentationId]);

  const theme = THEMES[presentation?.theme || "dark"] || THEMES.dark;

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportPptx(presentationId);
      const link = document.createElement("a");
      link.href = pptxDownloadUrl(presentationId);
      link.target = "_blank";
      link.rel = "noopener";
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Export failed. Check the backend.");
    } finally {
      setExporting(false);
    }
  };


  const handleSlideUpdate = async (patch: any) => {
    if (!activeSlide) return;
    dispatch(updateSlideStore({ id: activeSlide.id, ...patch }));
    setSaved(false);
    try {
      await updateSlide(activeSlide.id, patch);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {}
  };

  const activeIndex = slides.findIndex((s: any) => s.id === activeSlideId);
  const goNext = () => { if (activeIndex < slides.length - 1) dispatch(setActiveSlide(slides[activeIndex + 1].id)); };
  const goPrev = () => { if (activeIndex > 0) dispatch(setActiveSlide(slides[activeIndex - 1].id)); };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-sm">Loading presentation...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
      {/* ── Top Toolbar ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border-b border-slate-800 flex-shrink-0">
        <button
          onClick={() => router.push("/dashboard")}
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="h-4 w-px bg-slate-700" />

        <div className="flex-1 min-w-0">
          <input
            className="text-sm font-semibold text-white bg-transparent outline-none border-b border-transparent hover:border-slate-600 focus:border-blue-500 px-1 py-0.5 transition-colors max-w-xs truncate"
            value={presentation?.title || ""}
            onChange={() => {}}
            readOnly
          />
        </div>

        {/* Undo/Redo */}
        <button onClick={() => dispatch(undo())} disabled={!canUndo} title="Undo"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400">
          <Undo className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => dispatch(redo())} disabled={!canRedo} title="Redo"
          className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400">
          <Redo className="w-3.5 h-3.5" />
        </button>

        <div className="h-4 w-px bg-slate-700" />

        {/* Zoom */}
        <div className="flex items-center gap-1">
          <button onClick={() => dispatch(setZoom(zoom - 0.1))} title="Zoom out"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg">
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => dispatch(setZoom(1))} title="Reset to 100%"
            className="text-xs text-slate-400 hover:text-white w-11 text-center font-mono py-1 rounded hover:bg-slate-800 transition-colors">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => dispatch(setZoom(zoom + 0.1))} title="Zoom in"
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg">
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="h-4 w-px bg-slate-700" />

        {/* Save indicator */}
        {saved && (
          <motion.span
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-emerald-400 text-xs flex items-center gap-1"
          >
            <Save className="w-3 h-3" /> Saved
          </motion.span>
        )}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleExport}
          disabled={exporting || pushing}
          className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-1.5 rounded-lg font-semibold transition-all disabled:opacity-60"
        >
          {exporting ? <><span className="animate-spin text-xs">⟳</span> Exporting...</> : <><Download className="w-3.5 h-3.5" /> Download</>}
        </motion.button>

      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Slide Panel (drag to reorder) */}
        <div className="w-44 flex-shrink-0 bg-slate-900 border-r border-slate-800 overflow-y-auto py-3 px-2.5 space-y-2.5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium px-1 mb-2">
            Slides ({slides.length}) · drag to reorder
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleReorder}>
            <SortableContext items={slides.map((s: any) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2.5">
                {slides.map((slide: any, i: number) => (
                  <SortableSlide
                    key={slide.id}
                    slide={slide}
                    index={i}
                    isActive={slide.id === activeSlideId}
                    theme={theme}
                    onClick={() => dispatch(setActiveSlide(slide.id))}
                    onDelete={handleDeleteSlide}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>

          {/* Add slide */}
          <button
            onClick={handleAddSlide}
            className="mt-2.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-blue-500 hover:bg-slate-800/50 text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Add slide
          </button>
        </div>

        {/* Center: Canvas */}
        <div className="flex-1 overflow-auto bg-slate-950 flex flex-col items-center justify-start py-5 px-6">
          {/* Navigation arrows */}
          <div className="flex items-center gap-4 mb-3">
            <button
              onClick={goPrev}
              disabled={activeIndex <= 0}
              className="p-1.5 text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <span className="text-slate-400 text-sm">
              {activeIndex + 1} / {slides.length}
            </span>
            <button
              onClick={goNext}
              disabled={activeIndex >= slides.length - 1}
              className="p-1.5 text-slate-500 hover:text-white disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Slide canvas — fills the available width up to 1280px so the
              slide preview is large and easy to read. */}
          <motion.div
            key={activeSlideId}
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.18 }}
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: "top center",
              width: "100%",
              maxWidth: 1280,
              marginBottom: `${(1 - zoom) * -500}px`,
            }}
          >
            {activeSlide ? (
              <SlideRenderer
                slide={activeSlide}
                theme={theme}
                onUpdate={handleSlideUpdate}
                editable
              />
            ) : (
              <div className="aspect-video bg-slate-800 rounded-2xl flex items-center justify-center">
                <p className="text-slate-500">Select a slide</p>
              </div>
            )}
          </motion.div>
        </div>

        {/* Right: Properties Panel */}
        <div className="w-72 flex-shrink-0 bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden">
          {/* Panel tabs */}
          <div className="flex border-b border-slate-800">
            {(["properties", "notes"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setRightPanel(tab)}
                className={`flex-1 py-2.5 text-xs font-medium transition-colors capitalize ${
                  rightPanel === tab
                    ? "text-white border-b-2 border-blue-500"
                    : "text-slate-500 hover:text-slate-300"
                }`}
              >
                {tab === "properties" ? "Properties" : "Speaker Notes"}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {rightPanel === "properties" && activeSlide && (
              <SlideProperties
                slide={activeSlide}
                theme={theme}
                onUpdate={handleSlideUpdate}
              />
            )}
            {rightPanel === "notes" && (
              <div>
                {/* AI voiceover generator */}
                <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 mb-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Mic className="w-3.5 h-3.5 text-violet-400" />
                    <span className="text-xs font-semibold text-white">Voiceover script</span>
                  </div>
                  <p className="text-[11px] text-slate-400 mb-2.5">
                    Generate an instructor narration explaining this slide.
                  </p>

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-slate-400">Word limit</span>
                    <span className="text-[11px] font-mono text-violet-300">{voLimit} words</span>
                  </div>
                  <input
                    type="range" min={40} max={300} step={10}
                    value={voLimit}
                    onChange={e => setVoLimit(parseInt(e.target.value))}
                    className="w-full accent-violet-500 mb-3"
                  />

                  <button
                    onClick={handleGenerateVoiceover}
                    disabled={voGenerating || voAllGenerating || !activeSlide}
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 disabled:opacity-60 text-white text-xs font-semibold py-2 rounded-lg transition-all"
                  >
                    {voGenerating
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating…</>
                      : activeSlide?.speaker_notes
                        ? <><RefreshCw className="w-3.5 h-3.5" /> Regenerate script</>
                        : <><Mic className="w-3.5 h-3.5" /> Generate voiceover</>}
                  </button>
                  <button
                    onClick={handleGenerateAllVoiceovers}
                    disabled={voAllGenerating || voGenerating}
                    className="w-full flex items-center justify-center gap-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-60 text-slate-200 text-xs font-semibold py-2 rounded-lg transition-all mt-2"
                    title="Generate voiceover scripts for all slides that are missing one"
                  >
                    {voAllGenerating
                      ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating all…</>
                      : <><Mic className="w-3.5 h-3.5" /> Generate all slides</>}
                  </button>
                </div>

                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs text-slate-400">Speaker Notes</p>
                  {activeSlide?.speaker_notes && (
                    <span className="text-[10px] text-slate-500">
                      {String(activeSlide.speaker_notes).trim().split(/\s+/).filter(Boolean).length} words
                    </span>
                  )}
                </div>
                <textarea
                  placeholder="Add speaker notes for this slide, or generate a voiceover script above…"
                  value={activeSlide?.speaker_notes || ""}
                  onChange={e => handleSlideUpdate({ speaker_notes: e.target.value })}
                  className="w-full min-h-[220px] bg-slate-800 border border-slate-700 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500 resize-none leading-relaxed"
                />
              </div>
            )}
            {rightPanel === "properties" && !activeSlide && (
              <p className="text-slate-500 text-sm text-center mt-8">Select a slide to edit properties</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
