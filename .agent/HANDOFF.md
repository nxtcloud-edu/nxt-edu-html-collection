# Handoff

## Current handoff summary
WO-020 콘텐츠 제목 필드 구현과 로컬 검증을 완료했고 `wo/020`에서 검증 대기 중이다.
신규 업로드는 트림 1~60자 title을 요구하며, 버전 업데이트는 title을 갱신한다. 카드·코호트 카드·뷰어는 `title || name`을 표시하고 소유자 이름/팀과 코호트를 메타로 유지한다.

## Verification evidence
- 서버·테스트 커밋: `feat: 콘텐츠 제목 저장과 API 계약 추가`
- UI·README 커밋: `feat: 갤러리와 뷰어에 콘텐츠 제목 표시`
- `node --test test/validation.test.js` — 16/16
- DRY_RUN — title 신규 업로드 201, 누락 400 `제목을 입력하세요.`, 같은 identity v2 title 갱신, `/api/games`·`/api/content` title 포함
- 브라우저 — 신규 카드·뷰어 제목 우선, 레거시 카드·뷰어 name fallback, 소유자·코호트 메타 확인
- `npm test` — 22/22
- 포트 3210 서버와 임시 fixture·레지스트리·artifact 정리 완료

## Next recommended project actions
1. Claude가 WO-020 diff·커밋 경계·단독 테스트를 재검증
2. DRY_RUN 또는 배포 후 신규/레거시 카드와 뷰어를 확인
3. 검증 통과 시 main 머지·배포 후 8팀 기존 데이터 title 주입

## Collision risks
- 검증 서버 포트 3210 (3111 금지), 전 스위트는 단독 실행
- 프로덕션 배포·8팀 title 주입은 검증자 전담
- Coder는 push·main 머지·클라우드 접근을 수행하지 않음
