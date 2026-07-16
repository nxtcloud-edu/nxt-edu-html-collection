# Current State

Updated: 2026-07-17 00:33 KST

## Active owners
- Hermes (Coder): WO-032 업로드 흐름 개선 — `wo/032` 착수 대기
- Claude (Planner/Verifier): WO-032 발행, main 소유

## Last verified repo state
- Branch: `main` HEAD `914df94` (WO-030·031 완료·배포) → WO-032 발행 커밋 예정
- Prod: https://showcase.nxtcloud.kr (WO-001~031 라이브)

## Completed
- WO-001~WO-029 완료 및 배포
- WO-030 완료·배포: 관리자 코호트 추가. WO-031 완료·배포: 다중 관리자.

## In progress
- WO-032: 업로드 흐름 개선 — 발행됨, Hermes 착수 대기.
  ① 업로드 성공 시 뷰어(`data.url`)로 즉시 이동(upload.html). ② cohort.html에 업로드 버튼(`upload.html?c=<코호트>`) + upload.html 코호트 미리 선택. ③ `registry.js findByIdentity`에 title 포함 → 같은 이름+다른 제목=새 콘텐츠, 같은 제목=버전업. server.js 불변, 인프라/env 불변.

## Next safe action
1. Hermes: WO-032 구현 → `npm test` 그린 → wo/032 커밋 + TURN_LOG 완료 헤더(검증 대기).
2. Claude: 검증(diff·npm test·Chrome 업로드→이동·코호트 버튼·제목별 생성) → 머지 → 사용자 승인 후 배포.
