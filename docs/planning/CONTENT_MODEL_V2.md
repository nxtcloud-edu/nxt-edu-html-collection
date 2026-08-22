# 콘텐츠 플랫폼 v2 데이터·API 계약

Status: Phase 15 저장·관리자 API 구현 및 운영 backfill 완료

Date: 2026-08-21

Scope: v2 계약과 마이그레이션 안전장치를 정의하고 Phase 15 구현 상태를 기록한다.

## 1. 제품 경계

이 앱은 HTML 게임 전용 업로더가 아니라 교육 결과물 수집·전시·피드백·운영 플랫폼이다.

- 수강생은 게임 또는 웹페이지 HTML을 새 콘텐츠로 제출하거나 기존 콘텐츠의 새 버전을 올린다.
- 방문자는 코호트별 콘텐츠를 보고 피드백과 추천을 남긴다.
- 관리자는 코호트와 콘텐츠를 관리하고, 사람이 식별 가능한 파일명으로 결과물을 내보낸다.
- S3 객체 키는 저장 식별자이고 사용자용 파일명이 아니다.

## 2. 현재 모델과 문제

현재 콘텐츠 레코드는 DynamoDB의 `content#<8 hex>` 메타 항목 또는 로컬 JSON에 저장된다.

| 현재 필드 | 의미 | 문제 |
|---|---|---|
| `contentId` | 안정적인 콘텐츠 ID | 유지 가능 |
| `affiliation` | 코호트 표시 이름 | 이름 변경 시 모든 콘텐츠를 함께 수정해야 함 |
| `name` | 개인 이름 또는 팀명 | 제출자 유형을 구분할 수 없음 |
| `category` | `미니게임`, `웹페이지`, 레거시 `랜딩페이지` | 저장값과 표시값이 섞임 |
| `latestVersion` | 최신 버전 번호 | 과거 버전의 메타데이터가 없음 |
| `latestKey` | 최신 S3 키 | 버전별 크기·해시·업로드 시각이 없음 |
| `createdAt2` | 콘텐츠 생성 시각 | 이름이 임시적이며 DynamoDB sort key `createdAt`과 충돌 회피 흔적 |
| `likes` | 콘텐츠 누적 추천 | 유지 가능 |

공개 목록도 `/api/games`와 `{ games: [...] }`를 사용해 웹페이지까지 게임으로 표현한다. 신규 제출과 버전 추가는 모두 `/api/upload`에 들어오며, 코호트·이름·제목·분류가 같으면 자동으로 버전 추가로 판단한다.

## 3. 목표 도메인 모델

### 3.1 Cohort

```json
{
  "cohortId": "coh_01k3f6m8p2qa",
  "name": "2026-고대세종-ai",
  "dateLabel": "6.24~25",
  "submissionMode": "individual",
  "teamOptions": [],
  "status": "active",
  "createdAt": "2026-06-01T00:00:00.000Z",
  "updatedAt": "2026-08-21T00:00:00.000Z"
}
```

- `cohortId`는 생성 후 바뀌지 않는 내부 ID다. 형식은 `coh_`와 소문자 영숫자 12자로 고정한다.
- `name`은 관리자 화면과 학생 화면에 표시하며 변경할 수 있다.
- `submissionMode`는 `individual | team`이다.
- `teamOptions`는 팀 코호트에서만 사용한다.
- `status`는 `active | archived`다. 삭제보다 보관을 기본으로 한다.

### 3.2 Content

```json
{
  "contentId": "a1b2c3d4",
  "cohortId": "coh_01k3f6m8p2qa",
  "owner": { "kind": "individual", "name": "홍길동" },
  "title": "AI 여행 도우미",
  "contentType": "webpage",
  "latestVersion": 2,
  "latestObjectKey": "contents/a1b2c3d4/v2.html",
  "likes": 3,
  "createdAt": "2026-07-01T01:00:00.000Z",
  "updatedAt": "2026-07-02T01:00:00.000Z"
}
```

