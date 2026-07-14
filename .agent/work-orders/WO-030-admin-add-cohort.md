# WO-030: 관리자 페이지에서 코호트 추가
상태: 완료 (2026-07-14, 검증자 Claude — npm test 41/41·Chrome DRY_RUN 실측·WO-031과 배치 Lambda 배포·프로덕션 비파괴 실측(cohortModal·POST 401·/api/cohorts) 통과)
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/030` 브랜치 (README 규칙)

## 목표
관리자가 관리자 페이지에서 **새 코호트(이름 + 일자)를 추가**하고 즉시 반영되게 한다. 추가된 코호트는 업로드 셀렉트·관리자 필터·홈 `수업별 모아보기` 카드에 자동 노출된다. (편집·삭제는 범위 밖 — **추가만**.)

## 배경·구조 결정 (변경 금지)
현재 `COHORTS`는 `server.js` 하드코딩 상수(부트스트랩 집합). 런타임 추가를 위해 **base(하드코딩) + custom(DynamoDB) 병합** 구조로 확장한다. WO-027의 오버라이드 패턴을 재사용한다.
- 저장: 기존 단일 테이블(`FEEDBACK_TABLE`) 재사용. 키 `contentKey='cohort#custom', createdAt='meta'`의 **단일 집계 아이템**에 `{ cohorts: [{name, date, createdAt}, ...] }`. (`content#` 접두사가 아니므로 갤러리 스캔 필터에 안 걸림 — 확인할 것.)
- **인프라/IAM/env/새 테이블 변경 없음** — 기존 Get/Put 권한 재사용(WO-027과 동일).
- 커스텀 코호트는 **팀 없음(일반 코호트)**. 이름 + 일자만. (사용자 결정: 팀 수 미입력.)

## 설계 결정 (변경 금지)
1. **registry.js — 커스텀 코호트 저장/조회 (DRY_RUN 페어 필수)**
   - `getCustomCohorts()` → prod: `GetCommand` Key `{contentKey:'cohort#custom', createdAt:'meta'}` → `Array.isArray(item.cohorts) ? item.cohorts : []`. DRY_RUN(`!TABLE_NAME`): 전용 파일 `.local-cohorts.json`(LOCAL_REGISTRY와 같은 디렉토리) 읽어 배열 반환, ENOENT→`[]`.
   - `addCustomCohort({name, date})` → 현재 목록 read → append `{name, date: date||null, createdAt: new Date().toISOString()}` → prod: `PutCommand` Item `{contentKey:'cohort#custom', createdAt:'meta', cohorts:[...]}`. DRY_RUN: `.local-cohorts.json`에 `JSON.stringify(cohorts)` 저장. **중복 판정은 server.js 라우트에서 수행**(registry는 저장만).
   - **로컬 레지스트리(readLocalRegistry)에 넣지 말 것** — 갤러리 유출 방지. 반드시 전용 파일.
   - `.local-cohorts.json`을 `.gitignore`에 추가(파일별 명시 방식이므로 새 줄 필요).
   - `module.exports`에 두 함수 추가.
2. **server.js — 병합·async cohortOptions·추가 라우트·검증 확장**
   - base `COHORTS`/`TEAM_COHORTS`/`COHORT_DATES`는 그대로 유지(부트스트랩).
   - `cohortOptions()`를 **async**로: `getCustomCohorts()`를 주입/호출해 base + custom 병합 반환. 순서 = base 먼저, 그다음 custom. 각 항목:
     - base: `{ name, teams: TEAM_COHORTS[name]||null, date: COHORT_DATES[name]||null }`
     - custom: `{ name, teams: null, date: cohort.date||null }`
     - 이름 충돌 시 base 우선(custom 무시) — 병합에서 base 이름과 중복되는 custom은 제외.
   - `/api/cohorts` 라우트를 `res.json({ cohorts: await cohortOptions() })`로.
   - **검증 후방호환**: `validateUploadInput({...}, validAffiliations = COHORTS)`, `validateAdminContentPatch(existing, body = {}, validAffiliations = COHORTS)` — 선택적 파라미터(**기본=기존 base `COHORTS`**)로 추가. 내부 `COHORTS.includes(affiliation)` → `validAffiliations.includes(affiliation)`로 교체. (기존 테스트 호출은 파라미터 없이도 base로 동작 — 후방호환.)
   - 업로드·패치 라우트: 검증 전에 `const cohortNames = (await cohortOptions()).map((c) => c.name)`를 구해 `validateUploadInput(input, cohortNames)` / `validateAdminContentPatch(existing, body, cohortNames)`로 전달. TEAM_COHORTS 팀 검증은 그대로(custom은 `TEAM_COHORTS[name]` undefined → 팀 검증 스킵).
   - 신규 라우트 `app.post('/api/admin/cohorts', adminAuth.requireAdmin, ...)`:
     - body `{name, date}`. 검증:
       - `name`: 문자열, trim 후 1~60자 아니면 **400** `'코호트 이름은 1~60자로 입력하세요.'`
       - 중복: trim된 name이 `(await cohortOptions()).map(c=>c.name)`에 이미 있으면 **409** `'이미 있는 코호트예요.'`
       - `date`: 선택. 문자열이면 trim 후 0~20자, 아니면/미입력이면 `null`. 20자 초과 **400** `'일자는 20자 이하로 입력하세요.'`
     - 통과: `addCustomCohort({name: trimmedName, date: trimmedDate||null})` → **200** `{ok:true}`. `auditAdminAction('add-cohort', null)` 호출(라우트 성공 경로).
   - `createApp`가 `cohortOptions`/`getCustomCohorts`를 쓰도록 배선(registry에서 import). 테스트 주입 가능하게.
