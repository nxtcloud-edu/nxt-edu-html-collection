# Turn Log

Append-only log of meaningful agent turns. Keep entries concise and factual.

- 읽기: 턴 시작 시 최근 엔트리만 tail로 읽는다. 현재 상태의 출처는 CURRENT_STATE / HANDOFF.
- 로테이션: 500줄 초과 시 검증자가 `TURN_LOG-archive-<yyyymm>.md`로 이관 (최근 10턴만 유지) —
  단, 모든 WO 브랜치가 main에 머지된 시점에만 (merge=union은 truncate를 부활시킨다).

---

## 2026-07-12 14:11 KST — claude (Planner) — 협업 인프라 셋업

### Intent
- 빈 프로젝트에 agent-share full 모드 인프라 구축 (저널·명령서 채널·워크트리 게이트·tmux 코더 세션)

### Files changed
- `.agent/` 저널 4종 + `work-orders/` 채널 — 템플릿에서 생성 후 프로젝트에 맞게 작성
- `AGENTS.md` — 에이전트 공통 규칙 (Planner=Claude, Coder=Hermes)
- `.gitattributes` — TURN_LOG merge=union

### Commands / verification
- `git init -b main` — 저장소 초기화
- `setup-worktree.sh` — hermes 워크트리 + 가드 훅 (이 턴에서 실행)
- `tmux new-session -s ai-literacy-hermes` — hermes --yolo 기동 (이 턴에서 실행)
- 테스트: 실행 안 함 — 아직 제품 코드 없음

### Decisions / assumptions
- 세션명은 사용자 지정 `ai-literacy-hermes` (스킬 기본 `<agent>` 명명 대신)
- hermes는 --yolo 구동 — 워크트리 격리 + push 차단 훅 전제 (Gotcha 8)

### Handoff
- 사용자가 첫 작업을 정의하면 Claude가 WO-001 발행 → tmux-send-safe.sh로 착수 지시

### Addendum (2026-07-12 14:16 KST)
- 정정: hermes는 `--yolo`가 아니라 **기본 모드**로 기동 — Claude Code 권한 분류기가 --yolo 기동을
  거부(사용자 명시 승인 없음). dangerous-command 프롬프트 발생 시 사람이 `tmux attach -t ai-literacy-hermes`로
  직접 승인. 무인 루프가 필요해지면 사용자 승인 후 --yolo 전환.
- 게이트 실측: pre-commit 가드 (B) 기존 줄 수정 차단 exit 1 확인, 정상 append 통과 확인.
  main 브랜치는 플래너 워크트리가 점유 중이라 코더 워크트리에서 checkout 자체가 불가 (이중 방어).

---

## 2026-07-12 14:25 KST — claude (Planner) — game-ver1.html 분석

### Intent
- 사용자 요청으로 untracked 파일 game-ver1.html 파악 (읽기 전용 분석)

### Files changed
- .agent/TURN_LOG.md — 이 엔트리만

### Commands / verification
- Read game-ver1.html (186줄 전문) — 실행 테스트는 안 함 (브라우저 미기동)

### Decisions / assumptions
- 정체: 바닐라 JS 캔버스 "박스 피하기" 게임, CONFIG 블록 분리 구조 — AI 리터러시 교육 실습 소재로 추정 (ver1 = 반복 개선 시리즈 시작점)
- 발견 이슈: (1) 시작 전 mousemove/touchmove 시 player undefined TypeError (2) delta-time 없음 — 120Hz에서 2배속 (3) 난이도 고정 (4) endGame이 ui.innerHTML 교체로 조작 안내 유실 (5) 최고점수·일시정지 없음
- 파일은 여전히 untracked — 커밋 여부는 첫 WO에서 사용자 방향에 따라 결정

### Handoff
- 사용자가 이 게임 기반 작업 방향을 정하면 WO-001 발행

---

## 2026-07-12 14:40 KST — claude (Planner) — WO-001 발행 (run-game ver1)

### Intent
- 제품 방향 확정분 반영: 3폴더 구조 확정, S3 배포 결정 기록, box-game 배치, WO-001 발행

### Files changed
- docs/planning/DECISIONS.md — 3폴더 구조 + S3 정적 호스팅 결정 추가
- box-game/game-ver1.html — 루트에서 이동 (내용 무변경)
- .agent/work-orders/WO-001-run-game-ver1.md — 신규 발행
- .agent/CURRENT_STATE.md, HANDOFF.md — WO-001 진행 상태로 갱신

### Commands / verification
- git mv 상당 (mv + git add), 커밋 4건 — 테스트: 실행 안 함 (정적 문서·구조 변경만)

### Decisions / assumptions
- WO 순서: WO-001 run-game(소형·협업 루프 캘리브레이션) → WO-002 html-delivery → 안내 문서
- 안내 문서는 html-delivery 완성 후 작성 (업로드 절차를 담아야 하므로)

### Handoff
- Hermes: wo/001에서 WO-001 수행. 완료 신호 = wo/001 커밋 + TURN_LOG 완료 헤더
