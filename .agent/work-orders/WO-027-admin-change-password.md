# WO-027: 관리자 페이지에서 관리자 로그인 비밀번호 변경
상태: 완료 (2026-07-14, 검증자 Claude — DRY_RUN 9/9·npm test 38/38·main 머지·apply·프로덕션 비파괴 실측 통과)
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/027` 브랜치

## 목표
관리자가 로그인 상태에서 **자신의 로그인 비밀번호를 관리자 페이지에서 직접 변경**하고 즉시 반영되게 한다.
(콘텐츠별 소유 비번 재설정 `reset-password`와는 별개 — 이건 관리자 계정 자체의 비번.)

## 배경·구조 결정 (변경 금지)
관리자 자격은 현재 Lambda **env**(`ADMIN_ID`·`ADMIN_PASSWORD_HASH`·`ADMIN_PASSWORD_SALT`·`SESSION_SECRET`)에
있어 런타임 변경 불가. 따라서 **DynamoDB 오버라이드 아이템**을 도입한다:
- 기존 단일 테이블(`FEEDBACK_TABLE`) 재사용. 키: `contentKey='admin#credential'`, `createdAt='meta'`.
  값: `{ passwordHash, salt, updatedAt }`. (`content#` 접두사가 아니므로 갤러리 스캔 필터에 안 걸림 — 확인할 것)
- **로그인·비번검증 시 오버라이드 우선, 없으면 env 폴백.** 오버라이드가 존재하면 env 해시/솔트는 무시.
  → env는 seed/복구용(break-glass): 오버라이드 아이템을 삭제하면 env로 복귀.
- **인프라/IAM/env 변경 없음** (같은 테이블·기존 Get/Put 권한 재사용). 새 env 변수 만들지 말 것.
- `ADMIN_ID`·`SESSION_SECRET`은 계속 env에서만. 이번엔 **비밀번호만** 변경(아이디 변경 없음).

## 설계 결정 (변경 금지)
1. **registry.js — 오버라이드 저장/조회 (DRY_RUN 페어 필수)**:
   - `getAdminCredential()` → prod: `GetCommand` Key `{contentKey:'admin#credential', createdAt:'meta'}` →
     `{passwordHash, salt}` 또는 `null`. DRY_RUN(`!TABLE_NAME`): 전용 파일
     `.local-admin-credential.json`(LOCAL_REGISTRY와 같은 디렉토리) 읽기, ENOENT→`null`.
   - `saveAdminCredential({passwordHash, salt, updatedAt})` → prod: `PutCommand` Item
     `{contentKey:'admin#credential', createdAt:'meta', passwordHash, salt, updatedAt}`.
     DRY_RUN: 위 파일에 `JSON.stringify` 저장, **mode 0o600**.
   - **주의**: 로컬 레지스트리(`readLocalRegistry`)에 넣지 말 것 — 로컬 `listRegistryItems`가 `Object.values`
     전체를 반환해 갤러리에 유출됨. 반드시 전용 파일.
   - `.local-admin-credential.json`을 `.gitignore`에 추가(기존 `.local-*` 규칙에 이미 걸리는지 확인, 아니면 추가).
   - `module.exports`에 두 함수 추가.
2. **admin-auth.js — 오버라이드 우선 검증 + 비번 변경 핸들러**:
   - `createAdminAuth(deps = {})`로 시그니처 확장: `deps.getAdminCredential`·`deps.saveAdminCredential`·
     `deps.hashPassword`를 주입(기본값 없음 — server.js가 registry 함수 주입, 테스트가 대체 주입).
   - `async resolveActiveCredential(config)`: `await getAdminCredential()` 결과가 있으면
     `{ id: config.id, passwordHash: override.passwordHash, salt: override.salt, sessionSecret: config.sessionSecret }`,
     없으면 `config`(env) 반환.
   - `login`을 **async**로: `resolveActiveCredential`로 얻은 자격으로 id·password 검증(현행 timingSafe·verifyPassword 유지).
     rate limit·401 메시지·쿠키 발급 동선 그대로.
   - `requireAdmin`은 **그대로 동기** — 세션은 `SESSION_SECRET`(env) HMAC로만 검증, DDB 조회 불필요.
   - 신규 `async changePassword(req, res)` (라우트에서 `requireAdmin` 뒤에 위치):
     body `{currentPassword, newPassword}`.
     - `requireConfigured` 통과 후 `resolveActiveCredential`로 현재 자격 확보.
     - `currentPassword`가 현재 자격과 불일치 → **401** `"현재 비밀번호가 맞지 않아요."`
     - `newPassword` 검증: 문자열, **8~72자**, `currentPassword`와 동일하면 거부 → **400**
       `"새 비밀번호는 8~72자이고 현재 비밀번호와 달라야 해요."`
     - 통과: `hashPassword(newPassword)`로 새 salt+hash 생성 → `saveAdminCredential({...,updatedAt:new Date().toISOString()})`.
       성공 시 `{ ok: true }`. 세션 쿠키는 유지(재발급 불필요).
   - 반환 객체에 `changePassword` 추가.