3. **admin.html — 코호트 추가 UI (네이티브 모달)**
   - 필터 `<aside>`(현재 `필터`만 있음) 하단에 `<button id="openCohortButton" class="admin-button" type="button">코호트 추가</button>` 추가.
   - `<dialog id="cohortModal">`(WO-028 dialog 스타일 재사용): 필드 `이름`(`#cohortName`) + `일자`(`#cohortDate`, 선택, placeholder 예 `6.24~25`) + `[추가]`(submit) + `[취소]`(close). status 라인 `#cohortStatus`.
   - 열기: 버튼 click → 폼 reset + status 초기화 + `showModal()`. 닫기: 취소/ESC/성공.
   - 제출 → `POST /api/admin/cohorts` `{name, date}` → 성공: 모달 close, `loadData()`로 필터·목록 갱신, 상위 status에 성공 한국어. 오류: 모달 status에 메시지.
   - **innerHTML 금지, textContent만.** 로그인 상태에서만 노출(관리 화면 내부이므로 기본 노출 OK — 별도 hidden 토글 불필요, adminPanel 안에 위치).
4. **범위**: `registry.js` + `server.js` + `html-delivery/public/admin.html` + `.gitignore` + 관련 테스트. **홈 index.html·upload.html 수정 불필요**(둘 다 `/api/cohorts` 소비 → 커스텀 자동 노출). cohort.html·view.html 미수정.
5. **테스트**
   - `validation.test.js`: `cohortOptions()`가 async가 되었으므로 해당 deepEqual 테스트를 `await cohortOptions()`로(테스트 함수 async화). 기대값은 그대로(테스트 환경엔 custom 없음 → base+date만). 기존 `validateUploadInput(...)` 호출은 파라미터 없이 유지(후방호환 확인).
   - registry 테스트(DRY_RUN): `.local-cohorts.json` 없을 때 `getCustomCohorts()`=[], `addCustomCohort` 후 append 반영, 로컬 레지스트리 미오염.
   - server/admin-api 테스트: `POST /api/admin/cohorts` — 미인증 401, 정상 추가 200, 빈/61자 이름 400, 중복 409, 20자 초과 일자 400. 추가 후 `cohortOptions()`에 custom 포함. `validateUploadInput`에 custom 이름을 `validAffiliations`로 넘기면 통과.
   - `npm test` 전체 그린.

## 컨텍스트 (필독 파일)
- `html-delivery/server.js` — 15~22 `COHORTS`, 23~28 `TEAM_COHORTS`, 30~ `COHORT_DATES`(WO-029), 55~57 `cohortOptions`, 59·113 검증 함수, 273 `/api/cohorts`, 245 patch·320 upload 라우트.
- `html-delivery/registry.js` — 7~10 로컬/키 상수, 47~ `getAdminCredential`/`saveAdminCredential`(오버라이드 패턴 참조), `listRegistryItems` 스캔 필터, `documentClient`.
- `html-delivery/public/admin.html` — 필터 `<aside>`, `<dialog>` 패턴(WO-028), `loadData`/`fillFilters`.
- `.agent/work-orders/README.md` — 절대 금지 블록 + 게이트.

## 작업 단계
1. registry: getCustomCohorts·addCustomCohort + DRY_RUN 파일 + `.gitignore` + node --test.
2. server.js: cohortOptions async 병합, `/api/cohorts` await, 검증 함수 validAffiliations 파라미터, 업로드/패치 라우트 배선, `POST /api/admin/cohorts` + 배선.
3. admin.html: 코호트 추가 버튼 + `<dialog id="cohortModal">` + 제출/닫기 + loadData 갱신.
4. 테스트 갱신·추가 → `cd html-delivery && npm test` 전체 그린. 구조 자기점검(grep): `cohort#custom` 존재, `getCustomCohorts`/`addCustomCohort` export, admin.html `id="cohortModal"` 존재·innerHTML 부재.
5. TURN_LOG 완료 헤더(Commands 전수 기재) + 상태 `검증 대기`, 커밋은 wo/030에만.

## 완료 기준
- [ ] 관리자 페이지 `코호트 추가`(이름+일자) 모달 동작, 추가 즉시 필터·목록·`/api/cohorts` 반영
- [ ] 커스텀 코호트가 업로드 셀렉트·홈 `수업별 모아보기` 카드에 노출(코드 변경 없이 데이터로)
- [ ] `POST /api/admin/cohorts` 인증 필요(401)·이름 1~60·중복 409·일자 검증, 감사 로그 `add-cohort`
- [ ] DRY_RUN 전용 `.local-cohorts.json`(레지스트리 미오염, 갤러리 유출 없음), `.gitignore` 반영
- [ ] `cohortOptions()` async 병합, `npm test` 전체 그린, 인프라/IAM/env/새 테이블 변경 없음
- [ ] wo/030에만 커밋 + TURN_LOG 완료 헤더

## 금지 사항
- 절대 금지 블록: push·main 머지·배포·terraform plan/apply·aws CLI 금지(검증자 전담)
- 새 env·새 IAM·새 테이블 금지(기존 `FEEDBACK_TABLE`·권한 재사용). 코호트 편집·삭제 기능 넣지 말 것(추가만)
- base `COHORTS`/`TEAM_COHORTS`/`COHORT_DATES` 값 변경·삭제 금지(확장만)
- 공개 페이지(index/cohort/upload/view) nav·푸터·헤더 로직 변경 금지. innerHTML·외부 라이브러리 금지
- 브라우저 검증 과잉 루프 금지(WO-023 환류): npm test 그린 + 구조 단언까지. 시각 확인은 검증자(Claude)
