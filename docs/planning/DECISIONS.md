# Product Decisions

제품 방향 결정 기록. 협업 운영 결정은 `.agent/DECISIONS.md` — 섞지 않는다.

| Date | Decision | Reason |
|---|---|---|
| 2026-07-12 | game-ver1.html은 **의도적으로 단순하게 유지** — 에이전트가 선제적으로 버그 수정·기능 개선하지 않는다 | 수강생이 자기 AI 에이전트와 협업해 스스로 기능을 향상시키는 실습 소재. 알려진 이슈(시작 전 mousemove TypeError, delta-time 부재, 난이도 고정, 최고점수 없음 등)는 수강생 몫의 개선 여지다 |
| 2026-07-12 | 프로젝트 목표 = 수강생이 "AI 협업 기능 개발 → 배포 → 실유저 피드백 → 재개발" 사이클을 경험하게 하는 것 | AI 리터러시 교육: 빠른 기능 개발 체험 + 배포 상태에서 실제 유저 피드백 기반 반복 개발 체험 |
| 2026-07-12 | 저장소 구조 = `html-delivery/`(운영 프로그램) + `box-game/`(game-ver1.html) + `run-game/`(횡스크롤 러너 ver1) 3개 폴더 | html-delivery: 수강생이 소속·이름·html 업로드 → 자동 배포·URL 발급. run-game: 박스게임과 동일 철학(단일 파일·CONFIG 블록·의도적 단순함)의 두 번째 실습 소재. 별도로 수강생 안내 문서 필요 |
| 2026-07-12 | html-delivery 배포 인프라 = **AWS S3 정적 호스팅** (CloudFront 선택) | 사용자 확정. nxtcloud AWS 교육 맥락과 일치, 업로드 즉시 정적 웹사이트 URL 발급 가능 |
| 2026-07-12 | html-delivery 운영 = **Express on EC2**, 리전 = **서울(ap-northeast-2)**, S3는 **단일 버킷 + 업로드당 객체 1개**(`games/{timestamp}-{rand}.html`) | 사용자 확정. 실유저 트래픽은 S3 정적 호스팅이 직접 서빙 — Express는 업로드 중개만 (앱이 꺼져도 배포된 게임 URL은 유지) |
