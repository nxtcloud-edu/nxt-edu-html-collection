# HTML 게임 배포 운영 프로그램

수강생이 소속·이름과 HTML 파일을 제출하면 업로드된 콘텐츠의 접속 URL을 발급하는 Express 앱입니다. 로컬에서는 Node.js 서버로, 운영에서는 Lambda Function URL로 같은 `createApp()`을 실행합니다.

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
- `GET /api/v2/cohorts` → 불변 `cohortId`, 제출 방식과 팀 선택지를 포함한 코호트 목록
- `GET /api/v2/contents` → `cohortId`, `type`, `sort` 필터를 지원하는 정규화 콘텐츠 목록
- `GET /api/v2/contents/:contentId` → 비공개 저장 필드를 제외한 콘텐츠 상세
- `GET /api/v2/contents/:contentId/versions` → 객체 키·해시를 제외한 공개 버전 번호 목록
- `POST /api/v2/contents` → 항상 새 콘텐츠 생성
- `POST /api/v2/contents/:contentId/versions` → 소유 비밀번호 확인 후 지정 콘텐츠에 새 버전 추가
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

`npm test`는 실 S3 호출, Lambda 배포, 버킷 생성이나 AWS CLI 실행을 수행하지 않습니다.
