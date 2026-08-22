import type { Cohort, ContentPage, ContentType, SortMode } from './types';

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
