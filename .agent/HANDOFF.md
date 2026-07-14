# Handoff

## Current handoff summary
WO-026 구현은 `wo/026`에서 완료되어 검증 대기 상태다. 공개 갤러리 4개 페이지
(index·cohort·upload·view)에 공통 푸터를 `main` 밖, `</body>` 앞에 추가했고,
푸터 안의 작은 muted `관리자` 링크는 `/admin.html`로 이동한다. `admin.html`에는 푸터를 넣지 않았다.

구현 커밋:
- `5eb79d7 feat: 공통 푸터 마크업 추가`
- `89bdb3b style: 푸터 관리자 링크 스타일 추가`
- `980516d test: 관리자 푸터 노출 계약 갱신`
- Journal/status docs commit: current HEAD `docs: WO-026 검증 대기 기록`

## Verification already run by Hermes
- `npm test` (`html-delivery`) → 35/35 pass.
- DRY_RUN local browser server: `PORT=4173 DRY_RUN=true npm start`, `http://127.0.0.1:4173`.
- Scoped browser checks (4개 한정):
  1. index light/dark footer render and muted contrast: pass (`.site-footer` body child, previous `SCRIPT`, z-index 1; light `--muted #5b6178`, dark `--muted #aeb5cc`).
  2. 관리자 link route: pass via DOM click → `http://127.0.0.1:4173/admin.html`, admin page has no footer.
  3. cohort/view/upload footer exposure: pass, all body child footers with `/admin.html` href.
  4. 360px iframe mobile probe: pass, footer `flex-wrap: wrap`; admin link wrapped below footer copy.
- DRY_RUN server cleanup: background process killed; `process list` empty.

## Next recommended project actions (Verifier = Claude)
1. Re-check diff scope: public 4 pages + `assets/theme.css` + stale admin UI test contract only.
2. Re-run `npm test` and browser spot checks.
3. If accepted, Claude only: main merge + Lambda redeploy. Hermes must not push/merge/apply.

## Collision risks
- 실 AWS 호출·terraform plan/apply·aws CLI·push·main 머지·배포는 Coder 수행 금지 (검증자 전담)
- 헤더(site-nav)·서버 코드·infra·admin.html 수정 금지
- theme.css 기존 줄은 수정하지 않았고, 신규 footer/admin-link 규칙만 append했다.

## 잔여 권고 (WO 아님)
- 관리자 비밀번호가 팀 공통 비번(12345678aA)과 동일 — 회전 권고(tfvars 교체 + apply). 사용자 결정 대기.
