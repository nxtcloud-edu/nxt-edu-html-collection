# HTML 게임 배포 운영 프로그램

수강생이 소속·이름과 HTML 파일을 제출하면 업로드된 콘텐츠의 접속 URL을 발급하는 Express 앱입니다. 로컬에서는 Node.js 서버로, 운영에서는 Lambda Function URL로 같은 `createApp()`을 실행합니다.

## 백엔드 구조

`server.js`는 단일 Lambda의 composition root입니다. HTTP는 `routes/`, use case는 `services/`, 영속 계약은 `repositories/`, S3 같은 외부 저장 구현은 `adapters/`, 순수 규칙은 `domain/`에 둡니다. 배포 단위와 AWS 리소스는 늘리지 않습니다. 자세한 의존 방향과 호환 경계는 [`docs/planning/BACKEND_ARCHITECTURE.md`](../docs/planning/BACKEND_ARCHITECTURE.md)를 참고합니다.

## 프런트엔드 구조

`frontend/`는 React·TypeScript·Vite 기반 UI 소스입니다. Phase 16~18에서 `/`, `/cohort.html`, `/upload.html`, `/view.html`, `/admin.html`을 React로 전환했습니다. 디자인 토큰과 공통 컴포넌트는 `frontend/src/`에 두고, 배포 파일은 `public/app/`으로 빌드합니다. 기존 정적 HTML은 단계별 롤백 자산으로 보존합니다. 자세한 전환·빌드 계약은 [`docs/planning/FRONTEND_ARCHITECTURE.md`](../docs/planning/FRONTEND_ARCHITECTURE.md)를 참고합니다.

Phase 16 운영 배포는 2026-08-23 완료했습니다. 첫 목록 요청은 10개와 cursor만 반환하고, 코호트 집계는 콘텐츠 283개·게임 182개·웹페이지 101개·운영 코호트 15개입니다. 파라미터 없는 v2 전체 목록과 기존 정적 HTML은 호환·롤백 경계로 보존합니다.

Phase 17도 2026-08-23 운영 배포했습니다. 업로드는 신규 생성과 contentId 기반 버전 추가를 분리하고, 보기 화면은 기존 `/view.html?id=...`와 별도 학생 HTML origin, 추천·피드백·파일 업데이트 계약을 유지합니다. 배포 검증에서는 운영 콘텐츠·버전·추천·피드백 쓰기를 실행하지 않았습니다.

Phase 18 관리자 화면도 2026-08-23 운영 배포했습니다. 대시보드·콘텐츠·코호트·내보내기·감사/시스템으로 구성하며, 콘텐츠 상세에서 버전·피드백을 함께 검토합니다. 목록은 25개 cursor 이전/다음 탐색을 제공합니다. 사용자 생성 코호트는 목록의 `수정` 버튼으로 이름을 바꾸고 `보관`/`활성화` 버튼으로 상태를 관리합니다. 삭제는 contentId 재입력, 비밀번호·ZIP·코호트·계정 변경은 각각 명시적 버튼을 요구합니다. 관리자 E2E fixture에는 운영 자격정보를 사용하지 않습니다.

Phase 19 품질 게이트도 2026-08-23 완료했습니다. 현재 해시 자산 raw/gzip 예산, 데스크톱·모바일 시각 기준 8개, 공개 3화면·관리자 5영역 critical/serious 접근성 0과 가로 오버플로 0을 자동 검사합니다. 운영 전환 절차는 [`RELEASE_CHECKLIST.md`](../docs/planning/RELEASE_CHECKLIST.md)를 따릅니다.

홈은 한 화면의 세로 길이를 줄이기 위해 `대시보드`·`콘텐츠 둘러보기`·`수업별 모아보기` 세 탭으로 나눕니다. 첫 진입은 대시보드이며 기존 `/#overview`, `/#gallery`, `/#cohorts` 주소는 해당 탭을 직접 엽니다. 키보드 좌우·Home·End 이동과 데스크톱·모바일 시각·접근성 회귀 검사를 유지합니다.

공개 홈과 코호트 화면의 푸터에는 낮은 강조도의 `관리자` 링크를 제공하며 `/admin.html` 로그인 화면으로 연결합니다. 확장자 없는 `/admin`은 지원하지 않습니다.

