import type { ReactNode } from 'react';

const galleryNavigation = [{ label: '운영 현황', href: '/#overview' }, { label: '콘텐츠 탐색', href: '/#gallery' }, { label: '수업 컬렉션', href: '/#cohorts' }];

export function AppShell({ children, railLabel = 'SHOWCASE / 16', navigation = galleryNavigation, foot = '283개 콘텐츠 보존' }: { children: ReactNode; railLabel?: string; navigation?: { label: string; href: string }[]; foot?: string }) {
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
          <p className="rail__label">{railLabel}</p>
          {navigation.map((item, index) => <a href={item.href} key={item.href}><span>0{index + 1}</span>{item.label}</a>)}
          <div className="rail__foot"><i />{foot}</div>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
