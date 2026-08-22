import type { ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="NXT Cloud Showcase 홈">
          <img src="/assets/nxtcloud-logo.png?v=2" alt="" />
          <span>NXT CLOUD</span><b>SHOWCASE</b>
        </a>
        <nav aria-label="현재 서비스 바로가기">
          <a href="/#gallery">둘러보기</a>
          <a href="/#cohorts">수업별 보기</a>
          <a className="nav-action" href="/upload.html">내 콘텐츠 업로드</a>
        </nav>
      </header>
      <div className="shell-grid">
        <aside className="rail" aria-label="갤러리 탐색">
          <p className="rail__label">SHOWCASE / 16</p>
          <a href="/#overview"><span>01</span>운영 현황</a>
          <a href="/#gallery"><span>02</span>콘텐츠 탐색</a>
          <a href="/#cohorts"><span>03</span>수업 컬렉션</a>
          <div className="rail__foot"><i />283개 콘텐츠 보존</div>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