```bash
npm run typecheck:web
npm run test:web
npm run build:web
npm run check:web-budget
```

## 로컬 DRY_RUN 운영

`S3_BUCKET`을 비워 두면 클라우드 호출 없이 `.local-deploy/`에 파일을 저장하고 앱이 직접 정적 서빙합니다.

```bash
cd html-delivery
npm install
cp .env.example .env
npm start
```

브라우저에서 `http://localhost:3210`을 열고 소속, 이름, `.html` 파일을 제출합니다. 성공하면 발급된 URL로 업로드 파일을 그대로 열 수 있습니다. 로컬 업로드 기록은 `uploads.log.jsonl`에 JSONL로 추가됩니다.

## Lambda 및 S3 운영

`lambda.js`가 `serverless-http`로 기존 `createApp()`을 감싸 Lambda handler를 제공합니다. Terraform은 인증 없는 HTTPS Function URL을 업로드 창구로 만들고, S3 버킷·웹사이트 설정·퍼블릭 읽기 정책을 함께 관리합니다. 적용 절차는 `infra/README.md`를 따릅니다.

S3 모드의 발급 URL은 `${BASE_URL}/${key}`이고, DRY_RUN에서는 `${BASE_URL}/deployed/${key}`를 사용합니다. 신규 콘텐츠는 `contents/{contentId}/v{version}.html`, 기존 레거시 콘텐츠의 새 버전은 기존 `games/{contentId}-v{version}.html` prefix를 유지합니다. Lambda 배포 파일시스템은 휘발성·읽기 전용이므로 S3 모드의 `uploads.log.jsonl` 기록 실패는 업로드 성공을 막지 않고 콘솔 경고만 남깁니다.

관리자는 `/admin`에서 코호트를 선택해 최신 버전 HTML ZIP 생성을 요청할 수 있습니다. 요청은 작업 메타데이터를 먼저 저장하고 별도 Lambda 실행으로 처리되며, 관리자 화면에서 대기·생성 중·완료·실패 상태와 시도 횟수, 실패 작업 재시도를 확인합니다. ZIP에는 `순번_이름(또는 팀명)_제목_v버전.html` 파일과 원본 S3 키·콘텐츠 ID·조회 URL을 연결하는 `manifest.csv`, `manifest.json`이 포함됩니다. 운영 ZIP은 같은 버킷의 비공개 `exports/` 경로에 만들고 15분 유효한 서명 URL로 전달하며, 수명 주기로 1일 뒤 삭제합니다. 작업 이력은 30일 TTL을 사용하고 ZIP 보관 만료 뒤에는 다운로드 버튼을 제공하지 않습니다. ZIP과 삭제 기능은 `games/*`와 `contents/*`를 모두 지원하며 기존 객체를 자동 이동하지 않습니다.

S3 객체에는 `contentid`, URL 인코딩된 `title`, `version` Metadata와 `text/html; charset=utf-8` Content-Type이 설정됩니다. 코호트·소유자·제목의 기준 데이터는 DynamoDB 콘텐츠 레코드에 저장합니다.

## API

