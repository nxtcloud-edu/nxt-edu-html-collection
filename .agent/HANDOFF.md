# Handoff

## Current handoff summary
WO-030(코호트 추가)·WO-031(관리자 추가/다중 관리자) 검증·머지·배포 완료. 프로덕션(https://showcase.nxtcloud.kr) 라이브. 진행 중 WO 없음. 코더 워크트리 `hermes/idle` 파킹.

## 방금 배포 (WO-030+WO-031 배치, 사용자 명시 승인)
- `terraform apply` → `aws_lambda_function.uploader` in-place(source_code_hash), 0/1/0. IAM/S3/CloudFront/Route53 무변경.
- 프로덕션 실측: admin.html `adminModal`·`openAdminButton`·`cohortModal` 존재; `POST /api/admin/admins`·`/api/admin/cohorts` 미인증 401; `/api/cohorts` 6개(일자); 홈 200.

## 사용자 후속 액션 (필수)
- karin.kim / ella.kim은 **사용자가 직접 추가**: admin.html → env admin 로그인 → `관리자 추가` 버튼 → 아이디(소문자·숫자·점 3~30자) + 초기 비밀번호(8~72자). 추가 후 본인 로그인 → `비밀번호 변경`으로 변경 권장.
- 계정 생성·비밀번호 입력은 안전 원칙상 Claude가 대신 수행 불가.

## 다음 안전 액션 (신규 WO)
- 명령서 커밋 → `git -C <coder-worktree> checkout -b wo/NNN main` → Hermes 세션 `ai-literacy-hermes` 착수 지시.
- 코더 워크트리 `hermes/idle`(=main) 파킹. 게이트·훅·저널 유지. 머지된 wo/030·wo/031 삭제(선택).

## 관리자 인증 구조 (현행)
- env admin(부트스트랩, `ADMIN_ID`+비번 override) + DynamoDB `admin#accounts`(추가 관리자). 전원 동등 권한.
- 세션 토큰 payload `{exp, id}`(HMAC). 로그인 시 env/account 조회, changePassword는 `req.adminId`로 본인 store 라우팅(env=`admin#credential` override, account=`admin#accounts` 갱신).
- 커스텀 코호트 `cohort#custom`. 셋 다 `content#` 아님 → 갤러리 스캔 미노출.

## 금지 (상시)
- push·main 머지·terraform·aws·배포는 Coder 금지(검증자 전담). 프로덕션 배포는 **사용자 명시 승인** 필요.
- 브라우저 검증 과잉 루프 금지(WO-023): 코더는 npm test 그린 + 구조 단언까지. 시각 확인은 검증자.

## 운영 메모 (세션 함정)
- Hermes 런타임: 세션 중 파일 갱신 시 구모듈 캐시 초기화 실패 → `/quit` 후 `hermes` 재기동. 사용량 한도(429)면 모델/플랜 조치 필요.
- 완료 감지: watcher 신호가 플래너 "WO-NNN 발행" 헤더와 겹쳐 조기 오탐 → TURN_LOG 커밋 + 세션 `Ctrl+C cancel` 소멸 + **워킹트리 지문 무변화**(편집 중 오탐 방지)로 판정.
- tmux `grep "❯"` 유휴판정 멀티바이트 실패 — 직접 입력 후 캡처. Chrome은 스크린샷/뷰포트 좌표 스케일 불일치 → ref 기반 form_input/click 사용.