3. **server.js**: `app.post('/api/admin/change-password', adminAuth.requireAdmin, adminAuth.changePassword)` 추가.
   `createAdminAuth(...)` 호출에 `{ getAdminCredential, saveAdminCredential, hashPassword }` 주입(registry에서 import).
   `auditAdminAction('change-password', null)` 호출(핸들러 성공 경로). **평문·해시·솔트 로그 절대 금지.**
4. **admin.html**: 로그인 후 관리 화면에 **'관리자 비밀번호 변경'** 패널 추가(DESIGN.md 준수, 기존 톤).
   - 필드 3개: 현재 비밀번호 / 새 비밀번호 / 새 비밀번호 확인(클라이언트에서 확인 불일치 시 요청 안 보냄).
   - 제출 → `POST /api/admin/change-password` → 성공/오류를 status 라인에 한국어로. 성공 시 필드 초기화.
   - 모든 렌더 `textContent`(innerHTML 금지). 콘텐츠 관리 영역과 시각적으로 구분(별도 패널).
   - 입력 타입 `password`, 폼 submit 핸들러(WO-025 `type='button'` 회귀 주의 — 제출 버튼은 submit).
5. **테스트 (admin-auth.test.js 확장, DRY_RUN 주입)**:
   - 로그인: 오버라이드 있으면 오버라이드 자격으로 인증·env 자격은 실패 / 오버라이드 없으면 env로 인증.
   - change-password: 잘못된 현재 비번 401 / 8자 미만·73자 이상·현재와 동일 400 /
     정상 변경 후 새 비번으로 로그인 성공·기존 비번 로그인 실패 / 저장 함수가 평문 아닌 hash+salt 저장.
   - 감사 로그에 평문·해시·솔트 미포함.
6. **커밋 분리 (최소 2)**: ① feat: registry 오버라이드 저장/조회 + login 오버라이드 우선(+테스트)
   ② feat: change-password API + admin.html 패널(+테스트).

## 작업 단계
1. registry: getAdminCredential·saveAdminCredential + DRY_RUN 파일 + gitignore + node --test
2. admin-auth: deps 주입·resolveActiveCredential·login async·changePassword + 테스트
3. server.js 라우트·주입, admin.html 패널
4. DRY_RUN 실측 (핵심 5개 한정): env 로그인 / 비번 변경 성공 / 새 비번 로그인 성공·기존 비번 401 /
   현재 비번 틀림 401 / 새 비번 규칙 위반 400. (env 주입 + TABLE_NAME 미설정으로 로컬 파일 경로)
   게이트 차단 시 검증자 대행 — 1회만 시도.
5. `npm test` 그린, TURN_LOG 완료 헤더 + wo/027 커밋

## 완료 기준
- [ ] 오버라이드 우선/ env 폴백 로그인, change-password 정상·검증·감사 로그 무유출
- [ ] admin.html 비번 변경 패널 동작(현재/새/확인), 성공 시 새 비번 로그인
- [ ] DRY_RUN 로컬 전용 파일(레지스트리 미오염, 갤러리 유출 없음), 0o600, gitignore
- [ ] npm test 전체 그린, 커밋 분리, 인프라/IAM/env 변경 없음
- [ ] TURN_LOG 완료 헤더 + wo/027에만 커밋

## 금지 사항
- 절대 금지 블록: plan/apply·aws CLI·push·main 머지·배포 금지(검증자 전담). 검증은 단독 명령만
- 새 env 변수·새 IAM·새 테이블 만들지 말 것(기존 FEEDBACK_TABLE·권한 재사용)
- 관리자 아이디 변경 기능 넣지 말 것(비밀번호만). 외부 라이브러리 금지(내장 crypto)
- 평문/해시/솔트를 로그·저널·코드에 하드코딩 금지. innerHTML 금지
- 갤러리·업로드 등 공개 페이지·헤더·푸터 수정 금지