- 기존 8자리 `contentId`를 유지해 뷰어·피드백·추천의 정체성을 보존한다.
- `owner.kind`는 `individual | team`, `owner.name`은 표시 이름이다.
- `contentType` 저장값은 `game | webpage`다. 한글 라벨은 UI에서 매핑한다.
- 소유 비밀번호 해시와 salt는 비공개 저장 필드이며 어떤 공개 DTO에도 포함하지 않는다.
- 콘텐츠 제목·코호트·소유자 표시 이름 수정은 객체 키를 바꾸지 않는다.

### 3.3 ContentVersion

```json
{
  "contentId": "a1b2c3d4",
  "version": 2,
  "objectKey": "contents/a1b2c3d4/v2.html",
  "originalFileName": "travel-assistant.html",
  "sizeBytes": 18342,
  "sha256": "<64 lowercase hex>",
  "uploadedAt": "2026-07-02T01:00:00.000Z"
}
```

- 버전은 1부터 시작하며 콘텐츠 안에서 단조 증가한다.
- 한 번 기록된 버전 객체는 덮어쓰지 않는다.
- `sha256`은 복사·마이그레이션 검증 기준이다.
- 기존 데이터에서 알 수 없는 `originalFileName`은 `null`을 허용한다.
- 레거시 v1은 콘텐츠 생성 시각, 최신 버전은 콘텐츠 수정 시각을 사용할 수 있다. 그 사이 과거 버전처럼 근거가 없는 `uploadedAt`은 추정하지 않고 `null`을 허용한다.

### 3.4 AuditLog

관리자 변경은 `action`, `actor`, `targetType`, `targetId`, `occurredAt`, 민감정보를 제외한 `details`로 기록한다. 비밀번호·HTML 본문·세션 토큰은 저장하지 않는다. 감사 로그 저장 실패가 이미 성공한 관리자 변경을 실패 응답으로 바꾸지는 않으며, 이 경우 CloudWatch 오류 로그로 운영자에게 드러낸다.

## 4. 저장 키 계약

신규 객체의 목표 키는 다음과 같다.

```text
contents/{contentId}/v{version}.html
exports/{exportId}.zip
```

S3 키에는 코호트명, 제출자명, 팀명, 제목을 넣지 않는다. 이 값들은 변경 가능하고 개인정보 또는 사람이 입력한 문자를 포함할 수 있기 때문이다.

사람이 읽는 파일명은 내보내기 경계에서 생성한다.

```text
001_이름또는팀_제목_v2.html
manifest.csv
manifest.json
```

레거시 키 `games/{contentId}-v{version}.html`은 마이그레이션 완료 후에도 호환 읽기 대상으로 유지한다.

## 5. v2 API 계약

### 5.1 공개 조회

| Method | Path | 계약 |
|---|---|---|
| GET | `/api/v2/cohorts` | `{ cohorts: Cohort[] }`; 공개 콘텐츠 유형별 집계 포함 |
| GET | `/api/v2/contents` | `{ contents, total?, nextCursor? }`; `cohortId`, `type`, `sort`, `query`, `pageSize`, `cursor` 필터 |
| GET | `/api/v2/contents/:contentId` | `{ content: PublicContent }` |
| GET | `/api/v2/contents/:contentId/versions` | 공개 가능한 버전 메타 목록. 객체 키와 해시는 기본 응답에서 제외 |

`PublicContent`에는 `cohort`의 공개 요약과 `contentUrl`, `viewerUrl`을 포함할 수 있지만 비밀번호 해시, salt, DynamoDB 키, 관리자 메모는 포함하지 않는다.

### 5.2 제출과 버전 추가

| Method | Path | 의미 |
|---|---|---|
| POST | `/api/v2/contents` | 항상 새 콘텐츠 생성 |
| POST | `/api/v2/contents/:contentId/versions` | 소유 비밀번호 확인 후 명시적으로 새 버전 추가 |

신규 생성과 버전 추가를 분리해 동일 이름·제목 때문에 의도치 않게 기존 콘텐츠가 갱신되는 문제를 제거한다.

### 5.3 관리자

