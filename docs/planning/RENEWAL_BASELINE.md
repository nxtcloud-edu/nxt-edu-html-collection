# Phase 12 개편 기준선

측정일: 2026-08-22 KST

## 목적

Phase 13~19의 구조 개편과 재디자인이 기존 공개 URL, 콘텐츠 데이터, 관리자 핵심 기능을 깨뜨리지 않았는지 같은 기준으로 반복 검증한다. 이 단계에서는 운영 코드와 운영 데이터를 변경하지 않는다.

## 보존 계약

- 공개 앱: `https://showcase.nxtcloud.kr`
- 학생 HTML origin: `https://content.showcase.nxtcloud.kr`
- 콘텐츠 ID와 공유 URL: 기존 8자리 ID 및 `/view.html?id={contentId}` 유지
- 콘텐츠 객체: `contents/{contentId}/vN.html` 유지
- 레거시 호환: Phase 11의 별도 승인 전까지 fallback 포인터와 `games/*` 객체 유지
- 기능: 콘텐츠·코호트 조회, 신규 생성, 명시적 버전 추가, 피드백·추천, 관리자 인증·편집·ZIP export 유지
- 운영 데이터 쓰기, fallback 은퇴, S3 삭제는 이 개편의 자동 실행 범위가 아니다.

## 운영 스냅샷

읽기 전용 공개 API와 로그인된 관리자 화면을 대조했다.

| 항목 | 기준선 |
|---|---:|
| 콘텐츠 | 283개 |
| 미니게임 | 182개 |
| 웹페이지 | 101개 |
| 최신 버전 합계 | 396개 |
| 신규 저장 방식 | 283개 |
| 관리자 화면 표시 | 콘텐츠 283, 게임 182, 웹 101, 버전 396 |

2026-08-22 단일 요청 기준의 참고 응답값이다. 네트워크 상태에 따라 변하므로 회귀 실패 임계값으로 직접 사용하지 않는다.

| 경로 | 상태 | 응답 시간 | body 크기 |
|---|---:|---:|---:|
| `/` | 200 | 170ms | 14,798 bytes |
| `/upload.html` | 200 | 109ms | 11,676 bytes |
| `/admin.html` | 200 | 78ms | 35,606 bytes |
| `/api/health` | 200 | 79ms | 11 bytes |
| `/api/v2/cohorts` | 200 | 109ms | 3,342 bytes |
| `/api/v2/contents` | 200 | 231ms | 139,272 bytes |

## 자동 브라우저 기준선

`html-delivery/test/e2e`에서 고정 fixture와 API interception을 사용한다. 운영 데이터에는 쓰지 않는다.

- 데스크톱 Chromium과 Pixel 7 모바일 viewport
- 공개 갤러리: 유형 필터, 페이지 이동, 수업별 보기
- 업로드: 신규 생성과 기존 콘텐츠 새 버전 모드
- 콘텐츠 보기: 메타데이터, 격리 origin iframe, 피드백
- 관리자: 비로그인 화면, 로그인 후 현황·콘텐츠·ZIP 진입점
- 접근성: 공개 핵심 화면 WCAG 2 A/AA 검사 결과 중 `critical` 위반 0
- 실패 시 screenshot, trace, video 보존

실행:

```bash
cd html-delivery
npm install
npx playwright install chromium
npm run test:e2e
```

Terraform 배포 ZIP에는 `test/`가 제외된다. Playwright와 axe는 개발 의존성이므로 배포 전 기존 절차대로 `npm install --omit=dev`를 실행해야 한다.

## Phase 19 품질 게이트

- 단위·통합 테스트와 데스크톱·모바일 E2E 전부 통과
- 운영 공개 health, 홈, 코호트, 보기, 업로드, 관리자 읽기 동선 확인
- WCAG 2 A/AA `critical` 위반 0; `serious` 위반은 해결하거나 근거와 후속 계획 기록
- 핵심 페이지의 모바일 390px 가로 스크롤 없음
- 공개 API는 페이지네이션을 사용하고 홈 초기 로드에서 283개 전체를 내려받지 않음
- 운영 배포 후 콘텐츠 283개, 유형 182/101, 최신 버전 합계 396 및 기존 공유 URL 표본 유지
- Terraform 최종 plan `no changes`, Git clean 및 `main...origin/main` 동기화

Phase 19에서 위 기준을 실행 가능한 게이트로 고정했다.

- `npm run check:web-budget`: 현재 index가 참조하는 HTML·JS·CSS의 raw/gzip 크기를 검사한다.
- JS 예산 260,000/80,000 bytes(raw/gzip), CSS 40,000/8,000, HTML 2,048/1,024.
- 기준 측정: JS 237,622/71,668, CSS 32,169/6,368, HTML 679/453 bytes.
- 공개·업로드·보기·관리자 대시보드의 데스크톱·Pixel 7 시각 기준 8개를 저장했다.
- 공개 3화면과 관리자 5영역은 WCAG 2 A/AA `critical`·`serious` 위반 0과 문서 가로 오버플로 0을 요구한다.
- 운영 절차와 별도 승인 경계는 [운영 전환 체크리스트](./RELEASE_CHECKLIST.md)에 고정했다.

## 현재 발견된 개편 동인

- `server.js`에 라우팅·도메인 규칙·AWS 호출·응답 조립이 집중돼 있다.
- 각 HTML이 CSS와 스크립트를 자체 보유해 테마·상태·컴포넌트 일관성이 약하다.
- 홈과 관리자 화면이 283개 전체 목록을 한 번에 받아 클라이언트에서 처리한다.
- 관리자 화면은 이름 기반 레거시 API와 큰 단일 표에 의존한다.
- Cohort와 ContentVersion은 일부 계약만 있으며 AuditLog는 영속 도메인으로 존재하지 않는다.
- 관리자 비밀번호 재설정과 삭제가 브라우저 기본 prompt/confirm에 의존한다.
