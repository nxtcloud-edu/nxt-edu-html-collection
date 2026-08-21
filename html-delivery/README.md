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

관리자는 `/admin`에서 코호트를 선택해 최신 버전 HTML을 ZIP으로 내려받을 수 있습니다. ZIP에는 `순번_이름(또는 팀명)_제목_v버전.html` 파일과 원본 S3 키·콘텐츠 ID·조회 URL을 연결하는 `manifest.csv`, `manifest.json`이 포함됩니다. 운영 ZIP은 같은 버킷의 비공개 `exports/` 경로에 만들고 15분 유효한 서명 URL로 전달하며, 수명 주기로 1일 뒤 삭제합니다. ZIP과 삭제 기능은 `games/*`와 `contents/*`를 모두 지원하며 기존 객체를 자동 이동하지 않습니다.

S3 객체에는 `contentid`, URL 인코딩된 `title`, `version` Metadata와 `text/html; charset=utf-8` Content-Type이 설정됩니다. 코호트·소유자·제목의 기준 데이터는 DynamoDB 콘텐츠 레코드에 저장합니다.

## API

- `GET /api/health` → `{ "ok": true }`
- `POST /api/upload` multipart 필드 `affiliation`, `category`, `name`, `title`, `password`, `file` → `201 { url, directUrl, contentId, title, version, uploadedAt }`
- `GET /api/admin/cohort-overview?cohort={코호트명}` → 콘텐츠 수·유형·누적 버전·저장 키 방식·ZIP 준비 상태 (관리자 인증 필요, `cohort` 생략 시 전체)
- `POST /api/admin/exports` JSON 필드 `cohort` → 해당 코호트 최신 HTML의 ZIP 생성 결과 (관리자 인증 필요)
- `GET /api/admin/exports/:exportId/download` → 로컬 모드에서 생성한 ZIP 다운로드 (관리자 인증 필요)
- 파일은 `.html`만 허용하며 최대 1MB, 소속·이름은 trim 후 각각 1~40자입니다.

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

`npm test`는 실 S3 호출, Lambda 배포, 버킷 생성이나 AWS CLI 실행을 수행하지 않습니다.