| Method | Path | 의미 |
|---|---|---|
| GET | `/api/v2/admin/contents` | 저장 키·상태를 포함한 관리자 목록 |
| GET | `/api/v2/admin/contents/:contentId/versions` | 크기·해시·객체 키를 포함한 관리자 버전 목록 |
| PATCH | `/api/v2/admin/contents/:contentId` | 제목·코호트·소유자·유형 수정 |
| GET | `/api/v2/admin/cohorts` | 활성·보관 코호트 목록 |
| POST | `/api/v2/admin/cohorts` | 불변 ID를 가진 코호트 생성 |
| PATCH | `/api/v2/admin/cohorts/:cohortId` | 표시 이름·일자·상태 수정 |
| POST | `/api/v2/admin/exports` | `cohortId` 기준 export 생성 |
| GET | `/api/v2/admin/audit-logs` | cursor 기반 최신순 관리자 감사 로그 |

관리자 콘텐츠 목록은 `pageSize`, 불투명 `cursor`, `cohortId`, `type`, `query`를 사용한다. 코호트 이름 대신 불변 ID로 수정·내보내기 대상을 식별한다.

## 6. 레거시 호환 계약

v2 도입 중에도 다음 계약은 제거하지 않는다.

- `GET /api/games`와 `{ games: [...] }`
- `GET /api/content?id=<contentId>`
- `POST /api/upload`
- `GET /api/cohorts`, `GET /api/categories`
- `/view.html?id=<contentId>`
- 기존 `games/*` 객체 조회

레거시 API는 v2 서비스 결과를 기존 필드로 변환하는 adapter가 된다.

| 레거시 | v2 |
|---|---|
| `affiliation` | `cohort.name` |
| `name` | `owner.name` |
| `category=미니게임` | `contentType=game` |
| `category=웹페이지/랜딩페이지` | `contentType=webpage` |
| `latestKey` | `latestObjectKey` |
| `createdAt2` | `createdAt` |

`POST /api/upload`의 기존 자동 identity 규칙은 호환 기간에만 유지한다. 새 UI는 명시적인 v2 생성·버전 API를 사용한다.

## 7. S3·DynamoDB 마이그레이션 불변조건

1. 기존 객체는 이동하지 않고 새 키로 복사한다.
2. 기존 객체를 overwrite하거나 삭제하지 않는다.
3. 콘텐츠별 예상 버전 수와 실제 원본 객체 수가 다르면 해당 콘텐츠 전환을 중단한다.
4. 원본과 복사본의 byte size와 SHA-256이 모두 일치해야 성공이다.
5. 버전 메타 레코드를 먼저 검증한 뒤 콘텐츠의 `latestObjectKey`를 전환한다.
6. 읽기는 `latestObjectKey`를 우선하고 레거시 `latestKey`로 fallback한다.
7. `/view.html?id=<contentId>`는 전 과정에서 유지한다.
8. 기존 직접 `/games/*` URL은 호환 기간 동안 유지한다.
9. 실패한 콘텐츠는 원본 레지스트리와 원본 키를 계속 사용한다.
10. 기존 객체 삭제는 마이그레이션과 분리하며 별도 목록·검증·사용자 승인을 요구한다.

## 8. 단계별 전환 게이트

### Gate A — 계약 도입

- v2 타입·normalizer·repository 계약을 테스트로 고정한다.
- 운영 데이터와 S3는 변경하지 않는다.

### Gate B — additive backfill

- 코호트 ID와 정규화 필드를 기존 레코드에 추가한다.
- 기존 필드는 그대로 둔다.
- dry-run 결과의 대상·누락·충돌 수를 먼저 보고한다.
- ContentVersion은 기존 `contents/{contentId}/vN.html`을 읽어 크기와 SHA-256을 계산한 뒤 조건부로 추가한다. 객체나 콘텐츠 포인터는 수정하지 않는다.
- apply는 `conflicts: 0`, `failures: 0`일 때만 허용하며 확인 문자열을 요구한다. 재 dry-run에서 모든 레코드가 `existing`으로 분류돼야 한다.

2026-08-22 운영 실행 결과:

- dry-run에서 콘텐츠 283개·예상 버전 396개가 모두 `ready`, 충돌·실패 0이었다.
- 조건부 apply로 ContentVersion 396개를 생성했으며 기존 S3 객체·콘텐츠 포인터·공유 URL은 변경하지 않았다.
- 재 dry-run은 `ready: 0`, `existing: 396`, `conflicts: 0`, `failures: 0`으로 종료했다.

