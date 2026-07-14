# Handoff

## Current handoff summary
WO-028(관리자 UI 정돈)은 검증 통과·main ff 머지 완료 — **프로덕션 배포만 사용자 승인 대기**. 이어서 WO-029(수업별 카드 일자 표기)를 발행, Hermes가 `wo/029`에서 구현한다.

## WO-028 결과 (완료·배포 대기)
- 비번 변경: 상단 `.site-tools` 버튼(`#openPasswordButton`)→네이티브 `<dialog id="passwordModal">` 모달, 사이드바 인라인 폼 제거, `/api/admin/change-password` 불변.
- 표 오버플로: `.table-wrap{overflow-x:auto}` + `.row-actions` 줄바꿈(2×2) + `.actions-cell{white-space:normal;min-width:180px}` → 헤더·삭제 버튼 패널 내부.
- 검증: npm test 38/38, 구조 단언, Chrome DRY_RUN 시각 실측 통과. 커밋 `c8d6559`(feat)+`9992c16`(docs).
- 배포: 정적 자산(admin.html) 변경이라 Lambda 재배포 필요 — 사용자 승인 후 Claude가 수행.

## WO-029 지시 (Coder = Hermes)
1. `server.js`: `TEAM_COHORTS` 옆 `COHORT_DATES` 맵 추가, `cohortOptions()`에 `date` 필드. 값=아래 표.
2. `index.html` `renderCohorts`: 카드에 `cohort.date` 있으면 `.cohort-date` span 추가(textContent, 널 세이프).
3. `validation.test.js`: `cohortOptions()` deepEqual(59~66행)에 `date` 반영. `npm test` 전체 그린.
- 일자: `2026-고대세종-ai`=`6.24~25`, `2026-한이음-ai-중급`=`7.12`, `2026-고대세종-기업인턴십`=`7.1~31`, `2026-고대세종-아이디어톤`=`6.26`, `2026-국민대-ai워크플로우`=`6.24~30`, `2026-서남-해커톤`=`7.10`.
- 범위: server.js + index.html + validation.test.js 3파일. admin/upload/cohort.html·API 로직 불변.

## Verification 계획 (Verifier = Claude)
1. diff 범위: `server.js`·`index.html`·`validation.test.js`만.
2. `cd html-delivery && npm test` 전체 그린.
3. Chrome DRY_RUN: 홈 `수업별 모아보기` 탭 카드 6종에 일자 표기 확인.
4. 통과 시 main 머지 + Lambda 재배포(WO-028과 배치 가능).

## Collision risks / 금지
- push·main 머지·terraform plan/apply·aws CLI·배포는 Coder 금지(검증자 전담).
- WO-029는 코호트명/팀/카테고리 등 기존 데이터 변경 금지(일자 추가만). admin/upload/cohort/view.html·새 API 금지. innerHTML·외부 라이브러리 금지.
- 브라우저 검증 과잉 루프 금지(WO-023 환류): 코더는 npm test 그린 + 구조 단언까지. 시각 확인은 검증자.
