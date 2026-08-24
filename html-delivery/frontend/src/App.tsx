import { FormEvent, KeyboardEvent, useEffect, useMemo, useState } from 'react';
import { getCohorts, getContents } from './api';
import { AppShell } from './components/AppShell';
import { CohortBars, TypeDonut } from './components/Charts';
import { ContentCard } from './components/ContentCard';
import { StatusBadge } from './components/StatusBadge';
import { UploadPage } from './pages/UploadPage';
import { ViewPage } from './pages/ViewPage';
import { AdminPage } from './pages/AdminPage';
import type { Cohort, ContentPage, ContentType, SortMode } from './types';

const PAGE_SIZE = 10;
type HomeTab = 'gallery' | 'cohorts' | 'overview';
const HOME_TABS: readonly HomeTab[] = ['overview', 'gallery', 'cohorts'];

function homeTabFromHash(): HomeTab {
  const hash = window.location.hash.slice(1);
  return hash === 'gallery' || hash === 'cohorts' ? hash : 'overview';
}

function routeCohortId() {
  const params = new URLSearchParams(window.location.search);
  return window.location.pathname === '/cohort.html' ? params.get('id') || '' : params.get('cohortId') || '';
}

function GalleryPage() {
  const cohortId = routeCohortId();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortsError, setCohortsError] = useState('');
  const [page, setPage] = useState<ContentPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [type, setType] = useState<ContentType | 'all'>('all');
  const [sort, setSort] = useState<SortMode>('latest');
  const [searchDraft, setSearchDraft] = useState('');
  const [query, setQuery] = useState('');
  const [cursorHistory, setCursorHistory] = useState<(string | null)[]>([null]);
  const [pageIndex, setPageIndex] = useState(0);
  const [homeTab, setHomeTab] = useState<HomeTab>(homeTabFromHash);
  const cursor = cursorHistory[pageIndex];

  useEffect(() => {
    const controller = new AbortController();
    getCohorts(controller.signal).then(setCohorts).catch((reason) => {
      if (reason.name !== 'AbortError') setCohortsError(reason.message);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getContents({ cohortId, type, sort, query, cursor, pageSize: PAGE_SIZE }, controller.signal)
      .then(setPage)
      .catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [cohortId, type, sort, query, cursor]);

  const selectedCohort = cohorts.find((cohort) => cohort.cohortId === cohortId);
  useEffect(() => {
    document.title = selectedCohort ? `${selectedCohort.name} · NXT Cloud Showcase` : 'NXT Cloud AI 콘텐츠 쇼케이스';
  }, [selectedCohort]);
  useEffect(() => {
    const syncHomeTab = () => setHomeTab(homeTabFromHash());
    window.addEventListener('hashchange', syncHomeTab);
    return () => window.removeEventListener('hashchange', syncHomeTab);
  }, []);
  const totals = useMemo(() => cohorts.reduce((sum, cohort) => ({
    contents: sum.contents + cohort.contentCount,
    games: sum.games + cohort.gameCount,
    webpages: sum.webpages + cohort.webpageCount,
  }), { contents: 0, games: 0, webpages: 0 }), [cohorts]);
  const scopeTotals = selectedCohort ? {
    contents: selectedCohort.contentCount,
    games: selectedCohort.gameCount,
    webpages: selectedCohort.webpageCount,
  } : totals;

  function resetPage() { setCursorHistory([null]); setPageIndex(0); }
  function changeType(nextType: ContentType | 'all') { setType(nextType); resetPage(); }
  function changeSort(nextSort: SortMode) { setSort(nextSort); resetPage(); }
  function submitSearch(event: FormEvent) { event.preventDefault(); setQuery(searchDraft.trim()); resetPage(); }
  function selectHomeTab(nextTab: HomeTab) {
    setHomeTab(nextTab);
    window.history.replaceState(null, '', `#${nextTab}`);
  }
  function navigateHomeTabs(event: KeyboardEvent<HTMLButtonElement>, currentTab: HomeTab) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = HOME_TABS.indexOf(currentTab);
    const nextIndex = event.key === 'Home' ? 0 : event.key === 'End' ? HOME_TABS.length - 1 : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + HOME_TABS.length) % HOME_TABS.length;
    const nextTab = HOME_TABS[nextIndex];
    selectHomeTab(nextTab);
    document.getElementById(`home-tab-${nextTab}`)?.focus();
  }
  function nextPage() {
    if (!page?.nextCursor) return;
    setCursorHistory((current) => [...current.slice(0, pageIndex + 1), page.nextCursor]);
    setPageIndex((current) => current + 1);
    document.getElementById('gallery')?.scrollIntoView({ block: 'start' });
  }
  function previousPage() {
    if (!pageIndex) return;
    setPageIndex((current) => current - 1);
    document.getElementById('gallery')?.scrollIntoView({ block: 'start' });
  }

  const isCohortPage = window.location.pathname === '/cohort.html' || Boolean(cohortId);
  const title = isCohortPage ? selectedCohort?.name || '수업 콘텐츠' : 'AI와 함께 만든 우리들의 콘텐츠';

  return (
    <AppShell>
      <section className="gallery-hero" id="overview">
        <div><p className="eyebrow">{isCohortPage ? 'COHORT COLLECTION' : 'NXT CLOUD · AI CONTENT SHOWCASE'}</p><h1>{title}</h1><p className="gallery-hero__copy">게임과 웹페이지를 한곳에서 발견하고, 직접 사용해 본 경험을 피드백으로 연결합니다.</p></div>
        <div className="hero-stat" aria-label={`${scopeTotals.contents}개 콘텐츠`}><strong>{scopeTotals.contents || '—'}</strong><span>CONTENTS</span></div>
      </section>

      {isCohortPage && !selectedCohort && !cohortsError && cohorts.length > 0 ? <section className="message-state" role="status"><h2>등록된 수업을 찾을 수 없습니다.</h2><a href="/">전체 갤러리로 돌아가기</a></section> : null}

      {!isCohortPage ? <nav className="home-tabs" aria-label="홈 화면 보기" role="tablist">
        {([['overview', '대시보드'], ['gallery', '콘텐츠 둘러보기'], ['cohorts', '수업별 모아보기']] as const).map(([value, label]) => <button id={`home-tab-${value}`} type="button" role="tab" tabIndex={homeTab === value ? 0 : -1} aria-selected={homeTab === value} aria-controls={`home-panel-${value}`} onClick={() => selectHomeTab(value)} onKeyDown={(event) => navigateHomeTabs(event, value)} key={value}>{label}</button>)}
      </nav> : null}

      <div className={isCohortPage ? undefined : 'home-panel'} id={isCohortPage ? undefined : 'home-panel-overview'} role={isCohortPage ? undefined : 'tabpanel'} aria-labelledby={isCohortPage ? undefined : 'home-tab-overview'} hidden={!isCohortPage && homeTab !== 'overview'}>
      <section className="live-metrics" aria-label="콘텐츠 현황">
        <div><span>전체</span><strong>{scopeTotals.contents || '—'}</strong></div><div><span>웹페이지</span><strong>{scopeTotals.webpages || '—'}</strong></div><div><span>미니게임</span><strong>{scopeTotals.games || '—'}</strong></div><div><span>{isCohortPage ? '제출 방식' : '운영 수업'}</span><strong>{isCohortPage ? (selectedCohort?.submissionMode === 'team' ? 'TEAM' : 'IND') : cohorts.length || '—'}</strong></div>
      </section>

      {!isCohortPage && cohorts.length > 0 ? <section className="insight-grid" aria-label="갤러리 데이터 요약"><article><div className="insight-head"><p className="eyebrow">TYPE MIX</p><h2>무엇을 만들었나</h2></div><TypeDonut gameCount={totals.games} webpageCount={totals.webpages} /></article><article><div className="insight-head"><p className="eyebrow">TOP COHORTS</p><h2>어디서 만들었나</h2></div><CohortBars cohorts={cohorts} /></article></section> : null}
      </div>

      <section className={`gallery-section${isCohortPage ? '' : ' home-panel'}`} id={isCohortPage ? 'gallery' : 'home-panel-gallery'} role={isCohortPage ? undefined : 'tabpanel'} aria-labelledby={isCohortPage ? undefined : 'home-tab-gallery'} hidden={!isCohortPage && homeTab !== 'gallery'}>
        <div className="section-heading gallery-heading"><div><p className="eyebrow">EXPLORE</p><h2>{isCohortPage ? '수업 결과물' : '콘텐츠 둘러보기'}</h2></div><span className="result-count" aria-live="polite">{page ? `${page.total}개의 콘텐츠` : '불러오는 중'}</span></div>
        <div className="filter-deck">
          <div className="segmented" aria-label="콘텐츠 분류 필터">{([['all', '전체'], ['webpage', '웹페이지'], ['game', '미니게임']] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={type === value} onClick={() => changeType(value)}>{label}</button>)}</div>
          <div className="segmented" aria-label="콘텐츠 정렬"><button type="button" aria-pressed={sort === 'latest'} onClick={() => changeSort('latest')}>최신순</button><button type="button" aria-pressed={sort === 'likes'} onClick={() => changeSort('likes')}>추천순</button></div>
          <form className="search-form" role="search" onSubmit={submitSearch}><label htmlFor="gallery-search">콘텐츠 검색</label><input id="gallery-search" value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="제목, 이름, 수업" maxLength={60} /><button type="submit">검색</button></form>
        </div>
        {loading ? <div className="message-state" role="status">콘텐츠를 불러오는 중입니다.</div> : null}
        {error ? <div className="message-state message-state--error" role="alert"><strong>{error}</strong><button type="button" onClick={() => window.location.reload()}>다시 시도</button></div> : null}
        {!loading && !error && page?.contents.length === 0 ? <div className="message-state" role="status">조건에 맞는 콘텐츠가 아직 없습니다.</div> : null}
        {!loading && !error && page?.contents.length ? <div className="content-list">{page.contents.map((content, index) => <ContentCard content={content} rank={(pageIndex * PAGE_SIZE) + index + 1} key={content.contentId} />)}</div> : null}
        {!loading && !error && page && (pageIndex > 0 || page.nextCursor) ? <nav className="pager" aria-label="콘텐츠 페이지"><button type="button" onClick={previousPage} disabled={pageIndex === 0}>← 이전</button><span><b>{pageIndex + 1}</b> 페이지</span><button type="button" onClick={nextPage} disabled={!page.nextCursor}>다음 →</button></nav> : null}
      </section>

      {!isCohortPage ? <section className="cohort-section home-panel" id="home-panel-cohorts" role="tabpanel" aria-labelledby="home-tab-cohorts" hidden={homeTab !== 'cohorts'}><div className="section-heading gallery-heading"><div><p className="eyebrow">COHORTS</p><h2>수업별 모아보기</h2></div><StatusBadge tone="active">{cohorts.length}개 운영</StatusBadge></div>{cohortsError ? <div className="message-state message-state--error" role="alert">{cohortsError}</div> : <div className="cohort-list">{cohorts.map((cohort, index) => <a href={`/cohort.html?id=${encodeURIComponent(cohort.cohortId)}`} key={cohort.cohortId}><span>{String(index + 1).padStart(2, '0')}</span><strong>{cohort.name}</strong><small>{cohort.dateLabel || '일정 미정'}</small><b>{cohort.contentCount}<em>개</em></b></a>)}</div>}</section> : null}

      <footer><span>© NXT Cloud</span><span className="footer-meta"><span>283 CONTENTS · 396 VERSIONS · PRESERVED</span><a href="/admin.html">관리자</a></span></footer>
    </AppShell>
  );
}

export function App() {
  if (window.location.pathname === '/admin.html') return <AdminPage />;
  if (window.location.pathname === '/upload.html') return <UploadPage />;
  if (window.location.pathname === '/view.html') return <ViewPage />;
  return <GalleryPage />;
}
