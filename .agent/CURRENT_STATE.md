# Current State

Updated: 2026-07-17 00:57 KST

## Active owners
- Hermes (Coder): WO-032 업로드 흐름 개선 — `wo/032` 구현 완료·검증 대기
- Claude (Planner/Verifier): WO-032 독립 검증·머지 대기, main 소유

## Last verified repo state
- Branch: `wo/032` HEAD `c9d62f3` (WO-032 구현 커밋 예정)
- Prod: https://showcase.nxtcloud.kr (WO-001~031 라이브)

## Completed
- WO-001~WO-029 완료 및 배포
- WO-030 완료·배포: 관리자 코호트 추가. WO-031 완료·배포: 다중 관리자.

## In progress
- WO-032: 업로드 흐름 개선 — Hermes 구현 완료·`npm test` 46/46 통과·검증 대기.
  ① 업로드 성공 시 뷰어(`data.url`)로 즉시 이동(upload.html), URL 누락 시 오류. ② cohort.html 업로드 버튼(`upload.html?c=<코호트>`)과 upload.html 코호트 미리 선택. ③ `registry.js findByIdentity`에 title 포함 → 같은 이름+다른 제목=새 콘텐츠, 같은 제목=비밀번호 확인 후 버전업. server.js·인프라/env 불변.

## Next safe action
1. Claude: WO-032 구현 커밋을 독립 검증(diff 범위·server.js 불변·`npm test`·Chrome 업로드→이동/코호트 버튼/제목별 생성).
2. 통과 시 Claude가 main 머지. 배포는 사용자 명시 승인 후만 수행.
