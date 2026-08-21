# 콘텐츠 플랫폼 개편 로드맵

## 원칙

- 각 단계는 독립적으로 테스트·배포·롤백 가능해야 한다.
- 데이터 변경과 코드 구조 변경을 같은 배포에 섞지 않는다.
- S3 기존 객체는 복사·검증 전환을 사용하며 별도 승인 없이 삭제하지 않는다.
- 레거시 API와 URL은 새 계약이 운영에서 검증될 때까지 유지한다.

## 순서

| Phase | 작업 | 운영 데이터 영향 | 완료 기준 |
|---|---|---|---|
| 0 | 코호트 ZIP 다운로드 | 비공개 export 객체 생성 | 배포·사용자 실검증 완료 |
| 1 | 데이터 모델·API 계약 | 없음 | `CONTENT_MODEL_V2.md` 확정 |
| 2 | 내부 domain/repository 분리 | 없음 | 기존 API·테스트 불변, v2 normalizer 테스트 |
| 3 | 관리자 코호트 상세·운영 가시성 | 읽기 중심 | 유형·버전·저장 키·다운로드 상태 확인 가능 |
| 4 | 코호트 ID additive backfill | DynamoDB 필드 추가 | dry-run 0 unresolved 후 재실행 가능 backfill |
| 5 | 신규 `contents/*` 쓰기 | 신규 객체만 영향 | 신규 생성·버전 추가·삭제·export 검증 |
| 6 | 학생·갤러리 v2 API 전환 | 없음 | 게임·웹페이지와 생성·버전 추가 UX 분리 |
| 7 | 기존 S3 객체 복사 마이그레이션 | 복사본 생성 | 전 객체 size·SHA-256·버전 수 일치 |
| 8 | 읽기 우선순위 전환 | 레지스트리 포인터 추가 | 새 키 우선 + 레거시 fallback 실검증 |
| 9 | 비동기 export·모니터링 | export 메타 추가 | 대량 export 상태·재시도·알람 |
| 10 | CloudFront OAC·S3 비공개 | 접근 경로 변경 | 커스텀 도메인 정상, 직접 S3 영향 확인 |
| 11 | 레거시 정리 | 승인된 대상만 | 사용량 0 확인과 별도 삭제 승인 |

## 현재 위치

- Phase 0 완료.
- Phase 1 완료: 데이터 모델·API·마이그레이션 계약 확정.
- Phase 2 완료: domain normalizer, legacy adapter, content repository 경계와 단위 테스트 도입. 기존 API·S3 키·운영 데이터 불변.
- Phase 3 완료: 인증된 관리자 코호트 현황 API와 UI에서 콘텐츠 유형·누적 버전·최신 저장 키·레거시/신규 저장 방식·ZIP 준비 상태를 읽기 전용으로 확인한다.
- Phase 4 구현 및 운영 dry-run 완료: 코호트 15개·콘텐츠 283개 중 unresolved 0, conflict 0. 운영 apply·배포는 아직 실행하지 않았다.
- 다음 안전 작업은 Phase 4 코드 배포와 조건부 additive apply를 별도로 승인·실행한 뒤 재실행 결과 `contentsToUpdate: 0`을 확인하는 것이다. 그 전에는 Phase 5 신규 `contents/*` 쓰기를 시작하지 않는다.
