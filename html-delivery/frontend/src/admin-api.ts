import type { Cohort, Content, Feedback } from './types';

export interface AdminContent extends Content { latestObjectKey: string; fallbackObjectKey: string | null; storageScheme: string; }
export interface AdminCohort extends Cohort { editable: boolean; createdAt: string | null; updatedAt: string | null; }
export interface Version { contentId: string; version: number; objectKey: string; originalFileName: string | null; sizeBytes: number; sha256: string; uploadedAt: string | null; }
export interface AuditLog { auditId: string; actorId: string; action: string; targetType: string; targetId: string | null; occurredAt: string; details: Record<string, unknown>; }
export interface ExportJob { exportId: string; cohort: string; cohortId?: string; status: 'queued' | 'running' | 'completed' | 'failed'; count?: number; attempt: number; requestedAt: string; downloadUrl?: string; }
export interface Overview { summary: { totalContents: number; gameCount: number; webpageCount: number; totalVersions: number; latestUpdatedAt: string | null }; storage: { legacyGames: number; v2Contents: number; unknown: number }; }

async function adminRequest<T>(path: string, options: RequestInit = {}) {
  const response = await fetch(path, { credentials: 'same-origin', ...options, headers: { ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers } });
  let body: unknown = null; try { body = await response.json(); } catch { /* empty response */ }
  if (!response.ok) { const error = new Error((body as { error?: string })?.error || '요청을 처리하지 못했습니다.'); (error as Error & { status?: number }).status = response.status; throw error; }
  return body as T;
}

export const adminApi = {
  session: () => adminRequest<{ ok: true }>('/api/admin/session'),
  login: (id: string, password: string) => adminRequest<{ ok: true }>('/api/admin/login', { method: 'POST', body: JSON.stringify({ id, password }) }),
  logout: () => adminRequest<{ ok: true }>('/api/admin/logout', { method: 'POST' }),
  contents: (params = '') => adminRequest<{ contents: AdminContent[]; page: { total: number; nextCursor: string | null } }>(`/api/v2/admin/contents?pageSize=25${params ? `&${params}` : ''}`),
  cohorts: () => adminRequest<{ cohorts: AdminCohort[] }>('/api/v2/admin/cohorts'),
  overview: () => adminRequest<{ overview: Overview }>('/api/admin/cohort-overview?cohort='),
  versions: (id: string) => adminRequest<{ contentId: string; versions: Version[] }>(`/api/v2/admin/contents/${id}/versions`),
  feedback: (id: string) => adminRequest<{ feedback: Feedback[] }>(`/api/feedback?id=${id}`),
  audits: () => adminRequest<{ auditLogs: AuditLog[] }>('/api/v2/admin/audit-logs?limit=25'),
  exports: () => adminRequest<{ exports: ExportJob[] }>('/api/admin/exports?limit=20'),
  updateContent: (id: string, body: unknown) => adminRequest<{ content: AdminContent }>(`/api/v2/admin/contents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteContent: (id: string) => adminRequest<{ ok: true }>(`/api/admin/content/${id}`, { method: 'DELETE' }),
  resetContentPassword: (contentId: string, newPassword: string) => adminRequest<{ ok: true }>('/api/admin/reset-password', { method: 'POST', body: JSON.stringify({ contentId, newPassword }) }),
  deleteFeedback: (contentId: string, createdAt: string) => adminRequest<{ ok: true }>('/api/admin/feedback', { method: 'DELETE', body: JSON.stringify({ contentId, createdAt }) }),
  createCohort: (body: unknown) => adminRequest<{ cohort: AdminCohort }>('/api/v2/admin/cohorts', { method: 'POST', body: JSON.stringify(body) }),
  updateCohort: (id: string, body: unknown) => adminRequest<{ cohort: AdminCohort }>(`/api/v2/admin/cohorts/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  createExport: (cohortId: string) => adminRequest<{ export: ExportJob }>('/api/v2/admin/exports', { method: 'POST', body: JSON.stringify({ cohortId }) }),
  retryExport: (id: string) => adminRequest<{ export: ExportJob }>(`/api/admin/exports/${id}/retry`, { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) => adminRequest<{ ok: true }>('/api/admin/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  addAdmin: (id: string, password: string) => adminRequest<{ ok: true }>('/api/admin/admins', { method: 'POST', body: JSON.stringify({ id, password }) }),
};
