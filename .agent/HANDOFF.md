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

## Collision risks / boundaries
- 작업 시작 전부터 `admin.html`, `registry.js`, `server.js`, 관리자 테스트에 코호트 이름 변경 수정이 존재했다. 신규 ZIP 변경은 이를 보존한 채 같은 파일에 추가됐다.
- `.zed/`는 기존 비추적 파일이며 수정하지 않았다.
- 버킷 공개 정책은 `games/*`로 좁혀졌고 `exports/*`는 비공개다.
- Phase 9 브라우저 검증 시 사용자가 다시 로그인해 관리자 모달의 46개 작업·시도 2·완료·다운로드 버튼을 확인했다. 다운로드 자체는 사용자가 이전 단계에서 검증했으므로 다시 누르지 않았다.

## Next safe action
1. Phase 9 구현·배포·대량 작업·재시도·운영 브라우저·alarm 검증이 완료됐다.
2. 다음 Phase 10은 CloudFront OAC·S3 비공개 전환이며 직접 S3 콘텐츠 URL 영향 분석부터 시작한다.
3. 기존 S3 객체 삭제는 Phase 11이며 별도 승인 전에는 수행하지 않는다.