- `GET /api/health` → `{ "ok": true }`
- `GET /api/v2/cohorts` → 불변 `cohortId`, 제출 방식, 콘텐츠·게임·웹페이지 집계를 포함한 코호트 목록
- `GET /api/v2/contents` → `cohortId`, `type`, `sort`, `query`, `pageSize`, 불투명 `cursor`를 지원하는 정규화 콘텐츠 목록
- `GET /api/v2/contents/:contentId` → 비공개 저장 필드를 제외한 콘텐츠 상세
- `GET /api/v2/contents/:contentId/versions` → 객체 키·해시를 제외한 공개 버전 번호 목록
- `POST /api/v2/contents` → 항상 새 콘텐츠 생성
- `POST /api/v2/contents/:contentId/versions` → 소유 비밀번호 확인 후 지정 콘텐츠에 새 버전 추가
- `GET /api/v2/admin/contents` → `pageSize`, `cursor`, `cohortId`, `type`, `query` 기반 관리자 목록
- `GET /api/v2/admin/contents/:contentId/versions` → 객체 키·크기·SHA-256을 포함한 버전 메타데이터
- `PATCH /api/v2/admin/contents/:contentId` → ID 기반 콘텐츠 메타데이터 수정
- `GET|POST /api/v2/admin/cohorts`, `PATCH /api/v2/admin/cohorts/:cohortId` → 코호트 조회·생성·이름 수정·보관
- `GET /api/v2/admin/audit-logs` → 민감정보를 제외한 최신순 관리자 변경 기록
- `POST /api/v2/admin/exports` → `cohortId` 기준 비동기 ZIP 생성
- `POST /api/upload` multipart 필드 `affiliation`, `category`, `name`, `title`, `password`, `file` → `201 { url, directUrl, contentId, title, version, uploadedAt }`
- `GET /api/admin/cohort-overview?cohort={코호트명}` → 콘텐츠 수·유형·누적 버전·저장 키 방식·ZIP 준비 상태 (관리자 인증 필요, `cohort` 생략 시 전체)
- `GET /api/admin/exports?limit=20` → 최근 비동기 ZIP 작업 상태 (관리자 인증 필요)
- `POST /api/admin/exports` JSON 필드 `cohort` → `202`와 대기 상태의 ZIP 작업 생성 (관리자 인증 필요)
- `GET /api/admin/exports/:exportId` → 단일 작업 상태, 완료 시 새 서명 다운로드 URL (관리자 인증 필요)
- `POST /api/admin/exports/:exportId/retry` → 실패 작업을 조건부 재시도 (관리자 인증 필요)
- `GET /api/admin/exports/:exportId/download` → 로컬 모드에서 생성한 ZIP 다운로드 (관리자 인증 필요)
- 파일은 `.html`만 허용하며 최대 1MB, 소속·이름은 trim 후 각각 1~40자입니다.

학생 업로드 화면은 “새 콘텐츠 만들기”와 “기존 콘텐츠 새 버전”을 분리합니다. 새 콘텐츠는 같은 이름·제목이 있어도 새 ID로 생성하며, 버전 추가는 콘텐츠 ID와 소유 비밀번호를 명시해야 합니다. 기존 `/api/games`, `/api/content`, `/api/upload`는 호환 경로로 유지합니다.

운영 콘텐츠 URL은 `https://content.showcase.nxtcloud.kr/{objectKey}`입니다. 학생 HTML은 앱·관리자 세션의 `showcase.nxtcloud.kr`과 다른 origin에서 실행되며, S3 직접 URL은 공개되지 않습니다. `games/*` 원본과 `contents/*` 복사본은 그대로 보존합니다.

## 테스트

```bash
npm test
npm run typecheck:web
npm run test:web
npm run build:web
npm run test:e2e
```

## cohortId backfill

기본 실행은 읽기 전용 dry-run입니다. 대상·충돌·미해결 건수만 확인하려면 다음처럼 실행합니다.

```bash
FEEDBACK_TABLE=<테이블명> S3_REGION=ap-northeast-2 npm run backfill:cohort-ids -- --summary-only
```

`unresolved: 0`, `conflicts: 0`을 확인한 뒤에만 additive 갱신을 실행합니다. apply는 확인 문자열이 없으면 거부되며 기존 `affiliation`이나 `cohortId`가 dry-run 이후 바뀐 레코드를 덮어쓰지 않습니다.

```bash
FEEDBACK_TABLE=<테이블명> S3_REGION=ap-northeast-2 npm run backfill:cohort-ids -- --apply --confirm=BACKFILL_COHORT_IDS --summary-only
```

운영 테이블은 2026-08-21 backfill을 완료했습니다. 코호트 15개와 콘텐츠 283개가 모두 ID를 가지며 재 dry-run 결과 `contentsToUpdate: 0`, `unresolved: 0`, `conflicts: 0`입니다.

## ContentVersion backfill

기본 실행은 S3 객체와 DynamoDB를 읽기만 하는 dry-run입니다. 기존 `contents/{contentId}/vN.html`의 크기와 SHA-256을 계산해 메타데이터 생성 대상·기존 일치·충돌·실패를 분류합니다.