### Gate C — 신규 쓰기 전환

- 신규 콘텐츠만 `contents/*`에 저장한다.
- 기존 콘텐츠 버전 추가는 전환 상태에 따라 현재 prefix를 유지해 한 콘텐츠의 버전 경로가 섞이지 않게 한다.

### Gate D — 기존 객체 복사

- 콘텐츠 단위로 모든 버전을 복사·검증한다.
- 일부 실패가 전체 서비스나 다른 콘텐츠 전환을 막지 않도록 재실행 가능해야 한다.

2026-08-21 운영 실행 결과:

- 레지스트리 콘텐츠 283개가 기대한 레거시 버전 396개를 모두 보유했고, 누락·추가 버전·기존 목적지 충돌은 0건이었다.
- 396개를 `contents/{contentId}/vN.html`로 조건부 생성하고, 복사 후와 재 dry-run에서 원본·목적지 size와 SHA-256 396/396 일치를 확인했다.
- 원본 `games/*`는 398개·51,558,328 bytes로 유지했다. 이 중 396개·51,552,665 bytes가 등록 버전이며, 레지스트리에 연결되지 않은 과거 무버전 객체 2개는 복사·삭제하지 않았다.
- 레지스트리 최신 포인터와 읽기 우선순위는 변경하지 않았다. 이는 Gate E(Phase 8)에서 별도로 전환한다.

### Gate E — 읽기 전환

- 검증 완료 콘텐츠만 새 키를 우선 조회한다.
- 레거시 fallback과 기존 URL을 유지한다.

2026-08-21 운영 실행 결과:

- 복사본 size·SHA-256을 다시 검증한 뒤 283개 레코드에 `latestObjectKey=contents/{contentId}/vN.html`을 조건부 추가했다. 실패·차단·충돌은 0건이다.
- 기존 `latestKey=games/{contentId}-vN.html` 283개는 변경하지 않고 fallback·rollback 기준으로 보존했다.
- v2 API와 레거시 API 모두 283개 콘텐츠에 새 URL을 반환하고 내부 `latestObjectKey`는 공개하지 않는다.
- 관리자 export는 새 키를 우선 읽고 객체가 없을 때 기존 키를 fallback하며 manifest에는 실제 사용한 키를 기록한다.
- 후속 버전은 새 `contents/*`에 저장하고 기존 레거시 포인터는 유지한다. 관리자 명시 삭제 시에는 양쪽 저장 경로를 함께 정리한다.
- 인앱 브라우저에서 갤러리 283개와 `contents/*` iframe의 실제 웹페이지 렌더링을 확인했다.

### Gate F — 보안 전환

- CloudFront OAC와 S3 Public Access Block 4종으로 `games/*`·`contents/*` 직접 S3 읽기를 차단한다.
- 신뢰하지 않는 학생 HTML은 앱·관리자 세션과 다른 `content.showcase.nxtcloud.kr` origin에서 제공한다.

2026-08-22 운영 실행 결과:

- 전용 ACM 인증서·CloudFront 배포·Route 53 A/AAAA 레코드를 생성하고 S3 정책의 읽기 주체를 전용 배포 하나로 제한했다.
- 앱 CloudFront에서 S3 origin과 `/games/*`·`/contents/*` behavior를 제거했다.
- 공개 API 283/283개 콘텐츠 URL이 전용 도메인을 사용하고 실제 iframe HTML 렌더링을 확인했다.
- 전용 콘텐츠 URL은 200, 직접 S3 URL은 403, 앱 도메인의 이전 콘텐츠 경로는 404다.
- 기존 S3 객체와 DynamoDB 포인터는 복사·이동·삭제·수정하지 않았다.

### Gate G — 레거시 정리

- 호환 API와 기존 S3 객체 제거는 사용량 관찰과 별도 승인 후에만 수행한다.

2026-08-22 관찰 시작 결과:

