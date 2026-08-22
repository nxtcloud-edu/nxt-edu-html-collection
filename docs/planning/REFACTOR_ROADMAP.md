# 콘텐츠 플랫폼 개편 로드맵

## 원칙

- 각 단계는 독립적으로 테스트·배포·롤백 가능해야 한다.
- 데이터 변경과 코드 구조 변경을 같은 배포에 섞지 않는다.
- S3 기존 객체는 복사·검증 전환을 사용하며 별도 승인 없이 삭제하지 않는다.
- 레거시 API와 URL은 새 계약이 운영에서 검증될 때까지 유지한다.

## 순서

| Phase | 작업 | 운영 데이터 영향 | 완료 기준 |
|---|---|---|---|
| 0 | 코호트 ZIP 다운로드 | 비공개 export 객체 생성 | 배포·사용자 실검증 완료 |
| 1 | 데이터 모델·API 계약 | 없음 | `CONTENT_MODEL_V2.md` 확정 |
| 2 | 내부 domain/repository 분리 | 없음 | 기존 API·테스트 불변, v2 normalizer 테스트 |
| 3 | 관리자 코호트 상세·운영 가시성 | 읽기 중심 | 유형·버전·저장 키·다운로드 상태 확인 가능 |
| 4 | 코호트 ID additive backfill | DynamoDB 필드 추가 | dry-run 0 unresolved 후 재실행 가능 backfill |
| 5 | 신규 `contents/*` 쓰기 | 신규 객체만 영향 | 신규 생성·버전 추가·삭제·export 검증 |
| 6 | 학생·갤러리 v2 API 전환 | 없음 | 게임·웹페이지와 생성·버전 추가 UX 분리 |
| 7 | 기존 S3 객체 복사 마이그레이션 | 복사본 생성 | 전 객체 size·SHA-256·버전 수 일치 |
| 8 | 읽기 우선순위 전환 | 레지스트리 포인터 추가 | 새 키 우선 + 레거시 fallback 실검증 |
| 9 | 비동기 export·모니터링 | export 메타 추가 | 대량 export 상태·재시도·알람 |
| 10 | CloudFront OAC·S3 비공개 | 접근 경로 변경 | 커스텀 도메인 정상, 직접 S3 영향 확인 |
| 11 | 레거시 정리 | 승인된 대상만 | 사용량 0 확인과 별도 삭제 승인 |
| 12 | 개편 기준선 고정 | 없음 | 운영 스냅샷·데스크톱/모바일 E2E·접근성 기준선 |
| 13 | 백엔드 경계 재구성 | 없음 | routes/services/repositories/AWS adapters 분리, 외부 계약 불변 |
| 14 | React·TypeScript 프런트엔드 기반 | 없음 | Vite 앱·NXT Cloud 토큰·공통 컴포넌트·기존 URL shell |
| 15 | 데이터·관리자 API 완성 | additive metadata | Cohort·ContentVersion·AuditLog와 ID 기반 v2 관리자 API |
| 16 | 공개 갤러리 재디자인 | 없음 | 홈·탐색·코호트 UI, 서버 페이지네이션·필터 |
| 17 | 업로드·보기 재디자인 | 신규 버전 쓰기만 | 생성/업데이트 흐름·격리 viewer·오류 복구 UX |
| 18 | 관리자 재디자인 | 관리자 명시 작업만 | 대시보드·코호트·콘텐츠·export·피드백·시스템 화면 |
| 19 | 품질·전환 | 없음 | 접근성·모바일·시각 회귀·성능·운영 배포·무변경 plan |

## 현재 위치

