# Handoff

## Current handoff summary
- 사용자 지시로 Hermes/워크오더 없이 Codex가 현재 main 워크트리에서 직접 구현했다.
- 관리자 화면에 코호트 ZIP 다운로드를 추가했다. 선택 코호트의 각 콘텐츠 최신 HTML과 CSV/JSON manifest를 포함한다.
- 로컬 모드는 인증된 앱 다운로드 경로, 운영은 비공개 S3 `exports/` + 15분 presigned URL을 사용한다. 기존 `games/` 객체는 변경하지 않는다.
- 배포 직후 Lambda Node 20에서 `archiver` CommonJS require가 실패해 전 경로 502가 발생했다. 동적 `import()`로 수정하고 즉시 재배포해 복구했다.
- 초기 Phase 0 수정 후 `npm test` 55/55와 운영 health를 확인했으며, 이후 단계별 커밋·push·배포 기록은 아래 최신 항목과 TURN_LOG에 누적했다.
- 개편 Phase 1에서 `CONTENT_MODEL_V2.md`, `REFACTOR_ROADMAP.md`와 제품 결정 4건을 작성했다. 런타임·DynamoDB·S3 변경 없음.
- 개편 Phase 2에서 `domain/content.js`, `repositories/content-repository.js`를 추가하고 `server.js` 콘텐츠 저장 호출을 repository 경계로 연결했다. 외부 계약 불변, 전체 테스트 62/62.
- 개편 Phase 3에서 인증된 `GET /api/admin/cohort-overview`와 관리자 요약 카드·저장 키 열을 추가했다. 전체 테스트 63/63이며 DynamoDB·S3·Terraform·배포 변경은 없다.
- 개편 Phase 4에서 불변 cohortId 발급·조건부 backfill을 구현하고 배포했다. 커스텀 코호트 9개와 콘텐츠 283개 apply 후 재 dry-run 대상·unresolved·conflict가 모두 0이다.
- 개편 Phase 5에서 신규 `contents/*` 쓰기와 레거시 `games/*` prefix 고정, 이중 키 조회·ZIP·삭제, S3/IAM 권한을 구현·배포했다. 전체 테스트 73/73, Terraform apply 0 add·3 change·0 destroy, 최종 plan no changes다.
- 배포 후 health 200, 공개 API 콘텐츠 283개·cohortId 누락 0·기존 `games/*` 키 283개를 확인했다. 인앱 브라우저에서 갤러리 283개와 관리자 로그인 화면을 확인했다.
- Phase 5 운영 E2E에서 테스트 콘텐츠 `0ba6f272`를 `contents/*` v1·v2로 생성하고 최신 포인터·관리자 목록·12개 ZIP 포함을 확인한 뒤 삭제했다. S3 두 객체 404와 기존 283개 원복을 확인했다.
- Phase 6에서 v2 코호트·콘텐츠 조회, 항상 신규 생성, contentId 기반 버전 추가 API를 구현·배포하고 공개 화면을 전환했다. 전체 테스트 75/75, Lambda 1건 in-place apply, 최종 Terraform plan no changes다.
- 운영 v2 코호트 15개·콘텐츠 283개(게임 182·웹 101), 코호트 누락·민감 필드 노출 0과 레거시 283개 유지를 확인했다. 우측 패널은 운영 업로드의 “기존 콘텐츠 새 버전” 탭에 있다.
- Phase 7에서 재실행 가능한 dry-run/apply 도구를 추가하고 전체 테스트 79/79를 통과했다. 운영 레지스트리 283개의 기대 버전 396개를 `contents/*`로 조건부 복사했으며 최종 size·SHA-256 396/396, pending·blocked·conflict·실패 0건이다.
- `games/*` 원본은 398개·51,558,328 bytes로 유지했다. 등록 버전은 396개·51,552,665 bytes이고, 레지스트리에 연결되지 않은 무버전 객체 2개는 자동 매핑·복사·삭제하지 않았다.
- Phase 8에서 `latestObjectKey` 우선 포인터를 283개에 조건부 추가했다. 기존 `latestKey=games/*` 283개는 fallback으로 보존했고 재 dry-run은 switched 283·ready/blocked/conflict 0이다.
- v2·레거시 API 모두 `contents/*` URL 283개를 반환한다. 인앱 브라우저에서 갤러리 283개와 실제 `contents/0e040222/v5.html` iframe 렌더링을 확인하고 사용자 탭을 업로드 화면으로 복귀했다.
- 후속 버전은 우선 포인터와 같은 `contents/*`에 저장하며, export는 새 키 실패 시 레거시 키를 fallback한다. 원본 일괄 삭제는 수행하지 않았다.
- Phase 9에서 관리자 ZIP을 동일 Lambda 비동기 작업으로 분리했다. API/UI는 queued·running·completed·failed, 최근 이력, 시도 횟수, 실패 작업 조건부 재시도를 제공한다.
- 작업 메타는 기존 DynamoDB의 `export#` 키와 30일 TTL, ZIP은 기존 비공개 `exports/*`와 1일 수명 주기를 사용한다. Lambda async 자동 재시도 0회, 최대 이벤트 수명 1시간, Errors alarm을 배포했다.
- 운영 46개 작업 `51d0a0288ebd3a60e69b84903b054f4a`는 첫 검증 환경 누락으로 failed가 보존된 뒤 재시도되어 attempt 2·completed가 됐다. 관리자 모달의 완료·다운로드, 357,109-byte ZIP, TTL ENABLED, alarm OK를 확인했다.
- Phase 10에서 `content.showcase.nxtcloud.kr` 전용 ACM·CloudFront·Route 53을 추가하고 S3 읽기를 해당 배포의 OAC로만 제한했다. S3 Public Access Block 네 항목은 모두 true다.
- 앱 CloudFront의 S3 origin과 `/contents/*`·`/games/*` behavior를 제거했다. 공개 API 283/283개가 전용 콘텐츠 도메인을 반환하며 인앱 브라우저 iframe에서 실제 학생 웹페이지 DOM 렌더링을 확인했다.
- 직접 S3 콘텐츠 URL은 403, 앱 도메인의 이전 콘텐츠 경로는 404, 전용 콘텐츠 URL과 health는 200이다. `games/*` 398개와 `contents/*` 396개는 그대로 보존했다.
- 전체 테스트에서 드러난 로컬 export 상태 파일의 부분 읽기 경쟁 조건은 임시 파일 작성 후 atomic rename으로 수정했고 90/90을 통과했다.
- Phase 11 읽기 전용 감사 도구는 복사본 해시·레지스트리 참조·최소 7일 CloudFront 요청 근거를 모두 요구하고 `--apply`를 거부한다. 운영 결과 삭제 후보 0, 활성 fallback 283, 사용량 근거 대기 113, 미등록 2다.
- 콘텐츠 CloudFront 표준 로그는 2026-08-22 22:13 KST부터 쿠키 없이 `nxt-ai-literacy-content-access-logs/cloudfront/content/`에 수집한다. 버킷은 PAB 4종·AES256·14일 TTL이며 조직 자동 태그를 Terraform이 제거하지 않는다.
- 로그 수집기는 7일 미만 구간, 로그 활성화 이전 구간, 종료 후 24시간이 지나지 않은 구간을 거부한다. 첫 완전 근거 실행 가능 시각은 2026-08-30 22:13 KST다.
- Phase 11 배포 후 콘텐츠 HTML과 health는 200, CloudFront 배포 상태 `Deployed`, Logging Enabled·IncludeCookies false를 확인했다. S3 객체·DynamoDB 포인터 삭제나 변경은 수행하지 않았다.
- fallback 포인터 은퇴 도구는 복사본 해시·정확한 현재 포인터·완전한 7일 사용량 근거·콘텐츠별 레거시 요청 0건을 요구한다. apply에는 사용량 보고서와 `RETIRE_LEGACY_FALLBACKS` 확인 문자열이 모두 필요하며 DynamoDB 조건부 갱신만 수행한다.
- 전체 테스트 104/104 통과 후 Lambda 코드만 0 add·1 change·0 destroy로 배포했다. health·홈·v2 API 200, 콘텐츠 283개·cohortId 누락 0·전용 콘텐츠 도메인 URL 283개를 확인했다.
- 배포 후 운영 fallback dry-run은 283개 모두 `awaitingUsageEvidence`, ready·retired·conflict 0이다. 포인터 apply와 S3 변경·삭제는 실행하지 않았다.
- 2026-08-22 22:29 KST 관찰 체크에서 CloudFront gzip 로그 2개가 로그 버킷에 실제 도착했고 AES256·14일 만료 헤더를 확인했다. 기존 파서는 14개 요청 레코드와 레거시 요청 0건을 집계했으나 7일 미만 부분 표본이므로 의사결정 근거로 사용하지 않는다.
- Phase 12에서 운영 동작·데이터를 바꾸지 않고 개편 기준선을 추가했다. 운영 공개 API와 로그인 관리자 화면은 콘텐츠 283개·게임 182·웹 101·버전 합계 396으로 일치했다.
- Phase 12 기준선 커밋은 `2e20877`이다.
- Playwright는 고정 fixture와 API interception으로 공개·업로드·보기·관리자 핵심 흐름을 데스크톱·모바일에서 검사한다. 최종 12/12, 기존 단위·통합 104/104가 통과했다.
- Playwright와 axe는 devDependency다. Terraform ZIP이 `node_modules`를 포함하므로 런타임 배포 전 `npm install --omit=dev`를 유지한다.
- Phase 13에서 `server.js`를 composition root와 middleware/error handler로 축소하고 public/admin routes, content/cohort services, content/feedback repositories, object-storage adapter를 분리했다. AWS SDK 직접 사용은 repository/adapter 경계 안으로 제한했다.
- Phase 13 전체 테스트 108/108과 데스크톱·모바일 E2E 12/12가 통과했다. Terraform은 Lambda 코드 1건만 in-place 배포됐고 최종 plan은 no changes다.
- 운영 API는 코호트 15개·콘텐츠 283개·게임 182·웹 101·버전 396이며 전용 콘텐츠 샘플도 200이다. 로그인 관리자 화면에서 동일 지표, 콘텐츠 행 283개, 코호트 ZIP 버튼 노출을 읽기 전용으로 확인했다.

