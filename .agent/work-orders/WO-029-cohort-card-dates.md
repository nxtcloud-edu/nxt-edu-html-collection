# WO-029: 수업별 모아보기 카드에 수업 일자 표기
상태: 대기 (WO-028 머지 후 디스패치 — 큐 대기)
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/029` 브랜치 (README 규칙)

## 목표
홈 `수업별 모아보기` 탭의 각 코호트 카드에 **수업 일자**를 함께 표기한다. (콘텐츠 개수 아래에 일자 한 줄 추가.)

## 설계 결정 (변경 금지)
1. **일자는 코호트 메타데이터 — server.js 단일 소스**
   `server.js`에 `TEAM_COHORTS` 옆으로 `COHORT_DATES` 맵을 추가(키=정확한 코호트명):
   - `'2026-고대세종-ai'`: `'6.24~25'`
   - `'2026-한이음-ai-중급'`: `'7.12'`
   - `'2026-고대세종-기업인턴십'`: `'7.1~31'`   ← 사용자 입력 "07"(7월 전체 기간) → 숫자 범위 통일
   - `'2026-고대세종-아이디어톤'`: `'6.26'`
   - `'2026-국민대-ai워크플로우'`: `'6.24~30'`
   - `'2026-서남-해커톤'`: `'7.10'`
   `cohortOptions()`를 `{ name, teams: TEAM_COHORTS[name] || null, date: COHORT_DATES[name] || null }`로 확장.
   (`COHORT_DATES`를 `module.exports`에 넣을지는 코더 재량 — 테스트가 필요로 하면 추가.)
2. **index.html `renderCohorts`에 일자 렌더**
   기존 카드는 `<a.cohort-card>` 안에 `<strong>`(코호트명) + `<span>`(N개의 콘텐츠). 여기에 `cohort.date`가 있을 때만
   `<span class="cohort-date">`(예: 아이콘/접두 없이 일자 텍스트, 또는 `수업 일자 · 6.24~25`)를 추가한다. `textContent`만(innerHTML 금지).
   `date`가 없으면 아무것도 렌더하지 않는다(널 세이프).
   CSS `.cohort-date`는 기존 톤(`.cohort-card span{color:var(--muted)}`)에 맞춰 `--muted`·작은 글씨로. 카드 링크/개수 동선은 유지.
3. **테스트**: `html-delivery/test/validation.test.js`의 `assert.deepEqual(cohortOptions(), [...])`(59~66행)를 각 항목에 `date` 추가해 갱신. 값은 위 표와 일치. `npm test` 전체 그린.
4. **범위**: `server.js` + `html-delivery/public/index.html` + `html-delivery/test/validation.test.js` **3파일만**. `date` 필드는 `/api/cohorts` 소비처(admin.html·upload.html 필터/셀렉트)에 무해(그쪽은 `name`만 사용) — 그 파일들은 수정하지 않음.

## 컨텍스트 (필독 파일)
- `html-delivery/server.js` — 15~22행 `COHORTS`, 23~28행 `TEAM_COHORTS`, 47~49행 `cohortOptions()`, 273행 `/api/cohorts`.
- `html-delivery/public/index.html` — 47행 `renderCohorts`, 9행 `.cohort-card`/`.cohort-grid` CSS, 20행 `#cohorts` 패널.
- `html-delivery/test/validation.test.js` — 59~66행 `cohortOptions` deepEqual(엄격) → 갱신 대상.
- `.agent/work-orders/README.md` — 절대 금지 블록 + 게이트 규칙.

## 작업 단계
1. server.js: `COHORT_DATES` 추가 + `cohortOptions()` 확장.
2. validation.test.js: deepEqual에 `date` 반영 → `node --test test/validation.test.js` 그린.
3. index.html: `renderCohorts`에 일자 span + `.cohort-date` CSS(널 세이프, textContent).
4. `cd html-delivery && npm test` 전체 그린. 구조 자기점검(grep): `COHORT_DATES` 존재, `cohort.date` 렌더, innerHTML 부재.
5. TURN_LOG 완료 헤더(Commands 전수 기재) + 상태 `검증 대기`, 커밋은 wo/029에만.

## 완료 기준
- [ ] 홈 `수업별 모아보기` 카드에 6개 코호트 일자가 위 표대로 표기(개수 줄과 함께), 일자 없는 코호트는 미표기
- [ ] `cohortOptions()`가 `date` 포함, `validation.test.js` deepEqual 갱신, `npm test` 전체 그린
- [ ] `server.js`+`index.html`+`validation.test.js` 3파일만 변경(admin/upload/cohort.html·API 로직 불변), innerHTML 미사용
- [ ] wo/029에만 커밋 + TURN_LOG 완료 헤더

## 금지 사항
- 절대 금지 블록: push·main 머지·배포·terraform plan/apply·aws CLI 금지(검증자 전담)
- 코호트명/팀 구성/카테고리 등 기존 데이터 변경 금지(일자 추가만). 새 API·새 라우트 만들지 말 것
- admin.html·upload.html·cohort.html·view.html 수정 금지(홈 카드 표기만)
- innerHTML 금지, 외부 라이브러리 금지
- 브라우저 검증 과잉 루프 금지(WO-023 환류): 코더는 npm test 그린 + 구조 단언까지. 시각 확인은 검증자(Claude)
