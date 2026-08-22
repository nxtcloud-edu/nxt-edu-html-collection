import type { Cohort, Content, ContentPage, ContentType, Feedback, SortMode } from './types';

async function readJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(response.status === 400 ? '필터 조건을 다시 확인해 주세요.' : '콘텐츠를 불러오지 못했습니다.');
  return response.json() as Promise<T>;
}

export async function getCohorts(signal?: AbortSignal) {
  const data = await readJson<{ cohorts: Cohort[] }>('/api/v2/cohorts', signal);
  return data.cohorts.filter((cohort) => cohort.status === 'active');
}

export function getContents(options: {
  cohortId?: string;
  type?: ContentType | 'all';
  sort: SortMode;
  query?: string;
  cursor?: string | null;
  pageSize?: number;
}, signal?: AbortSignal) {
  const params = new URLSearchParams({ sort: options.sort, pageSize: String(options.pageSize || 10) });
  if (options.cohortId) params.set('cohortId', options.cohortId);
  if (options.type && options.type !== 'all') params.set('type', options.type);
  if (options.query) params.set('query', options.query);
  if (options.cursor) params.set('cursor', options.cursor);
  return readJson<ContentPage>(`/api/v2/contents?${params}`, signal);
}

export async function getContent(contentId: string, signal?: AbortSignal) {
  return (await readJson<{ content: Content }>(`/api/v2/contents/${contentId}`, signal)).content;
}

export async function getFeedback(contentId: string, signal?: AbortSignal) {
  return (await readJson<{ feedback: Feedback[] }>(`/api/feedback?id=${contentId}`, signal)).feedback;
}

async function sendForm(url: string, body: FormData) {
  const response = await fetch(url, { method: 'POST', body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '요청을 처리하지 못했습니다.');
  return data as { content: Content };
}

export function createContent(body: FormData) { return sendForm('/api/v2/contents', body); }
export function addContentVersion(contentId: string, body: FormData) { return sendForm(`/api/v2/contents/${contentId}/versions`, body); }

export async function likeContent(contentId: string) {
  const response = await fetch('/api/like', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentId }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '추천하지 못했습니다.');
  return data.likes as number;
}

export async function createFeedback(contentId: string, nickname: string, message: string) {
  const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contentId, nickname, message }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '피드백을 등록하지 못했습니다.');
  return data.feedback as Feedback;
}
