# WO-031: 관리자 페이지에서 관리자 추가 (다중 관리자)
상태: 대기
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/031` 브랜치 (README 규칙)

## 목표
단일 관리자(env) 구조를 **다중 관리자**로 확장하고, 관리자 페이지에서 **새 관리자(아이디 + 초기 비밀번호)를 추가**할 수 있게 한다. 모든 관리자는 **동등 권한**(콘텐츠·코호트·관리자 추가 전부 가능). 추가된 관리자는 자기 아이디/비번으로 로그인하고 자기 비번을 변경할 수 있다.
(참고: karin.kim/ella.kim 실제 계정 추가는 **사용자가 배포 후 UI로 직접** 수행. 이 WO는 기능만 구현.)

## 배경·구조 결정 (변경 금지)
현재 `admin-auth.js`는 **단일 admin**: `adminConfig()`가 env(`ADMIN_ID`·`ADMIN_PASSWORD_HASH`·`ADMIN_PASSWORD_SALT`·`SESSION_SECRET`)에서 1명, WO-027 오버라이드는 그 1명의 **비번만** 교체. 세션 토큰은 `{exp}`만(신원 없음).
- **env admin = 부트스트랩(root) 계정으로 유지.** 추가 관리자는 **DynamoDB 계정**으로 저장(WO-030 커스텀 코호트와 동일 패턴).
- 저장: 기존 단일 테이블(`FEEDBACK_TABLE`) 재사용. 키 `contentKey='admin#accounts', createdAt='meta'`의 단일 집계 아이템 `{ accounts: [{id, passwordHash, salt, createdAt}, ...] }`. (`content#`/`admin#credential`과 겹치지 않음, 갤러리 스캔 미노출 — 확인.)
- **인프라/IAM/env/새 테이블 변경 없음**(기존 Get/Put 권한 재사용).
- **비밀번호는 scrypt 해시+솔트만 저장**(기존 `hashPassword`/`verifyPassword` 재사용). **평문/해시/솔트를 로그·감사·저널·코드에 절대 남기지 말 것.**
- 삭제·권한등급은 범위 밖(추가만, 전원 동등). 관리자 아이디 변경 없음.

## 설계 결정 (변경 금지)
1. **registry.js — 관리자 계정 저장/조회 (DRY_RUN 페어 필수)**
   - `getAdminAccounts()` → prod: `GetCommand` Key `{contentKey:'admin#accounts', createdAt:'meta'}` → `Array.isArray(item.accounts)?item.accounts:[]`. DRY_RUN(`!TABLE_NAME`): 전용 파일 `.local-admin-accounts.json`(LOCAL_REGISTRY와 같은 디렉토리) 읽기, ENOENT→`[]`.
   - `addAdminAccount({id, passwordHash, salt})` → 목록 read → append `{id, passwordHash, salt, createdAt: new Date().toISOString()}` → prod: `PutCommand` Item `{contentKey:'admin#accounts', createdAt:'meta', accounts:[...]}`. DRY_RUN: 파일에 `JSON.stringify(accounts)`, **mode 0o600**(해시/솔트 포함).
   - `updateAdminAccountPassword(id, {passwordHash, salt})` → 해당 id의 account 항목 hash/salt 교체 후 저장(본인 비번 변경용). 없으면 no-op/false.
   - 로컬 레지스트리에 넣지 말 것(전용 파일). `.local-admin-accounts.json`을 `.gitignore`에 추가.
   - `module.exports`에 3함수 추가.