- 읽기 전용 감사 도구는 등록 객체의 복사본 SHA-256, 레지스트리 참조, 최소 7일 CloudFront 사용량 근거를 모두 확인하며 `--apply`와 확인 문자열을 명시적으로 거부한다.
- 운영 감사 결과 `games/*` 398개 중 등록 396개·복사본 검증 396개, mirror 누락·충돌 0이다.
- 최신 fallback 참조 283개, 사용량 근거 대기 113개, 미등록·소유 불명 2개로 현재 삭제 후보는 0개다.
- 콘텐츠 CloudFront 로그는 2026-08-22 13:13:00.629Z부터 쿠키 없이 별도 비공개·암호화 S3 버킷에 수집하고 14일 후 만료한다.
- 최소 7일 관찰 종료와 24시간 전달 지연을 반영해 2026-08-30 13:13:00.629Z 이후 첫 완전 근거를 생성할 수 있다.
- fallback 은퇴 도구는 복사본 검증, 현재 두 포인터의 정확한 일치, 완전한 사용량 근거, 콘텐츠별 레거시 요청 0건을 모두 요구하며 조건부 갱신만 허용한다.
- 배포 후 운영 dry-run에서 콘텐츠 283개 모두 사용량 근거 대기로 차단됐고 ready·retired·conflict는 0이다.
- 콘텐츠 객체·레지스트리 포인터 삭제나 변경은 수행하지 않았다.

## 9. Gate A 구현 결과

Gate A에서 다음 내부 계약을 도입했다.

- 현재 저장 레코드를 v2 `Content`로 변환하는 순수 함수
- v2 `Content`를 기존 공개 DTO로 변환하는 adapter
- `game | webpage`와 레거시 한글 분류 양방향 매핑
- 코호트 ID가 없는 레거시 레코드의 명시적 처리
- 기존 전체 테스트를 유지하면서 계약 단위 테스트 추가

Gate A에서는 API 경로, S3 키, DynamoDB 데이터, 프로덕션 동작을 변경하지 않았다.

## 10. Gate B 구현 결과

- 레거시 코호트 이름은 결정적 `cohortId`, 신규 코호트는 랜덤 불변 `cohortId`를 사용한다.
- dry-run은 누락·중복·기존 ID 충돌을 분리하고 `unresolved > 0`이면 apply를 차단한다.
- 콘텐츠 갱신은 기존 `affiliation`이 그대로이고 `cohortId`가 없거나 같은 경우에만 조건부로 수행한다.
- DynamoDB Scan은 페이지 끝까지 순회하며 커스텀 코호트 목록도 dry-run 이후 변경 시 덮어쓰지 않는다.
- 2026-08-21 운영 dry-run: 코호트 15개, 콘텐츠 283개, 갱신 대상 코호트 9개·콘텐츠 283개, unresolved 0, conflict 0.
- 2026-08-21 Lambda 배포 후 운영 apply 완료: 커스텀 코호트 9개와 콘텐츠 283개에 `cohortId`를 추가했다.
- 재 dry-run은 `cohortsToUpdate: 0`, `contentsToUpdate: 0`, `unchanged: 283`, unresolved/conflict 0이다.
- 공개 API 283개 콘텐츠의 `cohortId` 존재와 기존 `games/*` 키 283개 보존을 확인했다. S3 객체는 변경하지 않았다.

## 11. Gate C 구현 결과

