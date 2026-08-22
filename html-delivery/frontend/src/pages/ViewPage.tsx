import { FormEvent, useEffect, useRef, useState } from 'react';
import { addContentVersion, createFeedback, getContent, getFeedback, likeContent } from '../api';
import { AppShell } from '../components/AppShell';
import { StatusBadge } from '../components/StatusBadge';
import type { Content, Feedback } from '../types';

const formatter = new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' });

export function ViewPage() {
  const contentId = new URLSearchParams(window.location.search).get('id') || '';
  const [content, setContent] = useState<Content | null>(null);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [error, setError] = useState('');
  const [feedbackError, setFeedbackError] = useState('');
  const [likeError, setLikeError] = useState('');
  const [liked, setLiked] = useState(() => localStorage.getItem(`liked:${contentId}`) === '1');
  const [feedbackBusy, setFeedbackBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [updateStatus, setUpdateStatus] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    if (!/^[0-9a-f]{8}$/.test(contentId)) { setError('콘텐츠 ID를 확인해 주세요.'); return; }
    const controller = new AbortController();
    getContent(contentId, controller.signal).then((item) => { setContent(item); document.title = `${item.title} · NXT Cloud Showcase`; }).catch((reason) => { if (reason.name !== 'AbortError') setError(reason.message); });
    getFeedback(contentId, controller.signal).then(setFeedback).catch((reason) => { if (reason.name !== 'AbortError') setFeedbackError(reason.message); });
    return () => controller.abort();
  }, [contentId]);

  async function submitLike() {
    if (!content || liked) return;
    setLiked(true); setLikeError('');
    try { const likes = await likeContent(contentId); setContent({ ...content, likes }); localStorage.setItem(`liked:${contentId}`, '1'); }
    catch (reason) { setLiked(false); setLikeError(reason instanceof Error ? reason.message : '추천하지 못했습니다.'); }
  }

  async function submitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setFeedbackBusy(true); setFeedbackError('');
    try {
      const item = await createFeedback(contentId, String(values.get('nickname') || ''), String(values.get('message') || ''));
      setFeedback((current) => [...current, item]); form.reset();
    } catch (reason) { setFeedbackError(reason instanceof Error ? reason.message : '피드백을 등록하지 못했습니다.'); }
    finally { setFeedbackBusy(false); }
  }

  async function submitUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setUpdateBusy(true); setUpdateStatus('새 버전을 추가하고 있습니다…');
    try {
      await addContentVersion(contentId, values);
      setUpdateStatus('업데이트를 완료했습니다. 최신 화면을 불러옵니다…');
      window.location.reload();
    } catch (reason) { setUpdateStatus(reason instanceof Error ? reason.message : '업데이트하지 못했습니다.'); setUpdateBusy(false); }
  }

  return <AppShell railLabel="VIEW / 17" navigation={[{ label: '콘텐츠 보기', href: '#content' }, { label: '받은 피드백', href: '#feedback' }, { label: '파일 업데이트', href: '#update' }]} foot="학생 HTML 별도 origin">
    {error ? <section className="workflow-hero"><p className="eyebrow">CONTENT ERROR</p><h1>콘텐츠를 찾을 수 없습니다.</h1><p>{error}</p><div className="error-actions"><button type="button" onClick={() => window.location.reload()}>다시 불러오기</button><a href="/">갤러리로 돌아가기</a></div></section> : null}
    {!error && !content ? <div className="message-state" role="status">콘텐츠 정보를 불러오는 중입니다.</div> : null}
    {content ? <>
      <section className="viewer-heading" id="content"><div><p className="eyebrow">OPEN CONTENT · {content.contentId}</p><h1>{content.title}</h1><div className="viewer-meta"><StatusBadge tone={content.contentType === 'game' ? 'planned' : 'active'}>{content.contentType === 'game' ? '미니게임' : '웹페이지'}</StatusBadge><span>{content.owner.name}</span><span>{content.cohort?.name}</span><span>v{content.latestVersion}</span><time dateTime={content.updatedAt}>{formatter.format(new Date(content.updatedAt))}</time></div></div><div className="viewer-actions"><button type="button" className="like-action" onClick={submitLike} disabled={liked}>♥ 추천 {content.likes}</button><button type="button" onClick={() => dialogRef.current?.showModal()}>파일 업데이트</button><a href={content.contentUrl} target="_blank" rel="noopener noreferrer">새 탭에서 크게 보기 ↗</a>{likeError ? <small role="alert">{likeError}</small> : null}</div></section>
      <section className="viewer-frame"><iframe src={content.contentUrl} title={`${content.title} 콘텐츠 화면`} /></section>
      <section className="feedback-layout" id="feedback">
        <form className="feedback-form" onSubmit={submitFeedback}><p className="eyebrow">LEAVE A NOTE</p><h2>피드백 남기기</h2><label htmlFor="nickname">닉네임 <small>선택</small></label><input id="nickname" name="nickname" maxLength={20} autoComplete="nickname" placeholder="비우면 익명" /><label htmlFor="message">내용</label><textarea id="message" name="message" maxLength={500} required placeholder="좋았던 점이나 개선 아이디어를 남겨 주세요." /><button className="submit-action" type="submit" disabled={feedbackBusy}>{feedbackBusy ? '등록 중…' : '피드백 등록'}</button>{feedbackError ? <p className="form-error" role="alert">{feedbackError}</p> : null}</form>
        <div className="feedback-list"><div className="section-heading"><div><p className="eyebrow">FEEDBACK</p><h2>받은 피드백</h2></div><strong>{feedback.length}</strong></div>{feedback.length ? feedback.map((item) => <article key={`${item.createdAt}-${item.nickname}`}><div><strong>{item.nickname || '익명'}</strong><time dateTime={item.createdAt}>{formatter.format(new Date(item.createdAt))}</time></div><p>{item.message}</p></article>) : <div className="message-state">아직 피드백이 없습니다. 첫 의견을 남겨 보세요.</div>}</div>
      </section>
      <dialog className="update-dialog" ref={dialogRef} id="update" aria-labelledby="update-title"><form onSubmit={submitUpdate}><p className="eyebrow">ADD VERSION</p><h2 id="update-title">파일 업데이트</h2><p>공유 주소와 피드백은 유지하고 HTML만 새 버전으로 추가합니다.</p><label htmlFor="updatePassword">소유 비밀번호</label><input id="updatePassword" name="password" type="password" minLength={4} maxLength={30} autoComplete="current-password" required /><label htmlFor="updateFile">새 HTML 파일</label><input id="updateFile" name="file" type="file" accept=".html,text/html" required />{updateStatus ? <p className="workflow-status" role="status">{updateStatus}</p> : null}<div><button type="button" onClick={() => dialogRef.current?.close()}>취소</button><button className="submit-action" type="submit" disabled={updateBusy}>{updateBusy ? '처리 중…' : '업데이트'}</button></div></form></dialog>
    </> : null}
  </AppShell>;
}
