# Handoff

## Current handoff summary
WO-030(코호트 추가) 검증·머지 완료 — 배포는 WO-031과 배치 대기. WO-031(관리자 추가/다중 관리자)은 Hermes가 `wo/031`에서 구현·커밋 완료(`962d0de`), Claude 검증 대기.

## WO-031 구현 결과 (Coder = Hermes) — 보안 민감
- `registry.js`: `admin#accounts` 집계 아이템과 전용 `.local-admin-accounts.json`(0o600) 기반 `getAdminAccounts`/`addAdminAccount`/`updateAdminAccountPassword` 구현; `.gitignore` 반영.
- `admin-auth.js`: env+account 로그인, 신원 포함 세션/구 토큰 env 폴백, 본인 비번 변경 분기, `addAdmin` 검증·중복·감사를 구현.
- `server.js`: 의존성 주입 및 인증 `POST /api/admin/admins`; `admin.html`: `#adminModal`과 password 초기 비밀번호 필드·상태 UI 배선.
- 비밀값은 저장 시 scrypt hash/salt만 사용하며, 감사는 action과 null contentId만 기록. 특정 계정 시드 없음.
- 검증: focused 20/20, `cd html-delivery && npm test` 44/44, 임시 구조 단언 pass. 브라우저 검증은 미실행(Claude 담당).

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