2. **admin-auth.js — 다중 로그인 + 세션 신원 + 비번변경 라우팅**
   - `createAdminAuth(deps)`에 `getAdminAccounts`·`addAdminAccount`·`updateAdminAccountPassword` 주입 추가(기존 deps 유지).
   - **세션 토큰에 신원 추가**: `createSessionToken({ id, ... })` payload `{ exp, id }`(HMAC 서명 그대로). `verifySessionToken`은 서명·exp 검증 유지하고 payload 반환하도록(또는 별도 `readSession`). `requireAdmin`은 검증 통과 시 `req.adminId = payload.id ?? config.id`(구 토큰=신원 없음 → env admin으로 폴백, **후방호환**).
   - **login(async)**: `body.id`로 자격 결정 —
     - `timingSafeStringEqual(body.id, config.id)`면 env admin: `resolveActiveCredential`(WO-027 오버라이드 우선)로 hash/salt 확보.
     - 아니면 `getAdminAccounts()`에서 `account.id === body.id` 조회 → 있으면 그 account의 hash/salt.
     - 어느 쪽도 없거나 비번 불일치 → **401** `ADMIN_AUTH_FAILED_MESSAGE`(아이디 존재 여부로 메시지·타이밍 차이 두지 말 것). rate limit 유지.
     - 성공: `createSessionToken({ id: 매칭된 id, secret: config.sessionSecret })`로 쿠키 발급.
   - **changePassword(async)**: `req.adminId` 기준 —
     - `req.adminId === config.id`(env admin): 기존 경로(`saveAdminCredential`, WO-027) — 현재 비번은 `resolveActiveCredential`로 검증.
     - 그 외(DynamoDB account): `getAdminAccounts()`에서 본인 account 찾아 현재 비번 검증 → 통과 시 `updateAdminAccountPassword(req.adminId, hashPassword(newPassword))`. account 없으면 401.
     - 현재비번 불일치 401, 새 비번 8~72·현재와 동일 400(기존 규칙 재사용). 감사 `change-password`(신원·평문 미기록).
   - **신규 addAdmin(async)** (`requireAdmin` 뒤): body `{id, password}`.
     - `id` 검증: 문자열 trim, 정규식 `^[a-z0-9](\.?[a-z0-9]){2,29}$`류(소문자·숫자·점, 3~30자) 아니면 **400** `'관리자 아이디는 소문자·숫자·점 3~30자예요.'`.
     - 중복: id가 `config.id`(env) 또는 기존 account id에 있으면 **409** `'이미 있는 관리자예요.'`.
     - `password` 검증: 문자열 8~72자 아니면 **400** `'비밀번호는 8~72자로 입력하세요.'`.
     - 통과: `hashPassword(password)` → `addAdminAccount({id, passwordHash, salt})` → **200** `{ok:true}`. 감사 `add-admin`(**id 외 평문/해시/솔트 미기록**; 신원 최소화 원할 시 contentId 자리에 null).
   - 반환 객체에 `addAdmin` 추가. `requireAdmin`이 `req.adminId` 세팅.
3. **server.js**: registry 3함수 import → `createAdminAuth(...)` deps 주입. `app.post('/api/admin/admins', adminAuth.requireAdmin, adminAuth.addAdmin)` 추가. `change-password`/`add-admin` 감사 경로 유지(평문·해시·솔트 로그 금지).
4. **admin.html — 관리자 추가 UI (네이티브 모달)**
   - 상단 `.site-tools`에 `#openPasswordButton` 옆(또는 근처)에 `<button id="openAdminButton" class="admin-button" type="button" hidden>관리자 추가</button>`. `showLoggedIn`에서 노출·`showLoggedOut`에서 숨김(+열린 모달 close).
   - `<dialog id="adminModal">`(WO-028 dialog 스타일): 필드 `아이디`(`#newAdminId`) + `초기 비밀번호`(`#newAdminInitPassword`, `type="password"`, `minlength="8" maxlength="72"`) + `[추가]`(submit) + `[취소]`. status `#adminStatus`.
   - 열기: reset+status 초기화+showModal. 제출 → `POST /api/admin/admins` `{id, password}` → 성공: close, 상위 status 성공 한국어(예: `'관리자를 추가했어요.'`), 필드 초기화. 오류: 모달 status.
   - **innerHTML 금지, textContent만.** 입력 비번은 `type="password"`.
