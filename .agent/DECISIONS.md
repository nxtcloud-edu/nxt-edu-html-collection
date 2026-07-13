# Coordination Decisions

This file records decisions about how multiple agents coordinate in this repository.
Product decisions remain in docs/planning/DECISIONS.md.

## Decisions

| Date | Decision | Reason | Impact |
|---|---|---|---|
| 2026-07-12 | agent-share full 모드 채택 (저널+명령서+워크트리 게이트+tmux 직접 제어) | Planner(Claude)-Coder(Hermes) 분업 지속 예정, goods-bank 실증 패턴 재사용 | 미검증 코드의 main 진입을 훅이 물리 차단 |
| 2026-07-12 | Hermes는 기본 모드 구동 (`--yolo` 보류) | Claude Code 권한 분류기가 --yolo 기동 거부 — 사용자 명시 승인 없음 | dangerous-command 프롬프트(60초 타임아웃 자동 거부, Gotcha 8)는 사람이 tmux attach로 승인. 무인 루프 필요 시 사용자 승인 후 --yolo 전환 |
| 2026-07-12 | tmux 세션명 `ai-literacy-hermes` (사용자 지정) | 다른 프로젝트의 hermes 세션들과 구분 | 워처·send-safe 호출 시 이 세션명 사용 |
| 2026-07-13 | 협업 스크립트(tmux-send-safe·watcher)를 `.agent/scripts/`로 **프로젝트 내재화** | 글로벌 하네스 재구성으로 agent-share 스킬·스크립트가 제거됨 | 협업 인프라가 외부 하네스 변동에 독립 — 검증된 로직(완료 헤더 고정·커밋 스냅샷 검사·copy-mode 가드)을 레포에 고정 |

<!-- 위반 기록도 여기: 주체 확정 후에만 공식 기재, 회고 문서로 재캘리브레이션 -->

## Open coordination questions
- <미결 질문>
