import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
  token: string | null;
  user: { id: string; username: string; email: string } | null;
  isLoading: boolean;
}

const initialState: AuthState = {
  token: typeof window !== "undefined" ? localStorage.getItem("token") : null,
  user: null,
  isLoading: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setToken(state, action: PayloadAction<string>) {
      state.token = action.payload;
      if (typeof window !== "undefined") {
        localStorage.setItem("token", action.payload);
      }
    },
    setUser(state, action: PayloadAction<{ id: string; username: string; email: string }>) {
      state.user = action.payload;
    },
    logout(state) {
      state.token = null;
      state.user = null;
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
      }
    },
  },
});

export const { setToken, setUser, logout } = authSlice.actions;
export default authSlice.reducer;
export const selectToken = (s: any) => s.auth.token;
export const selectUser = (s: any) => s.auth.user;
