/**
 * ═════════════════════════════════════════════════════════════════════════
 *  generationSlice.ts — REDUX STATE FOR LIVE DECK GENERATION
 * ═════════════════════════════════════════════════════════════════════════
 *  Holds everything the live-generation screen needs while the SSE stream
 *  runs. app/presentation/[id]/generate/page.tsx reads each SSE event off the
 *  wire and dispatches ONE action per event into here; components select from
 *  this slice to paint the live preview.
 *
 *  STATE
 *    phase          idle → outline → structure → slides → images → complete
 *    outlineText    raw outline tokens concatenated (the streaming console)
 *    outline        parsed slide slots once the outline finishes
 *    partialSlides  map slide_number → slide-so-far {title, content,
 *                   image_progress, done}; SLIDE_PARTIAL merges into this so
 *                   LiveSlide renders title-first, then bullets as they arrive
 *    currentSlide   which slide is actively being written
 *
 *  ACTIONS (one per SSE event): outlineChunk/outlineDone, structureDone,
 *  slideStart, slideContentChunk, slidePartial, slideDone, image*, complete.
 * ═════════════════════════════════════════════════════════════════════════
 */
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface SlideData {
  id: string;
  slide_number: number;
  layout_type: string;
  title: string;
  content: Record<string, any>;
  speaker_notes?: string;
  image_url?: string;
}

export interface PartialSlide {
  slide_number: number;
  layout_type: string;
  title: string;
  content: Record<string, any>;
  image_url?: string;
  image_progress?: number;
  done: boolean;
}

interface GenerationState {
  presentationId: string | null;
  config: Record<string, any> | null;
  isGenerating: boolean;
  phase: "idle" | "outline" | "structure" | "slides" | "images" | "complete";
  outlineText: string;
  outline: any[];
  slidesGenerated: number;
  totalSlides: number;
  currentSlideStreaming: number | null;
  streamingContent: Record<number, string>;
  /** Per-slide structured partial content (populated incrementally from the
   *  backend's slide_partial events). Keyed by slide_number. */
  partialSlides: Record<number, PartialSlide>;
  completedSlides: SlideData[];
  errors: string[];
}

const initialState: GenerationState = {
  presentationId: null,
  config: null,
  isGenerating: false,
  phase: "idle",
  outlineText: "",
  outline: [],
  slidesGenerated: 0,
  totalSlides: 0,
  currentSlideStreaming: null,
  streamingContent: {},
  partialSlides: {},
  completedSlides: [],
  errors: [],
};

