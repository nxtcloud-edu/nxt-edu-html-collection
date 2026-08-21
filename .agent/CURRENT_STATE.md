# Current State

Updated: 2026-08-21 15:10 KST

## Active owners
- Codex: 사용자 지시에 따라 별도 Hermes 세션·워크오더 없이 현재 main 워크트리에서 직접 작업.
- Hermes: 이번 변경에 관여하지 않음.

## Last verified repo state
- Branch: `main`, Phase 6 구현 커밋까지 origin/main 동기화.
- Worktree: clean. 운영 데이터 변경 없음.
- Tests: Phase 6 전체 `npm test` 75/75.
- Terraform: Phase 6 Lambda 코드 1건을 in-place apply. 최신 저장소 archive 재적용 후 최종 plan no changes.
- Prod: v2 코호트 15개, 콘텐츠 283개(게임 182·웹 101), 코호트 누락·민감 필드 노출 0. 레거시 283개 유지. 운영 갤러리와 두 업로드 탭 렌더링 확인.
- User verification: 사용자가 운영 환경에서 실제 코호트 ZIP 다운로드를 직접 검증했다고 확인.

## Completed
- 관리자 코호트별 최신 HTML ZIP 다운로드 구현·배포 완료.
- ZIP 내부 파일명: 순번·이름/팀명·제목·최신 버전. `manifest.csv`와 `manifest.json` 포함.
- 운영 ZIP은 동일 S3 버킷의 비공개 `exports/`에 저장하고 15분 서명 URL로 제공, 수명주기 1일.
- 개편 Phase 1 완료: v2 콘텐츠·코호트·버전 모델, API 호환 계약, S3 무삭제 마이그레이션 게이트와 전체 로드맵 문서화.
- 개편 Phase 2 완료: 콘텐츠 domain normalizer·legacy adapter·repository 경계 도입, 기존 API와 S3 키 불변.
- 개편 Phase 3 완료: 인증된 관리자 화면에서 코호트별 콘텐츠 수·게임/웹페이지·누적 버전·최신 수정·저장 키 방식·ZIP 준비 상태 확인 가능.
- 개편 Phase 4 완료: 코드 배포 후 코호트 9개·콘텐츠 283개 additive backfill 성공. 재 dry-run 갱신 대상 0, unresolved/conflict 0.
- 개편 Phase 5 완료: 신규 콘텐츠 `contents/*`, 레거시 버전 `games/*` 고정, 이중 키 조회·ZIP·삭제와 권한 정책 반영 및 운영 E2E 통과.
- 개편 Phase 6 완료: v2 공개 조회·항상 신규 생성·명시적 버전 추가 API와 학생·갤러리 UX 전환을 배포. 레거시 API·공유 URL 유지.

## Next safe action
1. Phase 7 기존 S3 객체 복사 마이그레이션의 읽기 전용 inventory·size·SHA-256 검증 도구부터 구현한다. 복사 apply와 삭제는 별도다.
