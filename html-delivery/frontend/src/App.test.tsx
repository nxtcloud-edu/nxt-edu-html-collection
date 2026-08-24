import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './App';

const cohort = { cohortId: 'coh_aaaaaaaaaaaa', name: 'AI 리터러시 1기', dateLabel: '8.22', submissionMode: 'individual', status: 'active', contentCount: 12, gameCount: 4, webpageCount: 8 };
const contents = Array.from({ length: 10 }, (_, index) => ({ contentId: `a${String(index + 1).padStart(7, '0')}`, title: `AI 프로젝트 ${index + 1}`, contentType: index % 3 ? 'webpage' : 'game', owner: { kind: 'individual', name: `학생 ${index + 1}` }, cohort, latestVersion: 1, likes: 10 - index, updatedAt: '2026-08-22T00:00:00.000Z', viewerUrl: `/view.html?id=a${String(index + 1).padStart(7, '0')}` }));

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const body = url.includes('/cohorts') ? { cohorts: [cohort] } : { contents, total: 12, nextCursor: 'next-page' };
    return { ok: true, json: async () => body } as Response;
  }));
});

describe('Phase 16 공개 갤러리', () => {
  it('대시보드를 기본으로 열고 콘텐츠 첫 페이지 10개로 전환한다', async () => {
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'AI와 함께 만든 우리들의 콘텐츠' })).toBeInTheDocument();
    expect(await screen.findByRole('tabpanel', { name: '대시보드' })).toBeVisible();
    expect(screen.getByRole('link', { name: '관리자' })).toHaveAttribute('href', '/admin.html');
    expect(screen.getByLabelText('콘텐츠 유형 분포: 미니게임 4개, 웹페이지 8개')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: '콘텐츠 둘러보기' }));
    expect(await screen.findByText('12개의 콘텐츠')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /AI 프로젝트/ })).toHaveLength(10);
  });

  it('필터와 검색을 서버 query로 다시 요청한다', async () => {
    render(<App />);
    fireEvent.click(await screen.findByRole('tab', { name: '콘텐츠 둘러보기' }));
    await screen.findByText('12개의 콘텐츠');
    fireEvent.click(screen.getByRole('button', { name: '웹페이지' }));
    fireEvent.change(screen.getByLabelText('콘텐츠 검색'), { target: { value: '지도' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('type=webpage'), expect.anything()));
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('query=%EC%A7%80%EB%8F%84'), expect.anything()));
  });
});
