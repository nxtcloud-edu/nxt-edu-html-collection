# WO-009: 사이트 내부 뷰어 + 피드백 기능
상태: 완료 (2026-07-12, 검증자 Claude — 테스트 19/19·DRY_RUN 전 동선·브라우저 실측 통과, main 머지)
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/009` 브랜치 (README 규칙)

## 목표
카드 클릭 시 외부 S3로 직행하지 않고 **사이트 내부 뷰어에서 콘텐츠를 보고 플레이**할 수 있게
하고, 뷰어에 **피드백 남기기·목록**을 붙인다. 업로드 발급·공유 URL도 뷰어 URL로 전환 —
"링크 받은 실유저가 플레이하고 그 자리에서 피드백을 남기는" 동선 완성.
근거: `docs/planning/DECISIONS.md` 2026-07-12 내부 뷰어·피드백 결정.

## 설계 결정 (변경 금지)
1. **콘텐츠 프록시** `GET /play/{key}`: Lambda가 S3 `GetObject`(DRY_RUN은 로컬 파일)로 본문을
   `text/html; charset=utf-8`로 서빙. https 사이트 안 iframe에서 http S3 직결 시 mixed content
   차단되므로 프록시가 필수. key 검증: `^games/[0-9]{14}-[0-9a-f]{4}\.html$` 정규식 불일치는 404.
2. **뷰어 페이지** `public/view.html?key=...`:
   - 상단: 콘텐츠 이름·코호트·분류·업로드 일시 (`/api/games`에서 조회), "← 갤러리로" 링크,
     "새 탭에서 크게 보기"(`/play/{key}`) 링크
   - 본문: `<iframe src="/play/{key}">` (미니게임 키보드 조작을 위해 로드 후 iframe focus)
   - 하단: 피드백 목록 + 작성 폼(닉네임 선택 입력·내용 필수)
3. **피드백 API**:
   - `POST /api/feedback` `{ key, nickname?, message }` — message 1~500자 트림 필수,
     nickname 최대 20자(없으면 "익명"), key는 1의 정규식 검증. 성공 201.
   - `GET /api/feedback?key=...` — 해당 콘텐츠 피드백 오름차순(오래된 것부터) `{ feedback: [...] }`.
   - 저장: **DynamoDB** 테이블 `nxt-edu-feedback` — PK `contentKey`(S), SK `createdAt`(S, ISO).
     DRY_RUN 모드는 `html-delivery/.local-feedback.jsonl`에 append (동일 API 계약).
   - XSS 방어: 클라이언트 렌더링은 textContent만 사용(innerHTML 금지), 서버는 저장 시 트림만.
4. **카드 링크 전환**: index.html·cohort.html 카드 → `view.html?key=...` (내부 이동, 새 탭 아님).
   업로드 성공 응답의 `url`도 뷰어 절대 URL로 (S3 직링크는 응답 필드 `directUrl`로 유지).
5. **infra**: `aws_dynamodb_table` (PAY_PER_REQUEST, PK/SK 위 정의) + Lambda IAM에
   해당 테이블 `dynamodb:PutItem`·`Query`만 인라인 추가. Lambda 환경변수 `FEEDBACK_TABLE`.
   의존성 추가는 `@aws-sdk/client-dynamodb`+`@aws-sdk/lib-dynamodb`만.
6. **커밋 분리** (최소 4): ① `feat:` 프록시+피드백 API+테스트 ② `feat:` 뷰어 UI+카드 전환
   ③ `feat:` infra DynamoDB ④ `docs:` README 갱신 (공유 URL이 뷰어 URL임을 4·5장에 반영).

## 컨텍스트 (필독 파일)
- `html-delivery/server.js`, `public/*.html`, `infra/main.tf`, `README.md` 4·5장

## 작업 단계
1. server.js: /play 프록시·피드백 API·검증 순수 함수 + node --test (key 정규식·메시지 길이·닉네임 기본값)
2. view.html + 카드 링크 전환 + 업로드 응답 URL 전환
3. infra: DynamoDB·IAM·환경변수, terraform fmt·validate
4. DRY_RUN 실측: 업로드→뷰어 URL 발급→뷰어에서 iframe 로드→피드백 작성→목록 노출 (Commands 전수)
5. npm test 그린, README 갱신
6. TURN_LOG 완료 헤더 + 상태 `검증 대기` + wo/009 커밋

## 완료 기준
- [ ] DRY_RUN에서 위 4의 전체 동선 실측 통과, 잘못된 key는 /play·/api/feedback 모두 404
- [ ] 피드백 XSS 안전(렌더링 textContent), 빈 메시지·501자 400
- [ ] terraform validate·fmt 통과, npm test 전체 그린, 커밋 분리 준수
- [ ] TURN_LOG 완료 헤더 + wo/009에만 커밋

## 금지 사항
- 절대 금지 블록 준수 (실 DynamoDB·S3 호출 금지 — apply·프로덕션 검증은 검증자).
  검증은 단독 명령만 (긴 && 체인·node -e 금지)
- 게임 파일·lambda.js 수정 금지
- 스코프 밖: 피드백 삭제/수정, 별점, 인증, 알림, 페이지네이션 — 요청 없음