5. **범위**: `registry.js` + `admin-auth.js` + `server.js` + `html-delivery/public/admin.html` + `.gitignore` + 테스트. 공개 페이지 미수정.
6. **테스트**
   - `admin-auth.test.js`(주입): 다중 로그인 — env admin 로그인, DynamoDB account 로그인, 없는 id·틀린 비번 401. 세션 토큰에 id 포함·`requireAdmin`가 `req.adminId` 세팅(구 토큰 폴백=env id). changePassword: env admin은 saveAdminCredential 경로, account는 updateAdminAccountPassword 경로, 각각 성공 후 새 비번 로그인·기존 비번 실패. addAdmin: 미인증 401, 정상 200, 잘못된 id 400, 중복(env·account) 409, 짧은 비번 400, 저장값이 평문 아닌 hash+salt, 감사 로그에 평문/해시/솔트 미포함.
   - registry 테스트(DRY_RUN): getAdminAccounts=[], addAdminAccount append, updateAdminAccountPassword 교체, 파일 mode 0o600, 로컬 레지스트리 미오염.
   - `npm test` 전체 그린.

## 컨텍스트 (필독 파일)
- `html-delivery/admin-auth.js` — 전체(adminConfig·resolveActiveCredential·createSessionToken·verifySessionToken·requireAdmin·login·changePassword).
- `html-delivery/registry.js` — `getAdminCredential`/`saveAdminCredential`·`hashPassword`/`verifyPassword`·WO-030 `getCustomCohorts`/`addCustomCohort`(동일 패턴 참조).
- `html-delivery/server.js` — `createAdminAuth` 주입부, admin 라우트들.
- `html-delivery/public/admin.html` — `.site-tools`·`<dialog>` 패턴(WO-028)·`showLoggedIn/Out`·loadData.
- `.agent/work-orders/README.md` — 절대 금지 블록 + 게이트. `AGENTS.md` 보안 규칙.

## 작업 단계
1. registry: getAdminAccounts·addAdminAccount·updateAdminAccountPassword + DRY_RUN 파일(0o600) + `.gitignore` + node --test.
2. admin-auth: 세션 payload id, requireAdmin req.adminId, login 다중 조회, changePassword 라우팅, addAdmin + 테스트.
3. server.js: deps 주입 + `POST /api/admin/admins` 라우트.
4. admin.html: 관리자 추가 버튼 + `<dialog id="adminModal">` + 제출/닫기 + 토글.
5. `cd html-delivery && npm test` 전체 그린. 구조 자기점검(grep): `admin#accounts` 존재, 3함수 export, admin.html `id="adminModal"` 존재·innerHTML 부재·비번 필드 `type="password"`.
6. TURN_LOG 완료 헤더(Commands 전수 기재) + 상태 `검증 대기`, 커밋은 wo/031에만.

## 완료 기준
- [ ] env admin + DynamoDB 관리자 모두 로그인 성공, 없는 id/틀린 비번 401
- [ ] `POST /api/admin/admins` 인증 필요(401)·id 형식·중복 409·비번 8~72, 감사 `add-admin`(평문/해시/솔트 미기록)
- [ ] 각 관리자 본인 비번 변경 동작(env=오버라이드, account=계정 갱신), 세션 토큰 신원 + 구 토큰 후방호환
- [ ] DRY_RUN 전용 `.local-admin-accounts.json`(0o600, 레지스트리 미오염, 갤러리 미유출), `.gitignore` 반영
- [ ] admin.html 관리자 추가 모달 동작(비번 필드 type=password), innerHTML 미사용
- [ ] `npm test` 전체 그린, 인프라/IAM/env/새 테이블 변경 없음, wo/031에만 커밋 + TURN_LOG 완료 헤더

## 금지 사항
- 절대 금지 블록: push·main 머지·배포·terraform plan/apply·aws CLI 금지(검증자 전담)
- 새 env·새 IAM·새 테이블 금지(기존 `FEEDBACK_TABLE`·권한 재사용). 관리자 삭제·권한등급·아이디 변경 기능 넣지 말 것(추가만, 전원 동등)
- **평문/해시/솔트를 로그·감사·저널·코드에 하드코딩·기록 금지.** 외부 라이브러리 금지(내장 crypto). innerHTML 금지
- karin.kim/ella.kim 등 특정 계정을 코드/시드로 만들지 말 것 — **기능만**(실제 추가는 사용자 UI)
- 공개 페이지(index/cohort/upload/view) 수정 금지
- 브라우저 검증 과잉 루프 금지(WO-023): npm test 그린 + 구조 단언까지. 시각 확인은 검증자(Claude)
