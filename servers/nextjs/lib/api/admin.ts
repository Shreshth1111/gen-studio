import api from "./client";

export interface AdminStats {
  total_users: number;
  active_users: number;
  admin_users: number;
  total_presentations: number;
  total_slides: number;
  total_images: number;
  presentations_by_status: Record<string, number>;
  new_users_7d: number;
  new_presentations_7d: number;
}

export interface AdminUser {
  id: string;
  username: string;
  email: string;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  last_login_at: string | null;
  presentation_count: number;
}

export interface AdminPresentation {
  id: string;
  title: string;
  topic: string;
  theme: string;
  status: string;
  slide_count: number;
  created_at: string;
  owner_username: string | null;
  owner_email: string | null;
}

export async function getAdminStats(): Promise<AdminStats> {
  const { data } = await api.get("/admin/stats");
  return data;
}

export async function getAdminUsers(): Promise<AdminUser[]> {
  const { data } = await api.get("/admin/users");
  return data;
}

export async function updateAdminUser(
  id: string,
  patch: { is_active?: boolean; is_admin?: boolean },
): Promise<AdminUser> {
  const { data } = await api.patch(`/admin/users/${id}`, patch);
  return data;
}

export async function deleteAdminUser(id: string): Promise<void> {
  await api.delete(`/admin/users/${id}`);
}

export async function getAdminPresentations(): Promise<AdminPresentation[]> {
  const { data } = await api.get("/admin/presentations");
  return data;
}

export async function deleteAdminPresentation(id: string): Promise<void> {
  await api.delete(`/admin/presentations/${id}`);
}

/* ── Activity log ────────────────────────────────────────────────────────── */
export interface ActivityRow {
  id: string;
  user_id: string | null;
  username: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  detail: string | null;
  ip_address: string | null;
  created_at: string;
}
export async function getAdminActivity(): Promise<ActivityRow[]> {
  const { data } = await api.get("/admin/activity", { params: { limit: 150 } });
  return data;
}

/* ── Global settings ─────────────────────────────────────────────────────── */
export interface SettingRow {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}
export async function getAdminSettings(): Promise<SettingRow[]> {
  const { data } = await api.get("/admin/settings");
  return data;
}
export async function updateAdminSetting(key: string, value: string): Promise<SettingRow> {
  const { data } = await api.put(`/admin/settings/${key}`, { value });
  return data;
}

/* ── Generation history (all prompts & outputs) ──────────────────────────── */
export interface GenerationRow {
  id: string;
  user_id: string;
  username: string | null;
  kind: string;
  title: string | null;
  prompt: string | null;
  presentation_id: string | null;
  slide_id: string | null;
  model_used: string | null;
  created_at: string;
}
export interface GenerationDetail extends GenerationRow {
  params: string | null;
  result: string | null;
}
export async function getAdminGenerations(opts: { kind?: string; user_id?: string } = {}): Promise<GenerationRow[]> {
  const { data } = await api.get("/admin/generations", { params: { limit: 200, ...opts } });
  return data;
}
export async function getAdminGeneration(id: string): Promise<GenerationDetail> {
  const { data } = await api.get(`/admin/generations/${id}`);
  return data;
}
