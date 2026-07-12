# Handoff

## Current handoff summary
WO-007에서 업로드 앱 첫 화면을 랜딩+갤러리로 개편하고, 업로드 폼을 `upload.html`로 분리했다. 코호트는 server.js의 두 상수를 SSOT로 API·검증·UI에 공급하며, S3 갤러리는 ListObjectsV2+HeadObject Metadata로 구성한다.

## First things to do before any next edit
```bash
git status --short --branch
git log -5 --pretty=format:'%h %s'
```

## Next recommended project actions
1. (Hermes) WO-007 완료 신호 확정 — 상태·TURN_LOG 커밋
2. (Claude) API·UI·IAM·README 커밋 경계와 테스트·Terraform 재검증
3. (Claude+사용자) main 머지 후 Lambda ZIP 재생성/apply, 프로덕션 갤러리·업로드 E2E

## Verification evidence
- `npm test`: 12/12 통과
- Terraform `fmt -check`, `validate`: 통과
- curl: health 200, cohorts 200, 미등록 코호트 400, 정상 업로드 201, `/api/games` 즉시 최신 노출, 발급 URL marker HTML 반환
- 브라우저: 랜딩 CTA·최신 카드·코호트 필터·정확한 빈 상태·카드 클릭·업로드 페이지 select option 2개·갤러리 복귀 링크 확인
- E2E 서버 종료 및 정확한 fixture key·JSONL entry·`/tmp` 파일 정리 완료

## Collision risks
- 기존 로컬 JSONL의 과거 자유 소속 항목은 전체 탭에는 보이나 새 코호트 탭에는 속하지 않음; 서버는 신규 업로드부터 고정 코호트만 허용
- S3 목록은 설계대로 1000개 단일 호출이며 페이지네이션 UI 없음
- Function URL이 공개이므로 인증·삭제·수정·좋아요 기능은 범위 밖
- coder는 Terraform plan/apply, AWS CLI, 프로덕션 접근을 실행하지 않음
