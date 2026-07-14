# Handoff

## Current handoff summary
WO-028(관리자 UI 정돈)·WO-029(수업별 카드 일자 표기) 모두 검증·머지·배포 완료. 프로덕션(https://showcase.nxtcloud.kr) 라이브 확인. 진행 중 WO 없음 — 다음 지시 대기. 코더 워크트리는 `hermes/idle`로 파킹.

## 방금 배포 (배치)
- `terraform -chdir=infra apply` → `aws_lambda_function.uploader` in-place 갱신(source_code_hash), 0 add/1 change/0 destroy. IAM/S3/CloudFront/Route53 변경 없음.
- 프로덕션 실측: admin.html에 `passwordModal`·`openPasswordButton`·`overflow-x:auto` 존재·`overflow-x:visible` 부재; `/api/cohorts` 6개 일자 노출; 홈 200.

## 다음 안전 액션
- 새 WO: 명령서 커밋 → `git -C <coder-worktree> checkout -b wo/NNN main` → Hermes 세션 `ai-literacy-hermes`에 착수 지시.
- 코더 워크트리는 `hermes/idle`(=main) 파킹 상태. 게이트(`.agent-coder-guard`)·훅·저널 유지.
- 정리 여지: 머지된 `wo/028`·`wo/029` 브랜치 삭제(선택).

## 운영 메모 (이번 세션 함정)
- Hermes 런타임은 파일이 세션 도중 갱신되면(예: 부분 update) 구모듈 캐시로 `cannot import name ...` 초기화 실패 → **프로세스 재시작**이 해결책(`/quit` 후 `hermes` 재기동).
- 완료 감지: `.agent/scripts/watcher.sh`의 신호 grep은 **플래너 발행 헤더("WO-NNN 발행")와 겹쳐 조기 오탐** 가능. TURN_LOG 커밋 여부 + 세션 활성표시(`Ctrl+C cancel`) 소멸(ASCII, 로케일 무관)로 판정하는 편이 안전.
- `tmux send-keys`의 `grep "❯"` 유휴판정은 이 환경 로케일에서 멀티바이트 매칭 실패 — 직접 입력 후 캡처로 확인.

## Collision risks / 금지 (상시)
- push·main 머지·terraform plan/apply·aws CLI·배포는 Coder 금지(검증자 전담).
- 브라우저 검증 과잉 루프 금지(WO-023 환류): 코더는 npm test 그린 + 구조 단언까지. 시각 확인은 검증자.
