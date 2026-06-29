import { createSlice, PayloadAction } from "@reduxjs/toolkit";

// ── Presentation Slice ─────────────────────────────────────────────────────

interface SlideData {
  id: string;
  slide_number: number;
  layout_type: string;
  title: string | null;
  content: Record<string, any>;
  speaker_notes?: string;
  image_url?: string;
}

interface PresentationData {
  id: string;
  title: string;
  topic: string;
  theme: string;
  tone: string;
  language: string;
  slide_count: number;
  status: string;
}

interface PresentationState {
  presentation: PresentationData | null;
  slides: SlideData[];
  activeSlideId: string | null;
  isLoading: boolean;
  error: string | null;
  history: SlideData[][];
  future: SlideData[][];
}

const presentationInitial: PresentationState = {
  presentation: null,
  slides: [],
  activeSlideId: null,
  isLoading: false,
  error: null,
  history: [],
  future: [],
};

const presentationSlice = createSlice({
  name: "presentation",
  initialState: presentationInitial,
  reducers: {
    setPresentation(state, action: PayloadAction<PresentationData>) {
      state.presentation = action.payload;
    },
    setSlides(state, action: PayloadAction<SlideData[]>) {
      state.slides = action.payload;
      if (action.payload.length > 0 && !state.activeSlideId) {
        state.activeSlideId = action.payload[0].id;
      }
    },
    setActiveSlide(state, action: PayloadAction<string>) {
      state.activeSlideId = action.payload;
    },
    updateSlide(state, action: PayloadAction<Partial<SlideData> & { id: string }>) {
      const idx = state.slides.findIndex(s => s.id === action.payload.id);
      if (idx >= 0) {
        // Push to history before updating
        state.history.push([...state.slides.map(s => ({ ...s }))]);
        state.future = [];
        state.slides[idx] = { ...state.slides[idx], ...action.payload };
      }
    },
    /** Streaming-time patch: like updateSlide but does NOT push history. Used
     *  by the slide-regenerate SSE handler so every partial token doesn't
     *  pollute the undo stack. The `content` field is shallow-merged into
     *  the existing content so partial updates from SSE don't drop fields
     *  that haven't been re-emitted yet. */
    streamPatchSlide(state, action: PayloadAction<Partial<SlideData> & { id: string }>) {
      const idx = state.slides.findIndex(s => s.id === action.payload.id);
      if (idx < 0) return;
      const { id, content, ...rest } = action.payload;
      const current = state.slides[idx];
      state.slides[idx] = {
        ...current,
        ...rest,
        ...(content !== undefined
          ? { content: { ...(current.content || {}), ...content } }
          : {}),
      };
    },
    /** Snapshot the slides into history so the user can undo a streaming
     *  regeneration as a single step. Call this just before starting a
     *  regeneration. */
    pushHistory(state) {
      state.history.push([...state.slides.map(s => ({ ...s }))]);
      state.future = [];
    },
    /** Mutate one bullet item by index (small helper for inline editing). */
    setBullet(
      state,
      action: PayloadAction<{ id: string; bulletKey: string; index: number; value: string }>,
    ) {
      const idx = state.slides.findIndex(s => s.id === action.payload.id);
      if (idx < 0) return;
      const slide = state.slides[idx];
      const arr = [...((slide.content?.[action.payload.bulletKey] as any[]) || [])];
      arr[action.payload.index] = action.payload.value;
      state.history.push([...state.slides.map(s => ({ ...s }))]);
      state.future = [];
      state.slides[idx] = {
        ...slide,
        content: { ...slide.content, [action.payload.bulletKey]: arr },
      };
    },
    addBullet(
      state,
      action: PayloadAction<{ id: string; bulletKey: string; value?: string }>,
    ) {
      const idx = state.slides.findIndex(s => s.id === action.payload.id);
      if (idx < 0) return;
      const slide = state.slides[idx];
      const arr = [...((slide.content?.[action.payload.bulletKey] as any[]) || [])];
      arr.push(action.payload.value ?? "New point");
      state.history.push([...state.slides.map(s => ({ ...s }))]);
      state.future = [];
      state.slides[idx] = {
        ...slide,
        content: { ...slide.content, [action.payload.bulletKey]: arr },
      };
    },
    removeBullet(
      state,
      action: PayloadAction<{ id: string; bulletKey: string; index: number }>,
    ) {
      const idx = state.slides.findIndex(s => s.id === action.payload.id);
      if (idx < 0) return;
      const slide = state.slides[idx];
      const arr = [...((slide.content?.[action.payload.bulletKey] as any[]) || [])];
      arr.splice(action.payload.index, 1);
      state.history.push([...state.slides.map(s => ({ ...s }))]);
      state.future = [];
      state.slides[idx] = {
        ...slide,
        content: { ...slide.content, [action.payload.bulletKey]: arr },
      };
    },
    /** Insert a new slide (kept sorted by slide_number) and select it. */
    addSlideAt(state, action: PayloadAction<SlideData>) {
      state.history.push([...state.slides.map(s => ({ ...s }))]);
      state.future = [];
      const next = [...state.slides, action.payload]
        .sort((a, b) => a.slide_number - b.slide_number);
      state.slides = next;
      state.activeSlideId = action.payload.id;
    },
    /** Remove a slide and move selection to a sensible neighbour. */
    removeSlide(state, action: PayloadAction<string>) {
      const idx = state.slides.findIndex(s => s.id === action.payload);
      if (idx < 0) return;
      state.history.push([...state.slides.map(s => ({ ...s }))]);
      state.future = [];
      state.slides = state.slides.filter(s => s.id !== action.payload);
      if (state.activeSlideId === action.payload) {
        state.activeSlideId = state.slides[Math.min(idx, state.slides.length - 1)]?.id || null;
      }
    },
    /** Reorder slides to match the given list of ids, renumbering 1..N. */
    reorderSlides(state, action: PayloadAction<string[]>) {
      const byId = new Map(state.slides.map(s => [s.id, s]));
      const next = action.payload
        .map(id => byId.get(id))
        .filter(Boolean) as SlideData[];
      if (next.length !== state.slides.length) return;
      state.history.push([...state.slides.map(s => ({ ...s }))]);
      state.future = [];
      state.slides = next.map((s, i) => ({ ...s, slide_number: i + 1 }));
    },
    undo(state) {
      if (state.history.length > 0) {
        state.future.push([...state.slides]);
        state.slides = state.history.pop()!;
      }
    },
    redo(state) {
      if (state.future.length > 0) {
        state.history.push([...state.slides]);
        state.slides = state.future.pop()!;
      }
    },
    setLoading(state, action: PayloadAction<boolean>) {
      state.isLoading = action.payload;
    },
    setError(state, action: PayloadAction<string | null>) {
      state.error = action.payload;
    },
  },
});

export const {
  setPresentation, setSlides, setActiveSlide, updateSlide,
  streamPatchSlide, pushHistory, reorderSlides, addSlideAt, removeSlide,
  setBullet, addBullet, removeBullet,
  undo, redo, setLoading, setError,
} = presentationSlice.actions;
export default presentationSlice.reducer;

export const selectActiveSlide = (s: any) => {
  const { slides, activeSlideId } = s.presentation;
  return slides.find((sl: SlideData) => sl.id === activeSlideId) || null;
};
