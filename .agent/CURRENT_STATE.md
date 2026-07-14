# Current State

Updated: 2026-07-14 15:04 KST

## Active owners
- Hermes (Coder): 유휴 — `wo/029` 완료 후 `hermes/idle`로 파킹. 다음 WO 시 `wo/NNN` 분기 재개.
- Claude (Planner/Verifier): WO-028·WO-029 검증·머지·배포 완료, main 소유.

## Last verified repo state
- Branch: `main` HEAD `d1611eb` + WO-028·029 완료 처리 커밋 예정
- Tests last run: `npm test` in `html-delivery` → 38/38 pass
- Deploy: `terraform -chdir=infra apply` → Lambda `nxt-ai-literacy-uploader` 코드 갱신(0 add/1 change/0 destroy). 프로덕션 https://showcase.nxtcloud.kr 실측 통과.

## Completed
- WO-001~WO-026 완료 및 프로덕션 배포
- WO-027 완료: 관리자 로그인 비밀번호 변경.
- WO-028 완료·배포: 관리자 페이지 UI 정돈 — 비번 변경을 상단 툴바 버튼→`<dialog id="passwordModal">` 모달화(사이드바 인라인 폼 제거), `.table-wrap{overflow-x:auto}`+동작 컬럼 2×2 줄바꿈으로 표 오버플로 봉합. 프로덕션 admin.html 실측(passwordModal·openPasswordButton·overflow-x:auto 존재, visible 부재).
- WO-029 완료·배포: 홈 `수업별 모아보기` 카드에 수업 일자 표기(server.js `COHORT_DATES` + `cohortOptions().date` + index.html `renderCohorts` `.cohort-date`). 프로덕션 `/api/cohorts` 6개 일자 실측: 고대세종-ai 6.24~25 / 한이음-ai-중급 7.12 / 고대세종-기업인턴십 7.1~31 / 고대세종-아이디어톤 6.26 / 국민대-ai워크플로우 6.24~30 / 서남-해커톤 7.10.

## In progress
- (없음) — 다음 지시 대기.

## Next safe action
1. 새 WO 발행 시: 명령서 커밋 → `git -C <coder-worktree> checkout -b wo/NNN main` → 착수 지시(Hermes 세션 `ai-literacy-hermes`).
2. 저장소 정리 여지: 머지 완료된 `wo/028`·`wo/029` 브랜치 삭제(선택).