## Collision risks / boundaries
- 작업 시작 전부터 `admin.html`, `registry.js`, `server.js`, 관리자 테스트에 코호트 이름 변경 수정이 존재했다. 신규 ZIP 변경은 이를 보존한 채 같은 파일에 추가됐다.
- `.zed/`는 기존 비추적 파일이며 수정하지 않았다.
- 버킷은 완전 비공개이며 `games/*`·`contents/*`는 전용 콘텐츠 CloudFront OAC만 읽는다. `exports/*`는 계속 비공개 서명 URL만 사용한다.
- Phase 9 브라우저 검증 시 사용자가 다시 로그인해 관리자 모달의 46개 작업·시도 2·완료·다운로드 버튼을 확인했다. 다운로드 자체는 사용자가 이전 단계에서 검증했으므로 다시 누르지 않았다.

## Next safe action
1. Phase 14는 React·TypeScript·Vite 기반, NXT Cloud 디자인 토큰과 공통 컴포넌트, 기존 URL을 수용할 앱 shell을 만든다.
2. 기존 정적 화면은 즉시 교체하지 않고 새 빌드 산출물을 독립 경로에서 검증한 뒤 후속 Phase 16~18에서 화면별로 전환한다.
3. 2026-08-30 22:13 KST 이후 Phase 11 사용량 수집·감사·fallback dry-run을 별도 수행한다.
4. 사용량 0이어도 fallback 포인터 apply와 기존 S3 객체 삭제는 각각 별도 승인 전에는 수행하지 않는다.
