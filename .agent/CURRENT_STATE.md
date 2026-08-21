# Current State

Updated: 2026-08-21 14:04 KST

## Active owners
- Codex: 사용자 지시에 따라 별도 Hermes 세션·워크오더 없이 현재 main 워크트리에서 직접 작업.
- Hermes: 이번 변경에 관여하지 않음.

## Last verified repo state
- Branch: `main`, Phase 5 구현과 배포 상태 문서까지 origin/main 동기화.
- Worktree: clean. 기존 운영 S3 객체 복사·이동·삭제 없음.
- Tests: Phase 5 전체 `npm test` 73/73.
- Terraform: Phase 5 S3 공개 정책·Lambda IAM·Lambda 코드 3개를 in-place apply. 최종 plan no changes.
- Prod: health 200, 콘텐츠 283개 모두 `cohortId` 존재, 기존 `games/*` 키 283개 유지. 인앱 브라우저에서 갤러리 283개·유형 필터·29페이지 페이징과 관리자 로그인 화면 렌더링 확인.
- User verification: 사용자가 운영 환경에서 실제 코호트 ZIP 다운로드를 직접 검증했다고 확인.

## Completed
- 관리자 코호트별 최신 HTML ZIP 다운로드 구현·배포 완료.
- ZIP 내부 파일명: 순번·이름/팀명·제목·최신 버전. `manifest.csv`와 `manifest.json` 포함.
- 운영 ZIP은 동일 S3 버킷의 비공개 `exports/`에 저장하고 15분 서명 URL로 제공, 수명주기 1일.
- 개편 Phase 1 완료: v2 콘텐츠·코호트·버전 모델, API 호환 계약, S3 무삭제 마이그레이션 게이트와 전체 로드맵 문서화.
- 개편 Phase 2 완료: 콘텐츠 domain normalizer·legacy adapter·repository 경계 도입, 기존 API와 S3 키 불변.
- 개편 Phase 3 완료: 인증된 관리자 화면에서 코호트별 콘텐츠 수·게임/웹페이지·누적 버전·최신 수정·저장 키 방식·ZIP 준비 상태 확인 가능.
- 개편 Phase 4 완료: 코드 배포 후 코호트 9개·콘텐츠 283개 additive backfill 성공. 재 dry-run 갱신 대상 0, unresolved/conflict 0.
- 개편 Phase 5 구현·배포 완료: 신규 콘텐츠 `contents/*`, 레거시 버전 `games/*` 고정, 이중 키 조회·ZIP·삭제와 권한 정책 반영. 기존 283개 객체·키 불변 확인.

## Next safe action
1. Phase 6 시작 전 운영 신규 콘텐츠 1건의 생성·버전 추가·ZIP·삭제 E2E를 별도 테스트 데이터로 수행한다.