- 신규 콘텐츠의 첫 버전은 `contents/{contentId}/v1.html`에 저장한다.
- 기존 콘텐츠는 현재 `latestKey`의 저장 방식을 전환 상태로 사용해 이후 버전도 같은 prefix에 저장한다.
- `latestKey`의 contentId·버전이 레코드와 다르거나 지원하지 않는 키면 쓰기·삭제를 중단한다.
- 뷰어, 관리자 현황, ZIP manifest와 삭제는 `games/*`와 `contents/*`를 모두 처리한다.
- 버킷 공개 읽기와 Lambda 관리 권한에 `contents/*`를 추가하고 `exports/*`는 계속 비공개로 유지한다.
- 전체 테스트 73/73, Terraform validate 통과. 2026-08-21 배포는 S3 공개 정책·Lambda IAM·Lambda 코드 3개를 in-place 변경했고 최종 plan은 no changes다.
- 배포 후 health 200, 공개 API 콘텐츠 283개·`cohortId` 누락 0·기존 `games/*` 키 283개를 확인했다. 기존 S3 객체는 복사·이동·삭제하지 않았다.
- 인앱 브라우저에서 갤러리의 283개 콘텐츠, 웹페이지·미니게임 필터, 29페이지 페이징과 로그인된 관리자 현황·저장 키를 확인했다.
- 운영 테스트 콘텐츠 `0ba6f272`를 `contents/*` v1·v2로 생성해 최신 포인터와 관리자 신규 저장 키, 12개 코호트 ZIP 포함을 확인한 뒤 삭제했다. AWS HeadObject는 두 버전 모두 404이고 공개 목록은 기존 283개로 원복됐다.

## 12. Phase 6 구현 결과

- `/api/v2/cohorts`, `/api/v2/contents`, 콘텐츠 상세와 공개 버전 목록을 구현했다. 공개 DTO는 `cohortId`, `owner`, `contentType`, viewer/content URL을 제공하고 비밀번호 해시·salt·DynamoDB 키·S3 객체 키를 제외한다.
- `POST /api/v2/contents`는 identity 자동 병합 없이 항상 새 콘텐츠를 만들고, `POST /api/v2/contents/:contentId/versions`는 contentId와 소유 비밀번호를 명시해야 한다.
- 갤러리·코호트·상세 보기 화면은 v2 조회를 사용한다. 업로드 화면은 새 콘텐츠와 새 버전 흐름을 별도 탭으로 제공한다.
- 기존 `/api/games`, `/api/content`, `/api/upload`, 공유 뷰어 URL은 호환 경로로 유지한다.
- 전체 테스트 75/75, 로컬 브라우저에서 두 업로드 탭과 v2 갤러리 로딩을 확인했다. Terraform validate 통과, Lambda 1건을 in-place 배포했고 최종 plan은 no changes다.
- 운영 v2 API는 코호트 15개, 콘텐츠 283개(게임 182·웹 101), 코호트 누락·민감 필드 노출 0이다. 레거시 API 283개와 기존 `games/*` 키도 유지된다.
- 운영 인앱 브라우저에서 갤러리 283개와 “새 콘텐츠 만들기 / 기존 콘텐츠 새 버전” 화면을 확인했다. 운영 쓰기 데이터는 추가하지 않았다.

## 13. Phase 9 비동기 export 구현 결과

- `POST /api/admin/exports`는 작업 메타를 `queued`로 저장하고 `202`를 반환한 뒤 동일 Lambda를 `InvocationType=Event`로 호출한다.
- 워커는 조건부 claim 후 `running`으로 전환하고 ZIP 생성 성공 시 `completed`, 실패 시 오류 코드와 함께 `failed`를 보존한다. 실패 작업만 조건부 재시도하며 시도 횟수를 누적한다.
- 최근 작업 목록과 단일 상태 API는 관리자 인증을 요구하고, 완료 작업에만 새 15분 S3 서명 URL을 발급한다. ZIP 1일 보관이 끝나면 작업 이력은 남기되 다운로드 버튼은 숨긴다.
- 작업 메타는 기존 DynamoDB 테이블에 별도 `export#` 키로 저장하고 `expiresAt` 30일 TTL을 적용한다. 콘텐츠 목록 조회는 계속 `content#`만 읽으므로 기존 콘텐츠 레코드와 분리된다.
- 비동기 Lambda 자동 재시도는 0회, 이벤트 최대 수명은 1시간이다. Lambda `Errors`가 5분에 1회 이상이면 `nxt-ai-literacy-export-failures` alarm이 경보 상태로 전환된다.
- 2026-08-22 운영에서 46개 콘텐츠 ZIP을 실제 생성했다. 첫 검증 모드 오류는 `failed`로 보존됐고 조건부 재시도 후 `attempt 2`, `completed`가 됐다. S3 ZIP 357,109 bytes, DynamoDB TTL `ENABLED`, alarm `OK`, Terraform 최종 no changes를 확인했다.
