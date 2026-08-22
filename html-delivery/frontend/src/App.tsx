import { AppShell } from './components/AppShell';
import { Button } from './components/Button';
import { MetricCard } from './components/MetricCard';
import { StatusBadge } from './components/StatusBadge';
import { Surface } from './components/Surface';

const routes = [
  { path: '/', name: '공개 갤러리', phase: '16', state: '현재 운영', href: '/' },
  { path: '/cohort.html', name: '코호트 탐색', phase: '16', state: '현재 운영', href: '/cohort.html' },
  { path: '/upload.html', name: '업로드', phase: '17', state: '현재 운영', href: '/upload.html' },
  { path: '/view.html', name: '격리 뷰어', phase: '17', state: '현재 운영', href: '/view.html' },
  { path: '/admin.html', name: '관리자', phase: '18', state: '현재 운영', href: '/admin.html' },
];

export function App() {
  return (
    <AppShell>
      <section className="hero" id="overview">
        <div>
          <p className="eyebrow">PRODUCT FOUNDATION · PHASE 14</p>
          <h1>콘텐츠가 쌓일수록<br />더 선명해지는 운영.</h1>
        </div>
        <div className="hero__copy">
          <p>수강생의 결과물은 그대로 보존하고, 탐색·업로드·관리 흐름을 하나의 제품 언어로 다시 세웁니다.</p>
          <div className="button-row"><Button href="/" variant="primary">현재 갤러리 보기</Button><Button href="#routes">전환 지도</Button></div>
        </div>
      </section>

      <section className="metrics" aria-label="Phase 12 운영 기준선">
        <MetricCard label="CONTENTS" value="283" note="Phase 12 기준선" bars={[32, 44, 50, 62, 72, 68, 86, 100]} />
        <MetricCard label="COHORTS" value="15" note="불변 ID 기반" bars={[18, 18, 34, 42, 58, 58, 76, 92]} />
        <MetricCard label="VERSIONS" value="396" note="원본과 공유 URL 보존" bars={[28, 36, 54, 48, 70, 82, 78, 96]} />
      </section>

      <section className="section" id="routes">
        <div className="section-heading"><div><p className="eyebrow">MIGRATION MAP</p><h2>URL은 유지하고, 화면은 순차 전환</h2></div><StatusBadge tone="active">호환 계약 유지</StatusBadge></div>
        <Surface className="route-table" aria-label="화면 전환 계획">
          <div className="route-row route-row--head"><span>경로</span><span>화면</span><span>전환</span><span>상태</span></div>
          {routes.map((route) => (
            <a className="route-row" href={route.href} key={route.path}>
              <code>{route.path}</code><strong>{route.name}</strong><span>Phase {route.phase}</span><StatusBadge>{route.state}</StatusBadge>
            </a>
          ))}
        </Surface>
      </section>

      <section className="section" id="system">
        <div className="section-heading"><div><p className="eyebrow">SYSTEM PRIMITIVES</p><h2>같은 규칙으로 조립하는 화면</h2></div></div>
        <div className="system-grid">
          <Surface><p className="surface-label">ACTIONS</p><h3>중요도에 따른 동작</h3><div className="button-row"><Button variant="primary">주요 동작</Button><Button>보조 동작</Button><Button variant="quiet">텍스트 동작</Button></div></Surface>
          <Surface><p className="surface-label">STATUS</p><h3>상태를 색에만 맡기지 않기</h3><div className="button-row"><StatusBadge tone="active">운영 중</StatusBadge><StatusBadge tone="planned">전환 예정</StatusBadge><StatusBadge>읽기 전용</StatusBadge></div></Surface>
          <Surface className="contract-card"><p className="surface-label">PRESERVATION CONTRACT</p><h3>283개 콘텐츠를 움직이지 않습니다.</h3><p>기존 콘텐츠 ID, viewer URL, <code>contents/{'{id}'}/vN.html</code>, 비동기 ZIP과 전용 content origin을 유지합니다.</p></Surface>
        </div>
      </section>

      <footer><span>© NXT Cloud</span><span>React + TypeScript + Vite foundation</span></footer>
    </AppShell>
  );
}
