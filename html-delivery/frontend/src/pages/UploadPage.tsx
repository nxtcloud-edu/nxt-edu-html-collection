import { FormEvent, useEffect, useMemo, useState } from 'react';
import { addContentVersion, createContent, getCohorts } from '../api';
import { AppShell } from '../components/AppShell';
import type { Cohort } from '../types';

type Mode = 'create' | 'version';

function validateFile(file: File | null) {
  if (!file) return 'HTML 파일을 선택해 주세요.';
  if (!file.name.toLowerCase().endsWith('.html')) return '확장자가 .html인 파일만 올릴 수 있습니다.';
  if (file.size > 1024 * 1024) return 'HTML 파일은 1MB 이하여야 합니다.';
  return '';
}

export function UploadPage() {
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState<Mode>(params.get('mode') === 'version' ? 'version' : 'create');
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [cohortId, setCohortId] = useState(params.get('cohortId') || '');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'info' | 'error' | 'success'; text: string } | null>(null);
  const selectedCohort = useMemo(() => cohorts.find((cohort) => cohort.cohortId === cohortId), [cohorts, cohortId]);

  useEffect(() => {
    document.title = '내 콘텐츠 업로드 · NXT Cloud Showcase';
    const controller = new AbortController();
    getCohorts(controller.signal).then((items) => {
      setCohorts(items);
      if (!cohortId && items.length === 1) setCohortId(items[0].cohortId);
    }).catch((error) => { if (error.name !== 'AbortError') setStatus({ tone: 'error', text: error.message }); });
    return () => controller.abort();
  }, []);

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const fileError = validateFile(data.get('file') instanceof File ? data.get('file') as File : null);
    if (fileError) return setStatus({ tone: 'error', text: fileError });
    setBusy(true); setStatus({ tone: 'info', text: 'HTML을 안전하게 배포하고 있습니다…' });
    try {
      const result = await createContent(data);
      setStatus({ tone: 'success', text: '새 콘텐츠를 만들었습니다. 콘텐츠 페이지로 이동합니다…' });
      window.location.assign(result.content.viewerUrl);
    } catch (error) { setStatus({ tone: 'error', text: error instanceof Error ? error.message : '업로드에 실패했습니다.' }); }
    finally { setBusy(false); }
  }

  async function submitVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    const contentId = String(values.get('contentId') || '').trim();
    const file = values.get('file') instanceof File ? values.get('file') as File : null;
    const fileError = validateFile(file);
    if (!/^[0-9a-f]{8}$/.test(contentId)) return setStatus({ tone: 'error', text: '콘텐츠 ID 8자리를 확인해 주세요.' });
    if (fileError) return setStatus({ tone: 'error', text: fileError });
    const data = new FormData(); data.set('password', String(values.get('password') || '')); data.set('file', file!);
    setBusy(true); setStatus({ tone: 'info', text: '기존 콘텐츠에 새 버전을 추가하고 있습니다…' });
    try {
      const result = await addContentVersion(contentId, data);
      setStatus({ tone: 'success', text: '새 버전을 추가했습니다. 콘텐츠 페이지로 이동합니다…' });
      window.location.assign(result.content.viewerUrl);
    } catch (error) { setStatus({ tone: 'error', text: error instanceof Error ? error.message : '버전 추가에 실패했습니다.' }); }
    finally { setBusy(false); }
  }

  return <AppShell railLabel="PUBLISH / 17" navigation={[{ label: '제출 방식', href: '#mode' }, { label: '콘텐츠 정보', href: '#form' }, { label: '파일 확인', href: '#file-help' }]} foot="원본 HTML 그대로 보존">
    <section className="workflow-hero"><p className="eyebrow">PUBLISH YOUR CONTENT</p><h1>내 콘텐츠 업로드</h1><p>새 결과물을 만들거나, 기존 콘텐츠의 ID를 지정해 새 버전을 추가하세요.</p></section>
    <section className="workflow-grid" id="mode">
      <aside className="workflow-context"><p className="eyebrow">TWO CLEAR PATHS</p><h2>생성과 업데이트를<br />섞지 않습니다.</h2><ol><li><b>01</b> 새 콘텐츠는 항상 새 ID를 받습니다.</li><li><b>02</b> 업데이트는 기존 ID와 소유 비밀번호가 필요합니다.</li><li><b>03</b> HTML 원본은 버전별로 덮어쓰기 없이 보존됩니다.</li></ol></aside>
      <div className="workflow-panel" id="form">
        <div className="mode-tabs" role="tablist" aria-label="업로드 방식"><button type="button" role="tab" aria-selected={mode === 'create'} onClick={() => { setMode('create'); setStatus(null); }}>새 콘텐츠 만들기</button><button type="button" role="tab" aria-selected={mode === 'version'} onClick={() => { setMode('version'); setStatus(null); }}>기존 콘텐츠 새 버전</button></div>
        {mode === 'create' ? <form id="createForm" onSubmit={submitCreate} aria-label="새 콘텐츠 만들기">
          <label htmlFor="cohortId">소속(수업)</label><select id="cohortId" name="cohortId" value={cohortId} onChange={(event) => setCohortId(event.target.value)} required disabled={!cohorts.length}><option value="">수업을 선택하세요</option>{cohorts.map((cohort) => <option value={cohort.cohortId} key={cohort.cohortId}>{cohort.name}</option>)}</select>
          <label htmlFor="contentType">분류</label><select id="contentType" name="contentType" required defaultValue=""><option value="" disabled>분류를 선택하세요</option><option value="webpage">웹페이지</option><option value="game">미니게임</option></select>
          <label htmlFor="ownerName">{selectedCohort?.submissionMode === 'team' ? '팀' : '이름'}</label>{selectedCohort?.submissionMode === 'team' ? <select id="ownerName" name="ownerName" required defaultValue=""><option value="" disabled>팀을 선택하세요</option>{selectedCohort.teamOptions?.map((team) => <option key={team}>{team}</option>)}</select> : <input id="ownerName" name="ownerName" maxLength={40} autoComplete="name" required />}
          <label htmlFor="title">콘텐츠 제목</label><input id="title" name="title" maxLength={60} placeholder="예: 우리 동네 탄소 지도" required />
          <label htmlFor="password">소유 비밀번호</label><input id="password" name="password" type="password" minLength={4} maxLength={30} autoComplete="new-password" required /><p className="field-help">업데이트할 때 다시 사용합니다. 운영자는 평문 비밀번호를 저장하지 않습니다.</p>
          <label htmlFor="file">HTML 파일</label><input id="file" name="file" type="file" accept=".html,text/html" required /><p className="field-help" id="file-help">단일 HTML · 최대 1MB · 원본 그대로 버전 보존</p>
          <button className="submit-action" type="submit" disabled={busy || !cohorts.length}>{busy ? '처리 중…' : '새 콘텐츠 만들기'}</button>
        </form> : <form id="versionForm" onSubmit={submitVersion} aria-label="기존 콘텐츠 새 버전">
          <label htmlFor="versionContentId">콘텐츠 ID</label><input id="versionContentId" name="contentId" pattern="[0-9a-f]{8}" maxLength={8} placeholder="예: a1b2c3d4" required /><p className="field-help">공유 주소의 <code>?id=</code> 뒤 8자리입니다.</p>
          <label htmlFor="versionPassword">소유 비밀번호</label><input id="versionPassword" name="password" type="password" minLength={4} maxLength={30} autoComplete="current-password" required />
          <label htmlFor="versionFile">새 HTML 파일</label><input id="versionFile" name="file" type="file" accept=".html,text/html" required /><p className="field-help">제목·피드백·추천·공유 주소는 유지되고 버전만 증가합니다.</p>
          <button className="submit-action" type="submit" disabled={busy}>{busy ? '처리 중…' : '새 버전 추가하기'}</button>
        </form>}
        {status ? <div className={`workflow-status workflow-status--${status.tone}`} role={status.tone === 'error' ? 'alert' : 'status'}>{status.text}</div> : null}
      </div>
    </section>
  </AppShell>;
}