```bash
S3_BUCKET=<버킷명> FEEDBACK_TABLE=<테이블명> S3_REGION=ap-northeast-2 npm run backfill:content-versions -- --summary-only
```

`conflicts: 0`, `failures: 0`인 경우에만 additive 쓰기를 실행합니다. 기존 S3 객체·콘텐츠 포인터는 변경하지 않으며 버전 레코드는 조건부 생성합니다.

```bash
S3_BUCKET=<버킷명> FEEDBACK_TABLE=<테이블명> S3_REGION=ap-northeast-2 npm run backfill:content-versions -- --apply --confirm=BACKFILL_CONTENT_VERSIONS --summary-only
```

레거시 데이터에서 원래 파일명은 알 수 없으므로 `originalFileName`은 `null`입니다. 생성·최신 버전 외에 근거가 없는 중간 버전의 `uploadedAt`도 추정하지 않고 `null`로 둡니다.

운영 테이블은 2026-08-22 backfill을 완료했습니다. 콘텐츠 283개의 버전 396개를 조건부 생성했고, 재 dry-run은 `ready: 0`, `existing: 396`, `conflicts: 0`, `failures: 0`입니다. S3 객체와 콘텐츠의 최신·fallback 포인터는 변경하지 않았습니다.

Phase 5 신규 저장 경로는 2026-08-21 운영에 배포했습니다. 기존 콘텐츠 283개의 `games/*` 키는 변경하지 않았고, 신규 콘텐츠부터 `contents/{contentId}/v1.html`을 사용합니다. 테스트 콘텐츠로 v1·v2 생성, 최신 포인터, 관리자 목록, ZIP 포함, 삭제까지 검증했으며 삭제 후 기존 283개 상태로 원복했습니다. 기존 S3 객체 복사·이동·삭제는 수행하지 않았습니다.

Phase 6 v2 API와 학생·갤러리 화면도 2026-08-21 운영에 배포했습니다. 운영 v2 목록 283개와 레거시 목록 283개가 일치하며, 새 업로드 화면은 자동 identity 병합 없이 생성과 버전 추가를 분리합니다.

## 레거시 콘텐츠 객체 복사

기본 실행은 S3를 변경하지 않는 dry-run입니다. 레지스트리의 기대 버전 수와 `games/*` 원본을 대조하고, 각 원본과 기존 `contents/*` 목적지의 size·SHA-256을 계산합니다.

```bash
S3_BUCKET=<버킷명> FEEDBACK_TABLE=<테이블명> S3_REGION=ap-northeast-2 npm run migrate:content-objects -- --summary-only
```

`blocked: 0`, `conflicts: 0`을 확인한 뒤에만 복사합니다. apply는 확인 문자열이 필요하고, 목적지는 조건부 생성해 기존 객체를 덮어쓰지 않습니다.

```bash
S3_BUCKET=<버킷명> FEEDBACK_TABLE=<테이블명> S3_REGION=ap-northeast-2 npm run migrate:content-objects -- --apply --confirm=COPY_LEGACY_CONTENTS --summary-only
```

2026-08-21 운영에서 등록 콘텐츠 283개의 396개 버전을 복사했고 재 dry-run 결과 `verifiedCopies: 396`, `pendingCopies: 0`, `blocked: 0`, `conflicts: 0`입니다. 레지스트리에 연결되지 않은 과거 무버전 객체 2개는 복사하지 않았고 원본 `games/*` 전체는 삭제·변경하지 않았습니다. 최신 포인터 전환은 Phase 8의 별도 작업입니다.

## 콘텐츠 읽기 포인터 전환

기본 실행은 S3 복사본의 size·SHA-256을 다시 검증하고 포인터 변경 대상을 계산하는 dry-run입니다.

```bash
S3_BUCKET=<버킷명> FEEDBACK_TABLE=<테이블명> S3_REGION=ap-northeast-2 npm run migrate:content-read-pointers -- --summary-only
```

`blocked: 0`, `conflicts: 0`인 경우에만 조건부 additive 갱신을 실행합니다. 기존 `latestKey`는 덮어쓰지 않습니다.

