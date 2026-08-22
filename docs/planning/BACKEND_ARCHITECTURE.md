# 백엔드 경계 구조

Phase 15 기준. 기존 Node.js/Express 단일 Lambda와 DynamoDB·S3·CloudFront 구성은 유지한다. 모듈 분리는 배포 단위를 늘리기 위한 것이 아니라 변경 영향과 테스트 범위를 줄이기 위한 것이다.

## 의존 방향

```text
server.js (composition root)
  ├─ routes/admin-routes.js
  ├─ routes/public-routes.js
  │    ↓
  ├─ services/cohort-service.js
  ├─ services/content-service.js
  │    ↓
  ├─ repositories/content-repository.js
  ├─ repositories/feedback-repository.js
  ├─ repositories/version-repository.js
  ├─ repositories/audit-repository.js
  │    ↓
  └─ adapters/object-storage.js
       ↓
     AWS SDK / local fallback
```

## 책임

- `server.js`: 환경별 구현 생성, 의존성 주입, middleware·정적 파일·오류 처리, Lambda와 로컬 서버가 공유하는 `createApp()` 제공
- `routes/`: HTTP 경로·상태 코드·요청/응답 변환·인증 middleware
- `services/`: 콘텐츠 생성·버전 추가·삭제와 코호트 추가·이름 변경 같은 use case 순서 및 원자성 경계
- `repositories/`: 콘텐츠·피드백·버전·감사 로그 영속 계약과 DynamoDB/로컬 fallback 차이 캡슐화
- `adapters/`: S3 HTML 객체 저장·삭제·공개 URL 계약과 로컬 파일 fallback
- `domain/`: 콘텐츠·코호트·저장 키의 순수 규칙

라우트와 서비스는 AWS SDK를 import하지 않는다. AWS SDK는 adapter/repository 구현에만 위치한다. 기존 `registry.js`는 콘텐츠 repository가 감싸는 레거시 DynamoDB adapter이며 기존 API 호환 구현으로 유지한다.

## DynamoDB 단일 테이블 파티션

- 콘텐츠: 기존 `content#...` 레코드 계약 유지
- 버전: `contentKey=version#{contentId}`, `createdAt=v#{0으로 채운 버전}`
- 감사 로그: `contentKey=audit`, `createdAt={occurredAt}#{auditId}`

ContentVersion과 AuditLog는 기존 테이블에 additive하게 저장한다. 현재 콘텐츠 레코드와 S3 객체 키를 바꾸지 않으며 조건부 쓰기로 기존 버전 메타데이터 덮어쓰기를 거부한다.

## 보존한 외부 계약

- 기존 공개·관리자 API 경로와 응답 형태
- `/view.html?id={contentId}` 공유 URL
- `contents/{contentId}/vN.html`과 레거시 fallback
- 학생 HTML 전용 origin
- 비동기 ZIP 작업·재시도·서명 다운로드
- 로컬 모드의 `.local-deploy`, `.local-feedback.jsonl`, `.local-versions.json`, `.local-audit.jsonl`

## 검증

- 경계 단위 테스트: local object storage, local feedback repository, content/cohort service
- 기존 단위·통합 테스트: 116개
- Playwright: 데스크톱·모바일 14개
- 배포 전 Terraform plan은 Lambda 코드 1건 이외 인프라 변경·삭제가 없어야 한다.
