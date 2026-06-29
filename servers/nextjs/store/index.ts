import { configureStore } from "@reduxjs/toolkit";
import authReducer from "./authSlice";
import presentationReducer from "./presentationSlice";
import generationReducer from "./generationSlice";
import editorReducer from "./editorSlice";

export const store = configureStore({
  reducer: {
    auth: authReducer,
    presentation: presentationReducer,
    generation: generationReducer,
    editor: editorReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
