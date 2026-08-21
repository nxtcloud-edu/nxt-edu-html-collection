# Current State

Updated: 2026-08-21 12:34 KST

## Active owners
- Codex: 사용자 지시에 따라 별도 Hermes 세션·워크오더 없이 현재 main 워크트리에서 직접 작업.
- Hermes: 이번 변경에 관여하지 않음.

## Last verified repo state
- Branch: `main`, origin/main push 완료. 제품 커밋 `724bc70`, 배포 저널 커밋 `6267c94` 포함.
- Worktree: 모든 제품·인프라·저널 변경 커밋 완료. 최종 상태 기록 후 clean 확인 예정.
- Tests: Node 20 ESM 호환 수정 후 `npm test` 55/55.
- Terraform: apply 완료(1 add, 4 change, 0 destroy) 후 호환 수정 Lambda 재배포(0 add, 1 change, 0 destroy). 최종 plan no changes.
- Prod: health 200, games 283개, `admin.html` 200 및 ZIP UI/API 코드 확인, 미인증 export API 401, 브라우저 로그인 화면 렌더링 확인.
- User verification: 사용자가 운영 환경에서 실제 코호트 ZIP 다운로드를 직접 검증했다고 확인.

## Completed
- 관리자 코호트별 최신 HTML ZIP 다운로드 구현·배포 완료.
- ZIP 내부 파일명: 순번·이름/팀명·제목·최신 버전. `manifest.csv`와 `manifest.json` 포함.
- 운영 ZIP은 동일 S3 버킷의 비공개 `exports/`에 저장하고 15분 서명 URL로 제공, 수명주기 1일.

## Next safe action
1. 깨끗한 기준점에서 전체 앱 분석·개편 계획을 다시 검토한다.
