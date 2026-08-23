# Current State

Updated: 2026-08-23 13:13 KST

## Active owners
- Codex: 사용자 지시에 따라 별도 Hermes 세션·워크오더 없이 현재 main 워크트리에서 직접 작업.
- Hermes: 이번 변경에 관여하지 않음.

## Last verified repo state
- Branch: `main`, 홈 3탭 기능 `8af17cc` 배포·origin/main push 완료.
- Worktree: 사용자 의도에 맞춘 홈 탭 순서·명칭·기본 화면 교정 구현 및 로컬 검증 완료, 배포 전.
- Tests: 웹 타입 검사, Vitest 2/2, 전체 `npm test` 120/120, Playwright 데스크톱·모바일 E2E 18/18. 공개·관리자 critical/serious 접근성 위반 0·가로 오버플로 0·시각 기준 8개 일치.
- Terraform: 콘텐츠 CloudFront 접근 로그용 비공개·AES256 S3 버킷, PAB 4종, 14일 TTL 생성. CloudFront 로그는 쿠키 제외로 배포 완료. 최종 리소스 삭제 0.
- Prod audit: 레거시 398개, 등록·복사본 해시 일치 396개, 활성 fallback 283개, 사용량 근거 대기 113개, 미등록 2개, 삭제 후보 0개.
- Log delivery: 관찰 시작 후 CloudFront gzip 로그 2개가 전용 S3 버킷에 도착했고 기존 파서가 14개 요청 레코드를 처리했다. 현재 레거시 요청 0건은 부분 표본이므로 은퇴 근거로 사용하지 않음.
- User verification: 사용자가 운영 환경에서 실제 코호트 ZIP 다운로드를 직접 검증했다고 확인.

