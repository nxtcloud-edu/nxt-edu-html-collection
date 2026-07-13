#!/bin/sh
# 유휴 프롬프트일 때만 tmux send-keys (작업 중 입력 = 인터럽트 방지).
# copy-mode 가드 포함 (send-keys가 조용히 먹히는 함정 대응).
# 사용: tmux-send-safe.sh <session> "<text>" [--enter] [--timeout <sec>]
set -eu
SESSION=${1:?session}; TEXT=${2:?text}; shift 2
ENTER=""; TIMEOUT=300
while [ $# -gt 0 ]; do case "$1" in
  --enter) ENTER=1; shift ;;
  --timeout) TIMEOUT=${2:?}; shift 2 ;;
  *) echo "알 수 없는 인자: $1" >&2; exit 2 ;;
esac; done

# copy-mode면 해제
if [ "$(tmux display-message -p -t "$SESSION" '#{pane_in_mode}')" = "1" ]; then
  tmux send-keys -t "$SESSION" -X cancel
fi

WAITED=0
while [ $WAITED -lt $TIMEOUT ]; do
  PANE=$(tmux capture-pane -t "$SESSION" -p | tail -5)
  # 유휴 판정: 프롬프트(❯) 노출 + 활성 턴 마커(경과 타이머 ⏱, 압축 중) 부재
  # 주의: 힌트 바의 "msg=interrupt"는 상시 표시 — busy 패턴에 쓰면 영구 대기 (GOTCHAS 3)
  if echo "$PANE" | grep -q "❯" && ! echo "$PANE" | grep -qE "⏱|Compacting"; then
    tmux send-keys -t "$SESSION" "$TEXT"
    [ -n "$ENTER" ] && tmux send-keys -t "$SESSION" Enter
    echo "전송 완료(${WAITED}s 대기): $SESSION"
    exit 0
  fi
  sleep 5; WAITED=$((WAITED+5))
done
echo "타임아웃: ${TIMEOUT}s 동안 유휴 프롬프트 미확인" >&2
exit 1
