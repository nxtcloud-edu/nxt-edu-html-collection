# Handoff

## Current handoff summary
WO-010에서 기존 S3 listing 기반 모델을 제거하고 DynamoDB/로컬 JSON 콘텐츠 레지스트리로 전환했다. 같은 코호트·이름·분류의 업로드는 scrypt 소유 자격 확인 후 동일 contentId의 새 버전이 되며 `view.html?id=` URL, 피드백, 추천이 유지된다.

## First things to do before any next edit
```bash
git status --short --branch
git log -7 --pretty=format:'%h %s'
```

## Verification evidence
- `npm test`: 9/9 통과
- Terraform fmt-check·validate 통과
- DRY_RUN: 신규 v1 201, 추천 증가, 동일 contentId v2 201, 뷰어 URL 동일, directUrl v2, 잘못된 자격 403
- `/api/content`: v2·추천 유지, 해시/salt 비노출; `/play` v2 marker; 추천순 API 통과
- 브라우저: v2·업데이트 시각·추천, iframe v2/focus, 추천 soft guard, 카드 v2·추천 수·contentId URL 확인
- 무작위 런타임 자격 값이 추적 파일·로컬 레지스트리·피드백 로그에 없고 레지스트리는 64자 hash/32자 salt만 저장함을 검사
- 서버 종료 및 두 버전 artifact·registry row·임시 응답·자격 fixture 정리 완료

## Next recommended project actions
1. 레지스트리 공개 projection, scrypt/timingSafeEqual, v1/v2, 추천 UpdateItem/Scan IAM 재검증
2. 기존 객체는 호환하지 말고 검증자 계획대로 재시딩
3. main 머지 후 Terraform apply/Lambda 배포 및 프로덕션 전체 동선

## Collision risks
- identity 조회와 버전 갱신은 수업 규모의 Scan+Put이며 강한 동시 업로드 원자성은 이번 범위 밖
- 추천 localStorage는 브라우저 단위 soft guard이며 서버 중복 방지는 요구되지 않음
- 실제 AWS 호출, Terraform plan/apply, 배포 미실행; 게임 파일·lambda.js 미수정
