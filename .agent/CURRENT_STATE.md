# Current State

Updated: 2026-07-17 01:00 KST

## Active owners
- Hermes (Coder): 유휴 — `hermes/idle` 파킹. 다음 WO 시 `wo/NNN` 분기 재개.
- Claude (Planner/Verifier): WO-032 검증·머지 완료(배포 대기, 사용자 승인), main 소유.

## Last verified repo state
- Branch: `main` HEAD `4ee3768`(WO-032 머지) → 완료 처리 커밋 예정
- Tests: `npm test` 46/46. Prod: https://showcase.nxtcloud.kr (WO-001~031 라이브; WO-032 미배포)

## Completed
- WO-001~WO-029 완료 및 배포
- WO-030 완료·배포: 관리자 코호트 추가. WO-031 완료·배포: 다중 관리자.
- WO-032 완료·배포: 업로드 흐름 개선 — ① 성공 시 `window.location.assign(data.url)`로 뷰어 즉시 이동 ② cohort.html 업로드 버튼(`upload.html?c=<코호트>`)+미리선택 ③ `findByIdentity`에 title 포함(같은 이름+다른 제목=새 콘텐츠). 사용자 승인 후 Lambda 배포, 프로덕션 정적 실측 통과. server.js 불변.

## In progress
- (없음) — 다음 지시 대기.

## Next safe action
1. 사용자 대기 액션: admin.html에서 karin.kim/ella.kim 추가(WO-031).
2. 새 WO 발행 시: 명령서 커밋 → `git -C <coder-worktree> checkout -b wo/NNN main` → Hermes 착수 지시.
3. 프로덕션 배포는 매번 사용자 명시 승인 후.
