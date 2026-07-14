# Current State

Updated: 2026-07-14 14:40 KST

## Active owners
- Hermes (Coder): WO-029 수업별 카드 일자 표기 — `wo/029` 착수 대기
- Claude (Planner/Verifier): WO-028 검증·머지 완료(배포 대기), WO-029 발행, main 소유

## Last verified repo state
- Branch: `main` HEAD `9992c16 docs: WO-028 검증 대기 기록` (WO-028 ff 머지 반영) → WO-028 완료·WO-029 발행 커밋 예정
- Tests last run: `npm test` in `html-delivery` → 38/38 pass (WO-028 검증 시점)

## Completed
- WO-001~WO-026 완료 및 프로덕션 배포
- WO-027 완료: 관리자 로그인 비밀번호 변경. main 머지 + Lambda 배포 + 프로덕션 실측 통과.
- WO-028 검증·머지 완료(배포 대기): 관리자 페이지 UI 정돈 — 비번 변경을 상단 툴바 버튼→`<dialog id="passwordModal">` 모달화(사이드바 인라인 폼 제거), `.table-wrap{overflow-x:auto}`+동작 컬럼 2×2 줄바꿈으로 표 오버플로 봉합. 검증: npm test 38/38, 구조 단언(overflow-x:auto 존재/visible·innerHTML 부재/dialog·trigger 존재), Chrome DRY_RUN 시각 실측(툴바 버튼→모달 개폐, 표·삭제 버튼 패널 내부). **프로덕션 배포는 사용자 승인 대기**(정적 자산이므로 Lambda 재배포 필요).

## In progress
- WO-029: 수업별 모아보기 카드 일자 표기 — 발행됨, Hermes 착수 대기.
  범위: `server.js`(COHORT_DATES + cohortOptions date) + `index.html`(renderCohorts 일자) + `validation.test.js`(deepEqual) 3파일.
  일자: 고대세종-ai `6.24~25` / 아이디어톤 `6.26` / 기업인턴십 `7.1~31` / 국민대-ai워크플로우 `6.24~30` / 서남-해커톤 `7.10` / 한이음-ai-중급 `7.12`.

## Next safe action
1. Hermes: WO-029 구현 → `npm test` 그린 → wo/029 커밋 + TURN_LOG 완료 헤더(검증 대기).
2. Claude: WO-028 프로덕션 배포는 사용자 승인 후. WO-029 완료 시 검증(diff·npm test·Chrome) → 머지 → 배포(WO-028과 배치 가능).
