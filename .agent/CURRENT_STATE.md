# Current State

Updated: 2026-07-14 16:49 KST

## Active owners
- Hermes (Coder): 유휴 — `hermes/idle` 파킹. 다음 WO 시 `wo/NNN` 분기 재개.
- Claude (Planner/Verifier): WO-030·WO-031 검증·머지·배포 완료, main 소유.

## Last verified repo state
- Branch: `main` HEAD `cfbf8d5` + 완료 처리 커밋 예정
- Tests: `npm test` in `html-delivery` → 44/44 pass
- Deploy: `terraform apply`(사용자 명시 승인) → Lambda 코드 갱신(0/1/0). 프로덕션 https://showcase.nxtcloud.kr 실측 통과.

## Completed
- WO-001~WO-029 완료 및 배포
- WO-030 완료·배포: 관리자 페이지 코호트 추가(이름+일자, base+DynamoDB `cohort#custom` 병합, `cohortOptions` async, `POST /api/admin/cohorts`, admin.html 모달). 프로덕션 cohortModal·인증 게이트 실측.
- WO-031 완료·배포: 다중 관리자(단일 env→다중). `admin#accounts` 저장, env+account 로그인·신원 세션·본인 비번 변경 라우팅, `POST /api/admin/admins`(id 형식·중복 409·비번 8~72), admin.html 관리자 추가 모달. scrypt 해시만 저장(0600), 감사 무유출. 프로덕션 adminModal·POST 401 실측.

## In progress
- (없음) — 다음 지시 대기.

## Next safe action
1. **사용자 액션**: 관리자 페이지(https://showcase.nxtcloud.kr/admin.html) → env admin 로그인 → `관리자 추가`로 karin.kim / ella.kim 추가(각 초기 비밀번호 설정). 이후 본인 로그인·비번 변경 가능. (계정 생성·비번 입력은 안전 원칙상 Claude 수행 불가.)
2. 새 WO 발행 시: 명령서 커밋 → `git -C <coder-worktree> checkout -b wo/NNN main` → Hermes 세션 착수 지시.
