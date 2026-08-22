# 프런트엔드 아키텍처

## 목적

Phase 14는 기존 정적 HTML을 한 번에 교체하지 않는다. React·TypeScript·Vite 빌드와 NXT Cloud 디자인 시스템을 `/app/`에서 먼저 검증하고, Phase 16~18에서 기존 URL별 화면을 순차 전환한다.

## 구조

```text
frontend/
├── index.html
├── vite.config.ts
├── vitest.config.ts
└── src/
    ├── components/       공통 동작·표면·상태·지표
    ├── styles/           디자인 토큰과 전역 레이아웃
    ├── App.tsx           전환 지도와 기반 확인 화면
    └── main.tsx          React 진입점

public/app/               Vite 배포 산출물
```

`frontend/` 소스는 Lambda ZIP에서 제외하고 브라우저가 필요한 `public/app/` 빌드 산출물만 포함한다. Terraform 실행 전에 `npm run build:web`을 실행하며, 커밋된 산출물과 같은 입력에서 재현되는지 확인한다.

Vite는 배포 사이에 직전 해시 자산을 자동 삭제하지 않는다. 브라우저가 이전 `index.html`을 잠시 캐시해도 해당 CSS·JS를 계속 받을 수 있게 하기 위함이다. 누적 자산 정리는 캐시 사용량과 롤백 범위를 확인한 뒤 별도 작업으로 수행한다.

## 디자인 원칙

- NXT Cloud의 밝은 모눈 바탕, 강한 흑백 대비와 파란 포인트를 기본값으로 사용한다.
- `--nxt-*` CSS custom property가 색상·간격·반경·타이포그래피의 단일 토큰 경계다.
- 데이터 표현은 장식보다 값·단위·기준 시점을 먼저 보여준다. Phase 14의 막대는 실제 추세가 아니라 컴포넌트 시각 샘플이며 숫자는 “Phase 12 기준선”으로 표시한다.
- 상태는 색상만으로 표현하지 않고 텍스트를 함께 제공한다.
- 모바일 390px에서 가로 스크롤이 없어야 하며 `prefers-reduced-motion`을 존중한다.

## URL 전환 계약

| 현재 URL | 대상 phase | Phase 14 상태 |
|---|---:|---|
| `/` | 16 | 기존 갤러리 유지 |
| `/cohort.html` | 16 | 기존 코호트 화면 유지 |
| `/upload.html` | 17 | 기존 업로드 화면 유지 |
| `/view.html` | 17 | 기존 격리 viewer 유지 |
| `/admin.html` | 18 | 기존 관리자 화면 유지 |
| `/app/` | 14 | 새 기반·전환 지도 제공 |

기존 콘텐츠 ID, `/view.html?id={contentId}`, `contents/{contentId}/vN.html`, 비동기 ZIP과 `content.showcase.nxtcloud.kr` origin은 프런트엔드 전환으로 변경하지 않는다.

## 검증

```bash
cd html-delivery
npm run typecheck:web
npm run test:web
npm run build:web
npm test
npm run test:e2e
```

Vitest는 공통 셸의 기존 URL 연결과 기준선 표기를 확인한다. Playwright는 `/app/`을 데스크톱·모바일에서 열어 링크, 390px 가로 오버플로, WCAG 2 A/AA critical 위반을 검사한다.