## Completed
- 관리자 코호트별 최신 HTML ZIP 다운로드 구현·배포 완료.
- ZIP 내부 파일명: 순번·이름/팀명·제목·최신 버전. `manifest.csv`와 `manifest.json` 포함.
- 운영 ZIP은 동일 S3 버킷의 비공개 `exports/`에 저장하고 15분 서명 URL로 제공, 수명주기 1일.
- 개편 Phase 1 완료: v2 콘텐츠·코호트·버전 모델, API 호환 계약, S3 무삭제 마이그레이션 게이트와 전체 로드맵 문서화.
- 개편 Phase 2 완료: 콘텐츠 domain normalizer·legacy adapter·repository 경계 도입, 기존 API와 S3 키 불변.
- 개편 Phase 3 완료: 인증된 관리자 화면에서 코호트별 콘텐츠 수·게임/웹페이지·누적 버전·최신 수정·저장 키 방식·ZIP 준비 상태 확인 가능.
- 개편 Phase 4 완료: 코드 배포 후 코호트 9개·콘텐츠 283개 additive backfill 성공. 재 dry-run 갱신 대상 0, unresolved/conflict 0.
- 개편 Phase 5 완료: 신규 콘텐츠 `contents/*`, 레거시 버전 `games/*` 고정, 이중 키 조회·ZIP·삭제와 권한 정책 반영 및 운영 E2E 통과.
- 개편 Phase 6 완료: v2 공개 조회·항상 신규 생성·명시적 버전 추가 API와 학생·갤러리 UX 전환을 배포. 레거시 API·공유 URL 유지.
- 개편 Phase 7 완료: 등록된 기존 버전 396개를 새 키로 조건부 복사하고 재실행 전수 검증 통과. 원본과 읽기 포인터는 변경하지 않음.
- 개편 Phase 8 완료: 검증된 283개에 새 우선 포인터를 조건부 추가하고 레거시 fallback을 보존. 공개 API·ZIP·후속 버전 경로와 실제 브라우저 렌더링 검증.
- 개편 Phase 9 완료: 비동기 ZIP 작업 상태·최근 이력·조건부 재시도·30일 TTL·Lambda 오류 alarm 배포. 운영 46개 ZIP이 실패 보존 후 재시도되어 `attempt 2`, `completed`; 관리자 UI 다운로드 상태와 alarm `OK` 확인.
- 개편 Phase 10 완료: 학생 HTML을 전용 origin으로 격리하고 S3 직접 공개를 차단. `games/*` 398개와 `contents/*` 396개 보존 확인.
- 개편 Phase 11 관찰 진행 중: 삭제 차단형 dry-run 감사와 CloudFront 로그 수집기를 구현·배포. 2026-08-22 22:13 KST 관찰 시작, 객체·포인터 삭제/변경 없음.
- Phase 11 fallback 은퇴 준비 완료: 완전한 7일 사용량 근거·검증 복사본·정확한 이중 포인터·레거시 요청 0건을 모두 요구하는 조건부 도구를 배포. 운영 dry-run은 283개 모두 `awaitingUsageEvidence`, ready·conflict 0이며 apply는 실행하지 않음.
- Phase 12 완료: 운영 283개·게임 182·웹 101·최신 버전 합계 396을 문서화하고, 공개·업로드·보기·관리자 핵심 흐름을 데스크톱·모바일 12개 Playwright E2E와 axe critical 위반 0으로 고정. 운영 코드·데이터·인프라 변경 없음.
- Phase 13 완료: `server.js`를 composition root로 축소하고 public/admin routes, content/cohort services, content/feedback repositories, object-storage adapter를 분리. 외부 API·URL·S3/DynamoDB 계약 불변.
- Phase 13 배포 완료: Lambda 코드 1건 in-place, 0 add·0 destroy. 최종 Terraform plan no changes.
- Phase 13 운영 검증: health·코호트·콘텐츠·전용 콘텐츠 200, 코호트 15개, 콘텐츠 283개·게임 182·웹 101·버전 396. 로그인 관리자 화면의 283개 행과 ZIP 버튼 노출 확인.
- Phase 14 완료: React·TypeScript·Vite 앱 셸을 `/app/`에 독립 배포하고 NXT Cloud 디자인 토큰과 공통 Button·Surface·StatusBadge·MetricCard·AppShell을 도입. 기존 5개 화면 URL은 전환하지 않음.
- Phase 14 운영 검증: `/app/`·현재/직전 해시 JS·CSS·health 200, 지표 283·15·396, 가로 오버플로 0. 브라우저 시각 검토 후 한글 줄바꿈과 캐시된 이전 index의 해시 자산 호환을 보완.
- Phase 14 Terraform 최종 plan no changes. S3·DynamoDB 콘텐츠와 포인터 변경 없음.
- Phase 15 완료: ContentVersion·AuditLog repository, ID 기반 v2 관리자 콘텐츠 페이지네이션·필터·버전·코호트·감사·export API를 추가하고 기존 API를 유지.
- Phase 15 운영 backfill 완료: 콘텐츠 283개·예상 버전 396개를 조건부 생성. 재 dry-run ready 0·existing 396·conflict/failure 0. S3 객체·콘텐츠 포인터 변경 없음.
- Phase 15 배포 검증: Lambda 1건 in-place, 0 add·0 destroy, 최종 Terraform no changes. health 및 v2/레거시 콘텐츠 283개, 로그인 관리자 현황 283·182/101·396 유지.
- Phase 16 완료: `/`·`/index.html`·`/cohort.html`을 React 공개 갤러리로 전환. 실데이터 KPI·Donut·가로 막대, 10개 cursor pagination, 서버 분류·정렬·검색을 배포.
- Phase 16 운영 검증: 콘텐츠 283·게임 182·웹 101·코호트 15, 첫 페이지 10개·다음 페이지 11번 시작, 고대세종 AI 코호트 3개, 데스크톱 가로 오버플로 0. 최종 Terraform no changes.
- Phase 17 완료: `/upload.html`·`/view.html` React 전환. 생성/버전 추가 분리, teamOptions, 파일 검증, 격리 iframe, 추천·피드백·업데이트 dialog와 재시도 가능한 오류 상태 제공.
- Phase 17 운영 검증: 고대세종 코호트 사전 선택·두 업로드 탭, `0e040222` v5·전용 origin iframe 실제 렌더링·피드백·업데이트 dialog·가로 오버플로 0. 운영 쓰기 없음, 최종 Terraform no changes.
- Phase 18 완료: `/admin.html` React 전환, 대시보드·콘텐츠/버전/피드백·코호트·비동기 export·감사/시스템 화면과 명시적 작업 확인 UI를 배포.
- Phase 18 첫 배포 검증: 운영 283·웹 101·게임 182·버전 396·코호트 15, 콘텐츠 상세 버전 5개, export 완료 이력, 다섯 업무 영역과 가로 오버플로 0 확인. 첫 25개 이후 이동 UI 누락을 발견해 cursor 이전/다음 탐색을 추가하고 E2E로 보완함.
- Phase 19 구현·로컬 검증 완료: raw/gzip 웹 예산, 데스크톱·모바일 시각 기준 8개, 공개 3화면·관리자 5영역 접근성/오버플로 게이트, 운영 전환 체크리스트 추가. 운영 배포는 아직 남음.
- Phase 19 운영 검증 완료: 0 add·1 Lambda change·0 destroy 배포 후 health, 첫 10개+cursor, 283·182/101·396·15, 새 JS/CSS, 기존 공유 콘텐츠, 관리자 접근성 라벨, 공개/관리자 오버플로 0 확인. 운영 쓰기 없음.
- 홈 탭 초기안 배포: 기본 콘텐츠 탐색, 수업별 보기, 운영 현황으로 긴 홈을 분리하고 기존 hash 직접 진입·키보드 이동을 유지. 사용자 환류에 따라 아래 교정안을 적용 중.
- 홈 탭 의도 교정 로컬 완료: `대시보드`를 첫 탭·기본 화면으로 두고 `콘텐츠 둘러보기`, `수업별 모아보기` 순으로 재구성. 상단·좌측 탐색 명칭도 일치시키고 데스크톱·모바일 시각 기준을 갱신함.

## Next safe action
1. 홈 탭 의도 교정을 커밋·push하고 Lambda 코드만 재배포한 뒤 운영에서 기본 대시보드와 세 탭을 읽기 전용 검증한다.
2. 2026-08-30 22:13 KST 이후 7일 사용량 근거를 수집해 fallback dry-run을 재실행한다.
3. fallback 포인터 apply와 기존 `games/*` 삭제는 각각 별도 사용자 승인 전까지 실행하지 않는다.
3. Phase 11 관찰은 병행하되 2026-08-30 22:13 KST 전에는 fallback apply를 실행하지 않는다.
4. 기존 `games/*` 삭제는 포인터 은퇴 후에도 별도 승인 전까지 수행하지 않는다.
