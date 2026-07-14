# Handoff

## Current handoff summary
WO-030(코호트 추가) 검증·머지 완료 — 배포는 WO-031과 배치 대기. WO-031(관리자 추가/다중 관리자) 발행, Hermes가 `wo/031`에서 구현.

## WO-031 지시 (Coder = Hermes) — 보안 민감
단일 admin(env)→다중 관리자. 전원 동등 권한. 추가만(삭제·등급 없음).
1. `registry.js`: `getAdminAccounts`/`addAdminAccount`/`updateAdminAccountPassword` (DynamoDB `admin#accounts` 집계 아이템 + DRY_RUN `.local-admin-accounts.json` mode 0o600). `.gitignore` 추가.
2. `admin-auth.js`: 세션 토큰 payload에 `id` 추가, `requireAdmin`가 `req.adminId=payload.id??config.id`(구 토큰 폴백). `login` 다중 조회(env admin + account). `changePassword` 라우팅(env=saveAdminCredential, account=updateAdminAccountPassword). 신규 `addAdmin`(id 형식·중복 409·비번 8~72, 감사 `add-admin`).
3. `server.js`: deps 주입 + `POST /api/admin/admins`.
4. `admin.html`: `.site-tools`에 `관리자 추가` 버튼 → `<dialog id="adminModal">`(아이디+초기비번 type=password) → 성공 시 status. textContent만.
- **평문/해시/솔트를 로그·감사·저널·코드에 남기지 말 것.** scrypt 해시만 저장. 내장 crypto만.
- karin.kim/ella.kim 등 특정 계정 시드 금지 — 기능만. 범위: registry+admin-auth+server+admin.html+.gitignore+테스트.

## Verification 계획 (Verifier = Claude)
1. diff 범위(위 파일만). 감사/로그/코드에 평문·해시·솔트 미노출 확인.
2. `cd html-delivery && npm test` 전체 그린.
3. Chrome DRY_RUN: env admin 로그인 → 관리자 추가(id+비번) → 로그아웃 → 새 관리자로 로그인 → 본인 비번 변경 → 새 비번 로그인.
4. 통과 시 머지 → **WO-030+WO-031 배치 Lambda 배포**.
5. 배포 후: 사용자가 관리자 페이지에서 karin.kim/ella.kim 추가.

## Collision risks / 금지 (상시)
- push·main 머지·terraform·aws·배포는 Coder 금지(검증자 전담).
- 계정 생성·비밀번호 입력은 Claude 직접 수행 불가(안전 원칙) — WO-031은 기능만, 실제 karin/ella 추가는 사용자.
- 브라우저 검증 과잉 루프 금지(WO-023): 코더는 npm test 그린 + 구조 단언까지. 시각 확인은 검증자.

## 운영 메모 (세션 함정)
- Hermes 런타임: 세션 중 파일 갱신 시 구모듈 캐시로 초기화 실패 → `/quit` 후 `hermes` 재기동.
- 완료 감지: watcher 신호가 플래너 "WO-NNN 발행" 헤더와 겹쳐 조기 오탐 가능 → TURN_LOG 커밋 여부 + 세션 `Ctrl+C cancel` 소멸(ASCII)로 판정.
- tmux `grep "❯"` 유휴판정은 로케일 탓 멀티바이트 실패 — 직접 입력 후 캡처 확인. Chrome은 스크린샷/뷰포트 좌표 스케일 불일치 있음 → ref 기반 form_input/click 사용.
