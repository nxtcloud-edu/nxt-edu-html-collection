# Current State

Updated: 2026-07-14 15:30 KST

## Active owners
- Hermes (Coder): WO-030 코호트 추가 기능 — `wo/030` 착수 대기
- Claude (Planner/Verifier): WO-030 발행(WO-031 관리자 추가 후속 예정), main 소유

## Last verified repo state
- Branch: `main` HEAD `6bc4d29` (WO-028·029 완료·배포) → WO-030 발행 커밋 예정
- Prod: https://showcase.nxtcloud.kr (WO-028 관리자 UI·WO-029 카드 일자 라이브)

## Completed
- WO-001~WO-027 완료 및 배포
- WO-028 완료·배포: 관리자 UI 정돈(비번 변경 모달화, 표 오버플로 봉합).
- WO-029 완료·배포: 홈 수업별 카드 일자 표기.

## In progress
- WO-030: 관리자 페이지 코호트 추가 — 발행됨, Hermes 착수 대기.
  base(하드코딩)+custom(DynamoDB `cohort#custom` 집계 아이템) 병합, `cohortOptions()` async화, `POST /api/admin/cohorts`(이름+일자, 추가만), admin.html `코호트 추가` 모달. DRY_RUN `.local-cohorts.json`. 인프라/IAM/env 불변.

## 후속 (미발행)
- WO-031: 관리자 추가(다중 관리자). 단일 admin(env)→다중(DynamoDB 계정, 모두 동등 권한). "관리자 추가" 기능 구현 후, karin.kim/ella.kim은 사용자가 UI로 직접 추가(계정 생성·비번 설정은 사용자). WO-030 머지 후 발행·디스패치 예정.

## Next safe action
1. Hermes: WO-030 구현 → `npm test` 그린 → wo/030 커밋 + TURN_LOG 완료 헤더(검증 대기).
2. Claude: 검증(diff·npm test·Chrome 코호트 추가 실측) → 머지. 배포는 WO-031과 배치 여부 사용자 확인.
