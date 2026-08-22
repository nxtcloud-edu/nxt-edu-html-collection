import type { ReactNode } from 'react';
import { Button } from './Button';

const navigation = [
  { label: '개요', href: '#overview' },
  { label: '화면 전환 지도', href: '#routes' },
  { label: '디자인 시스템', href: '#system' },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="NXT Cloud Showcase 홈">
          <img src="/assets/nxtcloud-logo.png?v=2" alt="" />
          <span>NXT CLOUD</span><b>SHOWCASE</b>
        </a>
        <nav aria-label="현재 서비스 바로가기">
          <Button href="/upload.html" variant="quiet">업로드</Button>
          <Button href="/admin.html" variant="primary">관리자</Button>
        </nav>
      </header>
      <div className="shell-grid">
        <aside className="rail" aria-label="앱 셸 탐색">
          <p className="rail__label">FOUNDATION / 14</p>
          {navigation.map((item, index) => <a href={item.href} key={item.href}><span>0{index + 1}</span>{item.label}</a>)}
          <div className="rail__foot"><i />기존 운영 URL 유지</div>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}
