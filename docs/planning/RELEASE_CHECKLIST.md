# 콘텐츠 플랫폼 운영 전환 체크리스트

## 목적

Phase 12~19 개편을 배포할 때 코드 성공과 운영 데이터 보존을 별도로 확인한다. 이 체크리스트는 기능 배포를 승인하지만 fallback 포인터 은퇴, `games/*` 삭제, 운영 콘텐츠·피드백 삭제를 승인하지 않는다.

## 배포 전

- [ ] `main...origin/main` 동기화와 관련 없는 변경 없음
- [ ] `npm run typecheck:web`, `npm run test:web`, `npm run build:web`
- [ ] `npm run check:web-budget`
- [ ] `npm test` 전체 통과
- [ ] `npm run test:e2e` 데스크톱·모바일, 시각 스냅샷, 접근성 통과
- [ ] `npm install --omit=dev`로 Lambda ZIP 런타임 의존성만 포함
- [ ] Terraform plan의 add/change/destroy 범위 확인
- [ ] S3·DynamoDB·CloudFront·IAM 변경이 의도에 없으면 plan에 나타나지 않음

## 배포 후 읽기 전용 검증

- [ ] `/api/health`, `/`, `/upload.html`, `/admin.html` 200
- [ ] 현재 HTML이 참조하는 JS·CSS 해시 자산 200
- [ ] 공개 첫 목록이 10개와 next cursor를 사용하고 전체 283개를 초기 응답으로 내려받지 않음
- [ ] 콘텐츠 283개, 게임 182개, 웹페이지 101개, 최신 버전 합계 396개
- [ ] `/view.html?id=0e040222`와 `content.showcase.nxtcloud.kr/contents/0e040222/v5.html` 유지
- [ ] 관리자 다섯 영역, 콘텐츠 25개 cursor 이전/다음, 버전·피드백 상세 확인
- [ ] 데스크톱·우측 패널/모바일에서 가로 오버플로 없음
- [ ] 최종 Terraform detailed plan exit 0, `No changes`

## 별도 승인 없이는 실행하지 않음

- fallback 포인터 은퇴 apply
- `games/*`, `contents/*`, export 이외 S3 객체 삭제
- 운영 콘텐츠·버전·피드백·코호트·관리자 계정 생성·수정·삭제
- ZIP 생성·재시도·다운로드처럼 운영 작업 이력을 바꾸는 동작

## 롤백 경계

- 이전 해시 JS·CSS와 `public/*.html` 정적 롤백 자산을 보존한다.
- Lambda 코드 롤백은 이전 검증 커밋의 같은 Terraform archive 절차로 수행한다.
- 콘텐츠 ID, `/view.html?id={contentId}`, `contents/{contentId}/vN.html`, 별도 학생 HTML origin은 롤백 과정에서도 바꾸지 않는다.
- 데이터 포인터나 객체를 자동 되돌리지 않는다. 데이터 변경이 필요한 경우 별도 dry-run·승인·감사 기록을 요구한다.
