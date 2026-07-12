# Handoff

## Current handoff summary
WO-001(run-game 횡스크롤 러너 ver1)이 발행되어 Hermes가 `wo/001` 브랜치에서 작업한다.
스펙과 금지 사항은 `.agent/work-orders/WO-001-run-game-ver1.md`가 SSOT.
box-game/game-ver1.html은 읽기 전용 참조 기준이다 — 수정 금지.

## First things to do before any next edit
```bash
git status --short --branch
git log -1 --pretty=format:'%h %s'
```

## Next recommended project actions
1. (Hermes) 완료 신호 확정 — TURN_LOG 완료 헤더 + wo/001 커밋
2. (Claude) 완료 신호 감지 → 추가 브라우저 실측 검증 → main 머지
3. (Claude) WO-002 html-delivery 발행 (S3 업로드·배포 운영 프로그램)

## Collision risks
- Hermes는 기본 모드 구동 — dangerous-command 프롬프트는 60초 내 사람이 tmux attach로 승인 필요 (Gotcha 8)
- 전 스위트/포트 사용 작업은 한 번에 하나만 (현재는 정적 html이라 해당 없음)