const generationSlice = createSlice({
  name: "generation",
  initialState,
  reducers: {
    setPresentationConfig(state, action: PayloadAction<{ presentationId: string; config: any }>) {
      state.presentationId = action.payload.presentationId;
      state.config = action.payload.config;
      state.totalSlides = action.payload.config?.slideCount || 8;
    },
    startGeneration(state, action: PayloadAction<{ totalSlides: number }>) {
      state.isGenerating = true;
      state.phase = "outline";
      state.outlineText = "";
      state.outline = [];
      state.slidesGenerated = 0;
      state.totalSlides = action.payload.totalSlides;
      state.completedSlides = [];
      state.errors = [];
      state.streamingContent = {};
      state.partialSlides = {};
    },
    outlineChunk(state, action: PayloadAction<{ token: string }>) {
      state.phase = "outline";
      state.outlineText += action.payload.token;
    },
    outlineDone(state, action: PayloadAction<{ outline: any[]; title?: string }>) {
      state.outline = action.payload.outline;
      state.totalSlides = action.payload.outline.length;
    },
    structureDone(state, action: PayloadAction<{ slides: any[] }>) {
      state.phase = "structure";
      state.totalSlides = action.payload.slides.length;
    },
    slideStart(state, action: PayloadAction<{ slide_number: number; title: string; layout_type: string }>) {
      state.phase = "slides";
      const n = action.payload.slide_number;
      state.currentSlideStreaming = n;
      state.streamingContent[n] = "";
      state.partialSlides[n] = {
        slide_number: n,
        layout_type: action.payload.layout_type,
        title: action.payload.title,
        content: { title: action.payload.title },
        done: false,
      };
    },
    slideContentChunk(state, action: PayloadAction<{ slide_number: number; token: string }>) {
      const n = action.payload.slide_number;
      state.streamingContent[n] = (state.streamingContent[n] ?? "") + action.payload.token;
    },
    slidePartial(
      state,
      action: PayloadAction<{
        slide_number: number;
        layout_type: string;
        title: string;
        content: Record<string, any>;
      }>
    ) {
      const { slide_number, layout_type, title, content } = action.payload;
      const existing = state.partialSlides[slide_number];
      // Merge so we never lose fields once seen (e.g. outline title vs. parsed
      // title — partial parser may not have caught a clean title yet).
      const mergedContent = { ...(existing?.content || {}), ...content };
      if (!mergedContent.title) mergedContent.title = title;
      state.partialSlides[slide_number] = {
        slide_number,
        layout_type: existing?.layout_type || layout_type,
        title: existing?.title || title,
        content: mergedContent,
        image_url: existing?.image_url,
        image_progress: existing?.image_progress,
        done: existing?.done ?? false,
      };
    },
    slideDone(state, action: PayloadAction<{ slide: SlideData }>) {
      state.slidesGenerated += 1;
      state.currentSlideStreaming = null;
      state.phase = "images";
      const slide = action.payload.slide;
      // Promote into partialSlides as the authoritative content (now done)
      state.partialSlides[slide.slide_number] = {
        slide_number: slide.slide_number,
        layout_type: slide.layout_type,
        title: slide.title,
        content: slide.content || {},
        image_url: slide.image_url,
        image_progress: state.partialSlides[slide.slide_number]?.image_progress,
        done: true,
      };
      const existing = state.completedSlides.findIndex(
        s => s.slide_number === slide.slide_number
      );
      if (existing >= 0) {
        state.completedSlides[existing] = slide;
      } else {
        state.completedSlides.push(slide);
      }
    },
    imageStart(state, action: PayloadAction<{ slide_number: number }>) {
      const p = state.partialSlides[action.payload.slide_number];
      if (p) p.image_progress = 0;
    },
    imageProgress(
      state,
      action: PayloadAction<{ slide_number: number; percent: number }>
    ) {
      const p = state.partialSlides[action.payload.slide_number];
      if (p) p.image_progress = action.payload.percent;
    },
    imageDone(state, action: PayloadAction<{ slide_number: number; image_url: string }>) {
      const slide = state.completedSlides.find(s => s.slide_number === action.payload.slide_number);
      if (slide) {
        slide.image_url = action.payload.image_url;
      }
      const p = state.partialSlides[action.payload.slide_number];
      if (p) {
        p.image_url = action.payload.image_url;
        p.image_progress = 100;
        p.content = { ...p.content, image_url: action.payload.image_url };
      }
    },
    generationComplete(state, action: PayloadAction<{ presentation?: any }>) {
      state.isGenerating = false;
      state.phase = "complete";
      if (action.payload.presentation?.slides) {
        state.completedSlides = action.payload.presentation.slides;
      }
    },
    generationError(state, action: PayloadAction<{ message: string }>) {
      state.isGenerating = false;
      state.errors.push(action.payload.message);
    },
    resetGeneration() {
      return initialState;
    },
  },
});

export const {
  setPresentationConfig, startGeneration, outlineChunk, outlineDone,
  structureDone, slideStart, slideContentChunk, slidePartial, slideDone,
  imageStart, imageProgress, imageDone,
  generationComplete, generationError, resetGeneration,
} = generationSlice.actions;

export default generationSlice.reducer;
export const selectGenerationPhase    = (s: any) => s.generation.phase;
export const selectSlidesGenerated    = (s: any) => s.generation.slidesGenerated;
export const selectTotalSlides        = (s: any) => s.generation.totalSlides;
export const selectStreamingContent   = (s: any) => s.generation.streamingContent;
export const selectIsGenerating       = (s: any) => s.generation.isGenerating;
export const selectCompletedSlides    = (s: any) => s.generation.completedSlides;
export const selectOutline            = (s: any) => s.generation.outline;
export const selectPresentationId     = (s: any) => s.generation.presentationId;
export const selectOutlineText        = (s: any) => s.generation.outlineText;
export const selectPartialSlides      = (s: any) => s.generation.partialSlides;
export const selectCurrentSlide       = (s: any) => s.generation.currentSlideStreaming;