- Phase 0 완료.
- Phase 1 완료: 데이터 모델·API·마이그레이션 계약 확정.
- Phase 2 완료: domain normalizer, legacy adapter, content repository 경계와 단위 테스트 도입. 기존 API·S3 키·운영 데이터 불변.
- Phase 3 완료: 인증된 관리자 코호트 현황 API와 UI에서 콘텐츠 유형·누적 버전·최신 저장 키·레거시/신규 저장 방식·ZIP 준비 상태를 읽기 전용으로 확인한다.
- Phase 4 완료: Lambda 배포와 조건부 additive backfill 후 코호트 15개·콘텐츠 283개가 모두 `cohortId`를 가진다. 재 dry-run은 갱신 대상·unresolved·conflict 모두 0이며 기존 `games/*` 키는 유지됐다.
- Phase 5 완료: 신규 `contents/*` 쓰기, 레거시 prefix 고정, 이중 키 조회·ZIP·삭제, S3/IAM 정책을 배포했다. 운영 테스트 콘텐츠의 v1·v2 생성, 최신 포인터, 관리자 목록, ZIP 포함, 삭제를 검증했고 기존 콘텐츠 283개로 원복했다.
- Phase 6 완료: v2 코호트·콘텐츠 조회, 항상 신규 생성, contentId 기반 명시적 버전 추가 API를 배포하고 갤러리·코호트·상세·업로드 화면을 전환했다. 운영 v2 콘텐츠 283개와 레거시 API 283개, 두 업로드 탭을 확인했다.
- Phase 7 완료: 등록 콘텐츠 283개의 레거시 버전 396개를 `contents/{contentId}/vN.html`로 덮어쓰기 없이 복사했다. 전수 size·SHA-256 검증과 재 dry-run에서 396/396 일치, pending·누락·충돌·실패 0건을 확인했다. 레지스트리에 연결되지 않은 무버전 객체 2개는 자동 추정하지 않고 원본에 보존했다.
- Phase 8 완료: 검증된 콘텐츠 283개에 `latestObjectKey=contents/*`를 조건부 추가하고 기존 `latestKey=games/*`를 fallback으로 보존했다. v2·레거시 API 283개가 새 URL을 반환하며 실제 iframe 렌더링과 재 dry-run을 확인했다.
- Phase 9 완료: ZIP 요청을 동일 Lambda의 비동기 작업으로 분리하고 작업 상태·최근 이력·조건부 재시도·30일 메타 TTL·Lambda 오류 alarm을 배포했다. 운영 최대 코호트 46개 작업이 실패 상태 보존 후 재시도되어 `attempt 2`, `completed`로 끝났고 관리자 화면의 완료·다운로드 상태와 CloudWatch alarm `OK`를 확인했다.
- Phase 10 완료: S3 Public Access Block 4종과 OAC 전용 정책을 적용하고 학생 HTML을 별도 CloudFront·도메인 `content.showcase.nxtcloud.kr`로 격리했다. API 283개 URL과 iframe 렌더링은 전용 도메인을 사용하며 직접 S3는 403, 앱 도메인의 `/contents/*`는 404다.
- Phase 11 관찰 진행 중: 읽기 전용 감사 결과 등록 객체 396개는 복사본 해시가 모두 일치하지만 최신 fallback 참조 283개, 사용량 근거 대기 113개, 미등록 2개로 삭제 후보는 0개다. 2026-08-22 22:13 KST부터 쿠키 제외 CloudFront 로그를 비공개 버킷에 수집하며 14일 뒤 자동 만료한다.
- fallback 은퇴 도구는 조건부 갱신·이중 확인 문자열·사용량 보고서 필수 계약으로 배포했다. 운영 dry-run은 283개 모두 `awaitingUsageEvidence`, ready·conflict 0이며 포인터 갱신은 실행하지 않았다.
- 최소 7일 관찰과 24시간 로그 전달 대기를 마친 2026-08-30 22:13 KST 이후 사용량 근거를 생성한다. `games/*` 객체 삭제는 후보 재산정과 별도 승인 전까지 수행하지 않는다.
- Phase 12 완료: [개편 기준선](./RENEWAL_BASELINE.md)에 운영 283개·유형 182/101·버전 합계 396을 고정하고, 데스크톱·모바일 12개 Playwright E2E와 critical 접근성 위반 0 기준을 추가했다. 운영 코드·데이터 변경과 배포는 없다.
- Phase 13 완료: `server.js`를 composition root로 축소하고 public/admin routes, content/cohort services, content/feedback repositories, object-storage adapter로 경계를 분리했다. 외부 API·URL·데이터 계약은 유지했으며 단위·통합 108/108, 데스크톱·모바일 E2E 12/12, 운영 관리자 283개·게임 182·웹 101·버전 396을 확인했다.
- Phase 14 완료: React·TypeScript·Vite 앱을 `/app/`에 독립 배포하고 NXT Cloud 토큰, Button·Surface·StatusBadge·MetricCard·AppShell 공통 컴포넌트와 기존 URL 전환 지도를 추가했다. 기존 화면은 유지했으며 타입 검사, Vitest 2/2, 전체 108/108, 데스크톱·모바일 E2E 14/14, critical 접근성 위반 0을 확인했다.
- Phase 15 완료: ContentVersion·AuditLog repository와 ID 기반 v2 관리자 콘텐츠·코호트·버전·감사·export API를 배포했다. 기존 283개 콘텐츠의 396개 버전 메타를 S3 크기·SHA-256 검증 후 조건부 backfill했고 재 dry-run은 existing 396·충돌/실패 0이다. 기존 객체·포인터·공유 URL은 유지했다.
- Phase 16 완료: `/`·`/index.html`·`/cohort.html`을 React 공개 갤러리로 전환하고 실제 KPI·Donut·코호트 가로 막대, 서버 검색·정렬·필터·10개 cursor pagination을 배포했다. 운영 283개·게임 182·웹 101·코호트 15개와 코호트 표본 3개를 브라우저에서 확인했다.
- Phase 17 완료: `/upload.html`·`/view.html`을 React로 전환하고 신규 생성/ID 기반 버전 추가, 별도 origin iframe, 추천·피드백·파일 업데이트와 오류 복구 UI를 배포했다. 운영 쓰기 없이 기존 `0e040222` v5 표본의 iframe·dialog·피드백 영역을 확인했다.
- Phase 18 구현 완료: `/admin.html`을 대시보드·콘텐츠·코호트·내보내기·감사/시스템 React 화면으로 전환했다. 콘텐츠 상세에서 버전·피드백을 함께 검토하고 삭제는 contentId 재입력, 나머지 관리자 쓰기는 별도 명시 버튼을 요구한다. 서버 118/118, 웹 2/2, 데스크톱·모바일 E2E 14/14와 관리자 critical 접근성 위반 0을 확인했으며 운영 배포 검증은 아직 남아 있다.
- Phase 15~19는 Phase 11의 관찰·삭제 승인 절차와 독립적으로 진행한다. 각 phase는 테스트·문서·커밋·push를 독립적으로 끝내며 런타임 변경이 있을 때만 Terraform 배포한다.
