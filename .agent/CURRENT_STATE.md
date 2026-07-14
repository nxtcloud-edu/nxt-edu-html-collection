# Current State

Updated: 2026-07-14 15:55 KST

## Active owners
- Hermes (Coder): WO-031 관리자 추가(다중 관리자) — `wo/031` 착수 대기
- Claude (Planner/Verifier): WO-030 검증·머지 완료(배포 대기), WO-031 발행, main 소유

## Last verified repo state
- Branch: `main` HEAD `7db4b1d` (WO-030 ff 머지) → WO-030 완료·WO-031 발행 커밋 예정
- Prod: https://showcase.nxtcloud.kr (WO-028·029 라이브; WO-030·031 미배포)

## Completed
- WO-001~WO-027 완료 및 배포
- WO-028 완료·배포: 관리자 UI 정돈. WO-029 완료·배포: 홈 카드 일자.
- WO-030 검증·머지 완료(배포 대기, WO-031과 배치): 관리자 페이지 코호트 추가(이름+일자, base+DynamoDB `cohort#custom` 병합, `cohortOptions` async, `POST /api/admin/cohorts`, admin.html 모달). 검증: npm test 41/41 + Chrome DRY_RUN(추가→7개·영속·갤러리 미유출).

## In progress
- WO-031: 관리자 추가(다중 관리자) — 발행됨, Hermes 착수 대기.
  단일 admin(env)→다중(DynamoDB `admin#accounts` 계정, 모두 동등). 로그인 시 env+account 조회, 세션 토큰에 신원, 본인 비번 변경 라우팅, `POST /api/admin/admins`(id+초기비번), admin.html 관리자 추가 모달. 비번 scrypt 해시만, 평문/해시/솔트 로그·감사 금지. karin/ella는 배포 후 사용자가 UI로 추가.

## Next safe action
1. Hermes: WO-031 구현 → `npm test` 그린 → wo/031 커밋 + TURN_LOG 완료 헤더(검증 대기).
2. Claude: 검증(diff·npm test·Chrome 다중로그인·관리자추가·본인비번변경) → 머지 → **WO-030+WO-031 배치 배포**(Lambda 1회).
3. 배포 후 사용자: 관리자 페이지에서 karin.kim/ella.kim 추가(초기 비번 설정).
