# Handoff

## Current handoff summary
WO-030(관리자 페이지 코호트 추가) Hermes 구현 완료. `wo/030`의 `f25ce98`에서 registry/server/admin UI와 테스트를 반영했으며 Claude 독립 검증을 대기한다. WO-031(관리자 추가/다중 관리자)은 WO-030 머지 후 발행 예정.

## WO-030 구현 결과
코호트를 base(하드코딩)+custom(DynamoDB) 병합 구조로 확장, 관리자가 이름+일자로 추가.
1. `registry.js`: `getCustomCohorts`/`addCustomCohort` (DynamoDB `cohort#custom` 집계 아이템 + DRY_RUN `.local-cohorts.json`). `.gitignore` 추가.
2. `server.js`: `cohortOptions()` async 병합(base+custom), `/api/cohorts` await, `validateUploadInput`/`validateAdminContentPatch`에 선택적 `validAffiliations=COHORTS` 파라미터(후방호환), 업로드/패치 라우트가 병합 이름 전달, `POST /api/admin/cohorts`(requireAdmin, 이름 1~60·중복 409·일자≤20, 감사 `add-cohort`).
3. `admin.html`: 필터 aside에 `코호트 추가` 버튼 → `<dialog id="cohortModal">`(이름+일자) → 성공 시 loadData 갱신. textContent만.
4. 테스트: cohortOptions deepEqual `await`화, registry 커스텀 코호트, POST 라우트 검증, 업로드 custom 수용. `npm test` 그린.
- 범위: registry.js + server.js + admin.html + .gitignore + 테스트. index/upload.html 불필요(데이터 자동 노출). 인프라/IAM/env/새 테이블 금지. 편집·삭제 금지(추가만).

## Verification 계획 (Verifier = Claude)
1. diff 범위 확인(위 파일만).
2. `cd html-delivery && npm test` 전체 그린.
3. Chrome DRY_RUN: 관리자 로그인 → 코호트 추가(이름+일자) → 필터·홈 카드 반영 확인.
4. 통과 시 머지. 배포는 WO-031과 배치할지 사용자 확인 후.

## Coder verification
- `cd html-delivery && npm test` → 41/41 pass.
- ad-hoc 구조 단언: `cohort#custom` 전용 저장/exports, async `cohortOptions`, 인증 코호트 POST, validAffiliations 후방호환, admin cohort dialog/submit/textContent, `innerHTML` 부재 통과.
- 브라우저 시각 검증은 WO 지시대로 실행 안 함(Claude 담당).

## Collision risks / 금지 (상시)
- push·main 머지·terraform·aws·배포는 Coder 금지(검증자 전담).
- 브라우저 검증 과잉 루프 금지(WO-023): 코더는 npm test 그린 + 구조 단언까지. 시각 확인은 검증자.
- 계정 생성·비밀번호 입력은 Claude가 직접 수행 불가(안전 원칙) — WO-031은 기능만, karin/ella 추가는 사용자.

## 운영 메모 (세션 함정)
- Hermes 런타임: 세션 중 파일 갱신 시 구모듈 캐시로 초기화 실패 → `/quit` 후 `hermes` 재기동.
- 완료 감지: `watcher.sh` 신호가 플래너 "WO-NNN 발행" 헤더와 겹쳐 조기 오탐 가능 → TURN_LOG 커밋 여부 + 세션 `Ctrl+C cancel` 소멸(ASCII)로 판정이 안전.
- `tmux` `grep "❯"` 유휴판정은 로케일 탓 멀티바이트 매칭 실패 — 직접 입력 후 캡처 확인.
