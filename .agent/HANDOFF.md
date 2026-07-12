# Handoff

## Current handoff summary
WO-009에서 업로드 콘텐츠를 동일 사이트 `/play/{key}`로 프록시하고, `view.html?key=` 내부 뷰어와 피드백 작성·목록을 추가했다. 업로드 응답 `url`은 뷰어 절대 URL이며 기존 S3/DRY_RUN 주소는 `directUrl`로 유지한다.

## First things to do before any next edit
```bash
git status --short --branch
git log -6 --pretty=format:'%h %s'
```

## Verification evidence
- `npm test`: 19/19 통과
- Terraform `fmt -check`, `validate`: 통과
- curl: 업로드 201, 뷰어 URL+directUrl, `/play` 200 text/html marker, invalid play/feedback key 404, 빈·501자 400, 정상 피드백 201·GET 노출
- 브라우저: Metadata, iframe marker, iframe focus, `/play` 크게 보기 링크, XSS payload literal text, 폼 등록·오래된 순 목록, 카드 same-tab viewer href 확인
- 서버 종료 및 정확한 artifact/upload-log/feedback-log/temp fixture 정리 완료

## Next recommended project actions
1. API+테스트, UI, DynamoDB, README, ignore, 상태저널 커밋 재검증
2. main 머지 후 production dependencies 포함 Lambda ZIP 재생성, Terraform apply
3. Function URL HTTPS에서 S3 콘텐츠 mixed-content 없이 iframe 로드 및 DynamoDB feedback E2E

## Collision risks
- DynamoDB SK가 ISO `createdAt`이므로 같은 밀리초에 동일 콘텐츠로 들어오는 극단적 동시 쓰기는 충돌 가능하나 설계 결정 그대로 구현
- 공개 Function URL과 공개 피드백은 인증·삭제·수정·별점·알림·페이지네이션 범위 밖
- 게임 파일·lambda.js 미수정; 실제 DynamoDB/S3/AWS API, Terraform plan/apply, 프로덕션 접근 미실행
