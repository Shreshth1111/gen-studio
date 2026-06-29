import api from "./client";

/* ── Images ──────────────────────────────────────────────────────────────── */
export interface GenImage { id: string; url: string; prompt: string }

export async function generateImages(payload: {
  prompt: string; count: number; width: number; height: number;
}): Promise<{ images: GenImage[] }> {
  const { data } = await api.post("/studio/images", payload);
  return data;
}

/* ── Quiz ────────────────────────────────────────────────────────────────── */
export interface QuizQuestion {
  id: number;
  type: "mcq" | "subjective";
  difficulty: "easy" | "medium" | "hard";
  bloom: string;
  question: string;
  options: string[] | null;
  answer: string;
  explanation: string;
}

export async function generateQuiz(payload: {
  topic: string; source_text?: string;
  mcq_easy: number; mcq_medium: number; mcq_hard: number;
  subj_easy: number; subj_medium: number; subj_hard: number;
}): Promise<{ topic: string; questions: QuizQuestion[] }> {
  const { data } = await api.post("/studio/quiz", payload);
  return data;
}

/* ── Lecture notes ───────────────────────────────────────────────────────── */
export interface NotesSection {
  heading: string;
  body: string;
  table?: { title?: string; headers: string[]; rows: string[][] };
  chart?: { title?: string; type: string; labels: string[]; values: number[] };
}
export interface LectureNotes {
  title: string;
  subtitle?: string;
  reading_time?: string;
  sections: NotesSection[];
  key_terms: { term: string; definition: string }[];
  references: string[];
}

export async function generateNotes(payload: {
  topic: string; source_text?: string; depth: string;
}): Promise<LectureNotes> {
  const { data } = await api.post("/studio/notes", payload);
  return data;
}

/* Reuse the existing document-parse endpoint for uploads. */
export async function parseDoc(file: File): Promise<{ text: string; filename: string }> {
  const form = new FormData();
  form.append("file", file);
  const { data } = await api.post("/outlines/parse-document", form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}
