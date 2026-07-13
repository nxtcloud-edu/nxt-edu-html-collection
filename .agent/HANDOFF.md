# Handoff

## Current handoff summary
WO-016에서 `cohort.html`의 `← 갤러리` 링크를 네비 우측에서 제거하고 `N개의 콘텐츠` 요약 바로 다음 요소로 옮겼다. 문구는 `← 갤러리로 돌아가기`이며 기존 muted/hover accent를 유지하고 `min-height:44px`, 세로 padding 8px로 터치 타깃을 확보했다.

## Verification evidence
- 라이트: nav 내부 `.back` 없음, site-tools 텍스트는 테마 토글만, `summary.nextElementSibling === back`
- 다크: 동일 DOM 위치, muted 색 `rgb(174,181,204)`, 테마 저장 유지
- 링크 `min-height:44px`, padding `8px 0`
- 라이트 시각 캡처에서 요약 바로 아래 독립 줄 배치 확인
- `npm test`: 16/16 통과
- 브라우저 console/JS 오류 0
- 다른 HTML·theme.css·서버·infra diff 없음
- 검증 서버 종료, background process 0건

## Commit
- 현재 HEAD는 단일 목적 `fix: 코호트 갤러리 복귀 링크 위치 조정` 커밋

## Next recommended project actions
1. cohort 네비 우측에 토글만 남았는지 확인
2. 라이트/다크에서 요약 아래 링크 위치·색상·터치 타깃 재확인
3. main 머지 후 프로덕션 코호트 페이지 확인

## Collision risks
- view/upload 복귀 링크는 스코프에 따라 미수정
- 실제 배포·프로덕션 접속·push 미실행
