import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface EditorState {
  selectedElementId: string | null;
  zoom: number;
  showGrid: boolean;
  showSpeakerNotes: boolean;
  activeTool: "select" | "text" | "image" | "shape";
  isEditingText: boolean;
  propertiesPanelOpen: boolean;
  theme: string;
}

const editorInitial: EditorState = {
  selectedElementId: null,
  zoom: 1.0,
  showGrid: false,
  showSpeakerNotes: false,
  activeTool: "select",
  isEditingText: false,
  propertiesPanelOpen: true,
  theme: "light",
};

const editorSlice = createSlice({
  name: "editor",
  initialState: editorInitial,
  reducers: {
    setSelectedElement(state, action: PayloadAction<string | null>) {
      state.selectedElementId = action.payload;
    },
    setZoom(state, action: PayloadAction<number>) {
      state.zoom = Math.min(2.0, Math.max(0.3, action.payload));
    },
    toggleGrid(state) { state.showGrid = !state.showGrid; },
    toggleSpeakerNotes(state) { state.showSpeakerNotes = !state.showSpeakerNotes; },
    setActiveTool(state, action: PayloadAction<EditorState["activeTool"]>) {
      state.activeTool = action.payload;
    },
    setEditingText(state, action: PayloadAction<boolean>) {
      state.isEditingText = action.payload;
    },
    togglePropertiesPanel(state) {
      state.propertiesPanelOpen = !state.propertiesPanelOpen;
    },
    setTheme(state, action: PayloadAction<string>) {
      state.theme = action.payload;
    },
  },
});

export const {
  setSelectedElement, setZoom, toggleGrid, toggleSpeakerNotes,
  setActiveTool, setEditingText, togglePropertiesPanel, setTheme,
} = editorSlice.actions;
export default editorSlice.reducer;
