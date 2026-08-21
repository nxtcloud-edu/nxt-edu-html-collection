# Current State

Updated: 2026-08-21 13:56 KST

## Active owners
- Codex: 사용자 지시에 따라 별도 Hermes 세션·워크오더 없이 현재 main 워크트리에서 직접 작업.
- Hermes: 이번 변경에 관여하지 않음.

## Last verified repo state
- Branch: `main`, Phase 1·2·3·4와 운영 상태 문서까지 origin/main 동기화. Phase 5 독립 커밋 완료로 origin/main보다 1커밋 앞섬.
- Worktree: Phase 5 상태 기록까지 같은 커밋에 반영한 뒤 clean 확인 예정. 운영 S3 객체 변경 없음.
- Tests: Phase 5 전체 `npm test` 73/73.
- Terraform: Phase 4 Lambda 코드만 0 add, 1 change, 0 destroy로 apply. 최종 plan no changes.
- Prod: health 200, 코호트 15개와 콘텐츠 283개 모두 `cohortId` 존재, 기존 `games/*` 키 283개 유지. 관리자 현황 UI 200·미인증 API 401.
- User verification: 사용자가 운영 환경에서 실제 코호트 ZIP 다운로드를 직접 검증했다고 확인.

## Completed
- 관리자 코호트별 최신 HTML ZIP 다운로드 구현·배포 완료.
- ZIP 내부 파일명: 순번·이름/팀명·제목·최신 버전. `manifest.csv`와 `manifest.json` 포함.
- 운영 ZIP은 동일 S3 버킷의 비공개 `exports/`에 저장하고 15분 서명 URL로 제공, 수명주기 1일.
- 개편 Phase 1 완료: v2 콘텐츠·코호트·버전 모델, API 호환 계약, S3 무삭제 마이그레이션 게이트와 전체 로드맵 문서화.
- 개편 Phase 2 완료: 콘텐츠 domain normalizer·legacy adapter·repository 경계 도입, 기존 API와 S3 키 불변.
- 개편 Phase 3 완료: 인증된 관리자 화면에서 코호트별 콘텐츠 수·게임/웹페이지·누적 버전·최신 수정·저장 키 방식·ZIP 준비 상태 확인 가능.
- 개편 Phase 4 완료: 코드 배포 후 코호트 9개·콘텐츠 283개 additive backfill 성공. 재 dry-run 갱신 대상 0, unresolved/conflict 0.
- 개편 Phase 5 구현 완료: 신규 콘텐츠 `contents/*`, 레거시 버전 `games/*` 고정, 이중 키 조회·ZIP·삭제와 권한 정책 검증. 미배포.

## Next safe action
1. 별도 배포 승인 시 Terraform plan 0 add·3 change·0 destroy를 재확인하고 운영 신규 콘텐츠 E2E를 수행한다.
