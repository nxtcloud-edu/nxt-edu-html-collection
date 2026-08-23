# 프런트엔드 아키텍처

## 목적

Phase 14는 React·TypeScript·Vite 기반을 `/app/`에서 먼저 검증했다. Phase 16~18에서 공개·업로드·보기·관리자 URL을 순차 전환했으며 기존 데이터 계약과 정적 HTML 롤백 자산은 유지한다.

## 구조

```text
frontend/
├── index.html
├── vite.config.ts
├── vitest.config.ts
└── src/
    ├── components/       공통 동작·표면·상태·지표
    ├── styles/           디자인 토큰과 전역 레이아웃
    ├── pages/            업로드·보기·관리자 화면
    ├── admin-api.ts      인증된 관리자 API client
    ├── App.tsx           URL별 React 화면 진입점
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

| 현재 URL | 대상 phase | 현재 상태 |
|---|---:|---|
| `/` | 16 | React 갤러리 전환 완료 |
| `/cohort.html` | 16 | React 코호트 화면 전환 완료 |
| `/upload.html` | 17 | React 업로드 화면 전환 완료 |
| `/view.html` | 17 | React 격리 viewer 전환 완료 |
| `/admin.html` | 18 | React 관리자 화면 전환 완료 |
| `/app/` | 14 | 새 기반·전환 지도 제공 |

기존 콘텐츠 ID, `/view.html?id={contentId}`, `contents/{contentId}/vN.html`, 비동기 ZIP과 `content.showcase.nxtcloud.kr` origin은 프런트엔드 전환으로 변경하지 않는다.

## Phase 16 공개 탐색

- Express는 `/`, CloudFront default root가 전달하는 `/index.html`, `/cohort.html`에서 `public/app/index.html`을 제공한다. 기존 정적 HTML 파일은 롤백 자산으로 보존한다.
- 새 UI는 `/api/v2/contents?pageSize=10` cursor pagination을 사용하며 분류·정렬·검색·코호트 조건을 서버에 전달한다.
- 파라미터 없는 기존 `/api/v2/contents` 전체 응답은 호환을 위해 유지한다.
- `/api/v2/cohorts`는 `contentCount`, `gameCount`, `webpageCount`를 additive하게 제공한다.
- KPI, 콘텐츠 유형 Donut, 코호트 가로 막대는 실제 API 집계를 표시하며 색상만으로 값을 구분하지 않는다.
- 홈은 콘텐츠 목록·수업 목록·운영 지표를 각각 `콘텐츠 탐색`, `수업별 보기`, `운영 현황` 탭으로 분리한다. 기본 탭은 콘텐츠 탐색이며 기존 `#gallery`, `#cohorts`, `#overview` 해시는 직접 진입과 상단·좌측 탐색 계약으로 유지한다.
- 탭은 WAI-ARIA tablist/tab/tabpanel 관계와 좌우·Home·End 키보드 이동을 제공한다. 비활성 패널은 화면과 접근성 트리에서 숨겨 첫 화면의 세로 길이를 제한한다.
- 기존 `public/index.html`, `public/cohort.html`은 롤백 자산으로 유지한다.

## Phase 17 업로드·보기

- `/upload.html`은 새 콘텐츠 생성과 contentId 기반 버전 추가를 별도 tab·form으로 유지한다.
- 소속에 따라 개인 이름 또는 서버가 제공한 팀 선택지를 표시하며 `.html`·1MB 제한을 브라우저와 서버 양쪽에서 검증한다.
- `/view.html?id={contentId}`는 기존 공유 URL을 유지하고 학생 HTML을 `content.showcase.nxtcloud.kr` iframe에서 실행한다.
- 추천·피드백·파일 업데이트는 기존 API와 localStorage 중복 추천 가드를 유지한다. 각 실패는 현재 입력과 화면을 보존한 채 다시 시도할 수 있다.
- 기존 `public/upload.html`, `public/view.html` 파일은 rollback 자산으로 남고 Express 라우트만 React 셸을 우선 제공한다.
- Phase 17 운영 검증은 읽기 전용으로 수행하며 실제 콘텐츠·버전·피드백·추천을 만들지 않는다.

## Phase 18 관리자

- `/admin.html`은 동일 React 셸을 사용하되 응답에 `X-Robots-Tag: noindex, nofollow`를 설정한다. 기존 `public/admin.html`은 롤백 자산으로 보존한다.
- 정보 구조는 대시보드·콘텐츠·코호트·내보내기·감사/시스템 다섯 영역으로 나눈다.
- 콘텐츠 목록은 v2 관리자 페이지네이션·코호트·유형·검색 계약을 사용한다. 상세 패널에서 메타데이터, ContentVersion 객체 키·크기, 피드백을 한 흐름으로 검토한다.
- 콘텐츠 삭제는 해당 contentId를 다시 입력해야 활성화된다. 콘텐츠 비밀번호 변경, 피드백 삭제, ZIP 생성, 코호트·관리자 변경은 모두 별도 명시 버튼으로만 실행한다.
- ZIP은 `cohortId` 기반 비동기 작업을 만들며 최근 작업의 대기·실행·완료·실패·재시도 상태를 표시한다.
- 운영 배포 검증은 기존 로그인 세션으로 조회 화면과 상세 패널만 확인하고 콘텐츠·피드백·코호트·계정·ZIP 쓰기는 실행하지 않는다.

## 검증

```bash
cd html-delivery
npm run typecheck:web
npm run test:web
npm run build:web
npm run check:web-budget
npm test
npm run test:e2e
```

Vitest는 공통 셸의 기존 URL 연결과 기준선 표기를 확인한다. Playwright는 공개·업로드·보기·관리자 화면을 데스크톱·모바일에서 열어 핵심 흐름, 390px 가로 오버플로, WCAG 2 A/AA critical·serious 위반과 8개 시각 스냅샷을 검사한다. 관리자 테스트는 고정 mock 세션과 API 응답을 사용하며 운영 자격정보를 포함하지 않는다. 웹 예산 검사는 `public/app/index.html`이 현재 참조하는 해시 자산만 측정해 롤백용 이전 자산 누적과 분리한다.
