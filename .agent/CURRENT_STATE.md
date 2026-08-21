# Current State

Updated: 2026-08-21 12:31 KST

## Active owners
- Codex: 사용자 지시에 따라 별도 Hermes 세션·워크오더 없이 현재 main 워크트리에서 직접 작업.
- Hermes: 이번 변경에 관여하지 않음.

## Last verified repo state
- Branch: `main` HEAD `724bc70`, 제품 변경 커밋 완료. 저널 정리 커밋 후 push 예정.
- Worktree: 제품·인프라 변경은 커밋됐고 협업 저널만 수정 상태.
- Tests: Node 20 ESM 호환 수정 후 `npm test` 55/55.
- Terraform: apply 완료(1 add, 4 change, 0 destroy) 후 호환 수정 Lambda 재배포(0 add, 1 change, 0 destroy). 최종 plan no changes.
- Prod: health 200, games 283개, `admin.html` 200 및 ZIP UI/API 코드 확인, 미인증 export API 401, 브라우저 로그인 화면 렌더링 확인.
- User verification: 사용자가 운영 환경에서 실제 코호트 ZIP 다운로드를 직접 검증했다고 확인.

## Completed
- 관리자 코호트별 최신 HTML ZIP 다운로드 구현·배포 완료.
- ZIP 내부 파일명: 순번·이름/팀명·제목·최신 버전. `manifest.csv`와 `manifest.json` 포함.
- 운영 ZIP은 동일 S3 버킷의 비공개 `exports/`에 저장하고 15분 서명 URL로 제공, 수명주기 1일.

## Next safe action
1. 협업 저널 커밋 후 main을 origin에 push하고 clean 상태를 확인한다.
2. 깨끗한 기준점에서 전체 앱 분석·개편 계획을 다시 검토한다.
