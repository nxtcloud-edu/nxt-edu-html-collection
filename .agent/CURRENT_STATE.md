# Current State

Updated: 2026-07-14 13:38 KST

## Active owners
- Hermes (Coder): WO-028 관리자 UI 정돈(비번 모달화 + 표 오버플로 봉합) — `wo/028` 착수 대기
- Claude (Planner/Verifier): WO-028 발행 완료, 구현 후 검증·머지·배포 담당, main 소유

## Last verified repo state
- Branch: `main` (코더 워크트리는 `wo/028`로 분기 예정, main 기준)
- HEAD: `eb98a32 docs: WO-027 완료 처리` → WO-028 발행 커밋 예정
- Tests last run: `npm test` in `html-delivery` → 38/38 pass (WO-027 검증 시점)

## Completed
- WO-001~WO-026 완료 및 프로덕션 배포
- WO-027 완료: 관리자 로그인 비밀번호 변경(오버라이드 저장·override-first 로그인·change-password API·admin.html 패널). main 머지 + Lambda 배포 + 프로덕션 비파괴 실측 통과 (검증자 Claude).

## In progress
- WO-028: 관리자 페이지 UI 정돈 — 발행됨, Hermes 착수 대기.
  범위: 순수 프론트(`html-delivery/public/admin.html` + `html-delivery/test/admin-ui.test.js`)만.
  ① 비번 변경 폼 → 상단 툴바 버튼(로그아웃 옆) → 네이티브 `<dialog id="passwordModal">` 모달, 사이드바 인라인 폼 제거.
  ② `.table-wrap{overflow-x:auto}` + 동작 컬럼 폭 조정으로 표 헤더·삭제 버튼의 패널 밖 오버플로 봉합.
  백엔드/API/인프라 불변, `/api/admin/change-password` 호출 그대로.

## Next safe action
1. Hermes: WO-028 구현 → `npm test` 그린 → wo/028 커밋 + TURN_LOG 완료 헤더 (검증 대기).
2. Claude: 구현 후 diff(admin.html+test만) 확인, `npm test`, Chrome 시각 확인(모달 개폐·무오버플로) → 통과 시 main 머지 + Lambda 재배포.
