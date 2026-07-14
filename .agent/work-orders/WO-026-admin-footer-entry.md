# WO-026: 관리자 진입 푸터 (전 갤러리 페이지 공통)
상태: 검증 대기
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/026` 브랜치

## 목표
공개 갤러리 페이지 하단에 공통 푸터를 추가하고, 그 안에 저채도(muted) '관리자' 링크로
`/admin.html` 진입점을 노출한다. 사용자 확정: **푸터에 작은 '관리자' 링크** (헤더 상시 노출·
로고 숨김 트리거 아님). 로그인은 ID/비번으로 막혀 있어 링크 노출 자체는 보안 위험 아님.

## 설계 결정 (변경 금지)
1. **마크업** — 아래 4개 페이지의 `</body>` 직전(스크립트 뒤, 닫는 태그 앞)에 동일하게 삽입:
   `index.html`, `cohort.html`, `upload.html`, `view.html`.
   admin.html에는 넣지 않는다(이미 관리자 페이지).
   ```html
   <footer class="site-footer"><span>© NXT Cloud · AI 리터러시 콘텐츠 갤러리</span><a class="admin-link" href="/admin.html">관리자</a></footer>
   ```
   - `<main>`이 있는 페이지는 `</main>` **뒤 · `</body>` 앞**에 둔다(푸터는 main 밖).
   - `body>main,body>.site-nav`의 z-index:1 규칙과 동일 층에 오도록, theme.css에서
     `body>.site-footer{position:relative;z-index:1}`도 함께 지정(그리드 배경 위로).
2. **스타일 (theme.css SSOT, 새 규칙만 추가 — 기존 줄 수정 금지)**:
   - `.site-footer{display:flex;align-items:center;justify-content:center;gap:var(--sp-3);
     flex-wrap:wrap;margin-top:calc(var(--sp-8) + var(--sp-8));padding:var(--sp-6) max(5vw,var(--sp-6));
     border-top:1px solid var(--line);color:var(--muted);font-size:13px}`
   - `.site-footer{font-family:ui-monospace,...monospace}` — 기존 mono 셀렉터 목록(라벨류)에
     `.site-footer`를 **덧붙이는 방식**으로 통일 (라벨·메타와 같은 mono 톤).
   - `.admin-link{color:var(--muted);text-decoration:none;padding:var(--sp-1) var(--sp-2);
     border:1px solid transparent;border-radius:8px}`
     `.admin-link:hover{color:var(--text);border-color:var(--line)}`
     — 기본은 눈에 띄지 않게(muted, 보더 투명), hover 시에만 또렷하게.
   - 라이트/다크 양쪽에서 대비 확인. 새 색상 하드코딩 금지 — 기존 변수(`--muted`·`--text`·`--line`)만.
3. **간격**: 임의 px 금지, `--sp-*` 스케일만. 카드 그리드와 푸터 사이 충분한 여백(위 margin-top).
4. **커밋 분리 (최소 2)**: ① feat: 공통 푸터 마크업 4개 페이지 ② style: theme.css 푸터·관리자 링크 스타일.
   (순서 무관하나 각각 독립 커밋)

## 작업 단계
1. theme.css에 푸터·admin-link 규칙 추가 (mono 셀렉터 목록에 `.site-footer` 덧붙임)
2. 4개 페이지에 footer 마크업 삽입 (main 밖·body 안)
3. DRY_RUN 브라우저 실측 (핵심 4개 한정): index 라이트/다크에서 푸터 렌더·대비 / '관리자' 클릭 시
   admin.html 이동 / cohort·view·upload 각 1회 푸터 노출 확인 / 모바일 폭(560px 이하)에서 줄바꿈 정상
4. `npm test` 그린(회귀 없음), TURN_LOG 완료 헤더 + wo/026 커밋

## 완료 기준
- [ ] 4개 페이지 하단에 푸터 노출, '관리자' 링크 → /admin.html 이동
- [ ] muted 기본·hover 또렷, 라이트/다크 대비 정상, 모바일 줄바꿈 정상
- [ ] admin.html에는 푸터 미추가, npm test 그린, 커밋 분리
- [ ] TURN_LOG 완료 헤더 + wo/026에만 커밋

## 금지 사항
- 절대 금지 블록 준수 (plan/apply·aws CLI 금지). 검증은 단독 명령만
- 헤더(site-nav) 수정 금지, 서버 코드·infra·admin.html 수정 금지
- 외부 라이브러리 금지, theme.css 기존 줄 수정 금지(신규 규칙만 추가)
- 새 색상 하드코딩 금지 (기존 CSS 변수만)
