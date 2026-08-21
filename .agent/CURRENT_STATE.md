# Current State

Updated: 2026-08-21 12:51 KST

## Active owners
- Codex: 사용자 지시에 따라 별도 Hermes 세션·워크오더 없이 현재 main 워크트리에서 직접 작업.
- Hermes: 이번 변경에 관여하지 않음.

## Last verified repo state
- Branch: `main`, Phase 1·2 독립 커밋 완료. origin/main보다 2커밋 앞섬.
- Worktree: Phase 2 상태를 같은 커밋에 반영한 뒤 clean 확인 예정. 운영 데이터·S3·Terraform 변경 없음.
- Tests: Phase 2 전체 `npm test` 62/62.
- Terraform: apply 완료(1 add, 4 change, 0 destroy) 후 호환 수정 Lambda 재배포(0 add, 1 change, 0 destroy). 최종 plan no changes.
- Prod: health 200, games 283개, `admin.html` 200 및 ZIP UI/API 코드 확인, 미인증 export API 401, 브라우저 로그인 화면 렌더링 확인.
- User verification: 사용자가 운영 환경에서 실제 코호트 ZIP 다운로드를 직접 검증했다고 확인.

## Completed
- 관리자 코호트별 최신 HTML ZIP 다운로드 구현·배포 완료.
- ZIP 내부 파일명: 순번·이름/팀명·제목·최신 버전. `manifest.csv`와 `manifest.json` 포함.
- 운영 ZIP은 동일 S3 버킷의 비공개 `exports/`에 저장하고 15분 서명 URL로 제공, 수명주기 1일.
- 개편 Phase 1 완료: v2 콘텐츠·코호트·버전 모델, API 호환 계약, S3 무삭제 마이그레이션 게이트와 전체 로드맵 문서화.
- 개편 Phase 2 완료: 콘텐츠 domain normalizer·legacy adapter·repository 경계 도입, 기존 API와 S3 키 불변.

## Next safe action
1. Phase 3 관리자 코호트 상세·운영 가시성의 읽기 계약을 설계한다.