```bash
S3_BUCKET=<버킷명> FEEDBACK_TABLE=<테이블명> S3_REGION=ap-northeast-2 npm run migrate:content-read-pointers -- --apply --confirm=SWITCH_CONTENT_READ_POINTERS --summary-only
```

2026-08-21 운영에서 283/283개 포인터 전환에 성공했습니다. 재 dry-run은 `switched: 283`, `ready: 0`, `blocked: 0`, `conflicts: 0`이며 기존 `games/*` fallback 283개와 새 `contents/*` 우선 포인터 283개를 함께 보존합니다.

## 레거시 정리 감사

정리 감사는 항상 읽기 전용이며 `--apply`와 확인 문자열을 거부합니다. 복사본 해시, 레지스트리 참조와 사용량 근거가 하나라도 부족하면 삭제 후보로 분류하지 않습니다.

```bash
S3_BUCKET=nxt-ai-literacy-games FEEDBACK_TABLE=nxt-edu-feedback S3_REGION=ap-northeast-2 npm run audit:legacy-cleanup -- --summary-only
```

2026-08-22 운영 결과는 레거시 398개, 등록·복사본 검증 396개, 활성 fallback 283개, 사용량 근거 대기 113개, 미등록 2개, 삭제 후보 0개입니다.

CloudFront 로그 관찰 시작은 `2026-08-22T13:13:00.629Z`입니다. 아래 첫 7일 구간은 24시간 로그 전달 대기까지 끝나는 `2026-08-30T13:13:00.629Z` 이후에만 수집기가 허용합니다.

```bash
CONTENT_LOG_BUCKET=nxt-ai-literacy-content-access-logs S3_REGION=ap-northeast-2 npm run collect:legacy-usage -- --from=2026-08-22T13:13:00.629Z --to=2026-08-29T13:13:00.629Z --logging-start=2026-08-22T13:13:00.629Z --report=/tmp/legacy-usage.json
S3_BUCKET=nxt-ai-literacy-games FEEDBACK_TABLE=nxt-edu-feedback S3_REGION=ap-northeast-2 npm run audit:legacy-cleanup -- --usage-report=/tmp/legacy-usage.json --report=/tmp/legacy-cleanup.json
```

사용량 0 근거가 생겨도 fallback 포인터 은퇴와 객체 삭제는 각각 조건부 계획·별도 승인을 거쳐야 합니다.

fallback 포인터 은퇴 도구도 기본값은 dry-run입니다. 복사본 전수 검증, 현재 레거시·v2 포인터의 정확한 일치, 완전한 7일 사용량 근거, 해당 콘텐츠의 `games/{contentId}-v*` 요청 0건을 모두 만족해야 `ready`가 됩니다.

```bash
S3_BUCKET=nxt-ai-literacy-games FEEDBACK_TABLE=nxt-edu-feedback S3_REGION=ap-northeast-2 npm run migrate:retire-legacy-fallbacks -- --usage-report=/tmp/legacy-usage.json --summary-only --report=/tmp/fallback-retirement.json
```

실제 갱신은 별도 승인 후에만 아래 두 안전장치를 함께 제공해야 합니다. 조건부 갱신은 현재 `latestKey=games/*`와 `latestObjectKey=contents/*`가 계획과 정확히 일치할 때만 `latestKey`를 v2 키로 바꾸고 `latestObjectKey`를 제거합니다. S3 객체는 변경하거나 삭제하지 않습니다.

```bash
S3_BUCKET=nxt-ai-literacy-games FEEDBACK_TABLE=nxt-edu-feedback S3_REGION=ap-northeast-2 npm run migrate:retire-legacy-fallbacks -- --apply --confirm=RETIRE_LEGACY_FALLBACKS --usage-report=/tmp/legacy-usage.json --report=/tmp/fallback-retirement-applied.json
```

2026-08-22 배포 직후 운영 dry-run은 콘텐츠 283개 모두 `awaitingUsageEvidence`, `ready: 0`, `conflicts: 0`으로 차단했습니다. `--apply`는 실행하지 않았습니다.

`npm test`는 실 S3 호출, Lambda 배포, 버킷 생성이나 AWS CLI 실행을 수행하지 않습니다.
