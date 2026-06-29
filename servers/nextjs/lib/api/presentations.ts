import api from "./client";

export async function login(email: string, password: string) {
  const form = new FormData();
  // OAuth2PasswordRequestForm always uses "username" field; we pass email there.
  form.append("username", email);
  form.append("password", password);
  const { data } = await api.post("/auth/login", form, {
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  return data;
}

export async function register(payload: {
  username: string;
  email: string;
  password: string;
}) {
  const { data } = await api.post("/auth/register", payload);
  return data;
}

export async function getMe() {
  const { data } = await api.get("/auth/me");
  return data;
}

export async function shooliniLogin(username: string, password: string) {
  const { data } = await api.post("/auth/shoolini-login", { username, password });
  return data;
}

/** Export PPTX and push it to SageStudio. Returns a redirect_url the
 *  frontend should navigate to. */
export async function pushToSageStudio(
  presentationId: string,
): Promise<{ redirect_url: string; pptx_url: string; mode: string }> {
  const { data } = await api.post(
    `/export/${presentationId}/pptx/push-to-sagestudio`,
  );
  return data;
}

export async function listPresentations() {
  const { data } = await api.get("/presentations");
  return data;
}

export async function createPresentation(payload: {
  topic: string;
  tone?: string;
  audience?: string;
  content_density?: string;
  slide_count?: number;
  theme?: string;
  language?: string;
  source_text?: string;
}) {
  const { data } = await api.post("/presentations", payload);
  return data;
}

export async function getPresentation(id: string) {
  const { data } = await api.get(`/presentations/${id}`);
  return data;
}

export async function updatePresentation(id: string, payload: any) {
  const { data } = await api.put(`/presentations/${id}`, payload);
  return data;
}

export async function deletePresentation(id: string) {
  const { data } = await api.delete(`/presentations/${id}`);
  return data;
}

export async function saveOutline(id: string, outline: any[]) {
  const { data } = await api.put(`/presentations/${id}/outline`, { outline });
  return data;
}

export async function exportPptx(id: string) {
  const { data } = await api.post(`/export/${id}/pptx`);
  return data;
}

/** Build the auth-aware download URL the browser can fetch directly. */
export function pptxDownloadUrl(presentationId: string): string {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8085";
  return `${base}/api/v1/export/${presentationId}/pptx/download?token=${encodeURIComponent(token)}`;
}

export async function updateSlide(slideId: string, payload: any) {
  const { data } = await api.put(`/slides/${slideId}`, payload);
  return data;
}

/** Persist a new slide order (full ordered list of slide ids). */
export async function reorderSlidesApi(presentationId: string, slideIds: string[]) {
  const { data } = await api.post(`/presentations/${presentationId}/reorder`, { slide_ids: slideIds });
  return data;
}

/** Insert a new slide (blank by default) after a given slide number. */
export async function addSlideApi(
  presentationId: string,
  opts: { after_slide_number?: number; layout_type?: string } = {},
) {
  const { data } = await api.post(`/presentations/${presentationId}/slides`, opts);
  return data;
}

/** Delete a single slide. */
export async function deleteSlideApi(slideId: string) {
  const { data } = await api.delete(`/slides/${slideId}`);
  return data;
}

/** Bulk-generate LLM voiceover scripts for all slides that have empty speaker_notes. */
export async function generateAllVoiceovers(
  presentationId: string,
): Promise<{ slides: Array<{ id: string; slide_number: number; speaker_notes: string }> }> {
  const { data } = await api.post(`/export/${presentationId}/generate-all-voiceovers`);
  return data;
}

/** Generate an instructor voiceover script for a slide; persists to speaker_notes. */
export async function generateVoiceover(
  slideId: string,
  opts: { word_limit: number; instruction?: string },
): Promise<{ speaker_notes: string; word_count: number }> {
  const { data } = await api.post(`/slides/${slideId}/voiceover`, opts);
  return data;
}

export async function generateImage(prompt: string) {
  const { data } = await api.post("/images/generate", { prompt });
  return data;
}

/** Upload an arbitrary image file (used by free-placement overlays). */
export async function uploadImage(file: File): Promise<{ id: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/images/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** Upload a PDF/DOCX and return its extracted plain text so the caller can
 *  pass it as ``source_text`` to ``createPresentation``. */
export async function parseDocument(
  file: File,
): Promise<{ filename: string; length: number; truncated: boolean; text: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/outlines/parse-document", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

/** Regenerate the image for a single slide. Persists the new URL on the slide
 *  and returns the updated content + image_url. */
export async function regenerateSlideImage(
  slideId: string,
  prompt?: string,
): Promise<{ image_url: string; image_prompt: string; content: any }> {
  const { data } = await api.post(`/slides/${slideId}/regenerate-image`, {
    prompt: prompt ?? null,
  });
  return data;
}

/** Build the SSE URL for streaming a single-slide regeneration. The caller
 *  reads it with fetch() and dispatches Redux events as data flows in. */
export function slideRegenStreamUrl(
  slideId: string,
  opts: { layoutType?: string; instruction?: string } = {},
): string {
  const token = typeof window !== "undefined" ? localStorage.getItem("token") || "" : "";
  const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8085";
  const params = new URLSearchParams({ token });
  if (opts.layoutType) params.set("layout_type", opts.layoutType);
  if (opts.instruction) params.set("instruction", opts.instruction);
  return `${base}/api/v1/slides/${slideId}/regenerate/stream?${params.toString()}`;
}
