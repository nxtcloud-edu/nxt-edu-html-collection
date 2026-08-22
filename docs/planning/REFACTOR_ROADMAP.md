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
- Phase 4 완료: Lambda 배포와 조건부 additive backfill 후 코호트 15개·콘텐츠 283개가 모두 `cohortId`를 가진다. 재 dry-run은 갱신 대상·unresolved·conflict 모두 0이며 기존 `games/*` 키는 유지됐다.
- Phase 5 완료: 신규 `contents/*` 쓰기, 레거시 prefix 고정, 이중 키 조회·ZIP·삭제, S3/IAM 정책을 배포했다. 운영 테스트 콘텐츠의 v1·v2 생성, 최신 포인터, 관리자 목록, ZIP 포함, 삭제를 검증했고 기존 콘텐츠 283개로 원복했다.
- Phase 6 완료: v2 코호트·콘텐츠 조회, 항상 신규 생성, contentId 기반 명시적 버전 추가 API를 배포하고 갤러리·코호트·상세·업로드 화면을 전환했다. 운영 v2 콘텐츠 283개와 레거시 API 283개, 두 업로드 탭을 확인했다.
- Phase 7 완료: 등록 콘텐츠 283개의 레거시 버전 396개를 `contents/{contentId}/vN.html`로 덮어쓰기 없이 복사했다. 전수 size·SHA-256 검증과 재 dry-run에서 396/396 일치, pending·누락·충돌·실패 0건을 확인했다. 레지스트리에 연결되지 않은 무버전 객체 2개는 자동 추정하지 않고 원본에 보존했다.
- Phase 8 완료: 검증된 콘텐츠 283개에 `latestObjectKey=contents/*`를 조건부 추가하고 기존 `latestKey=games/*`를 fallback으로 보존했다. v2·레거시 API 283개가 새 URL을 반환하며 실제 iframe 렌더링과 재 dry-run을 확인했다.
- Phase 9 완료: ZIP 요청을 동일 Lambda의 비동기 작업으로 분리하고 작업 상태·최근 이력·조건부 재시도·30일 메타 TTL·Lambda 오류 alarm을 배포했다. 운영 최대 코호트 46개 작업이 실패 상태 보존 후 재시도되어 `attempt 2`, `completed`로 끝났고 관리자 화면의 완료·다운로드 상태와 CloudWatch alarm `OK`를 확인했다.
- Phase 10 완료: S3 Public Access Block 4종과 OAC 전용 정책을 적용하고 학생 HTML을 별도 CloudFront·도메인 `content.showcase.nxtcloud.kr`로 격리했다. API 283개 URL과 iframe 렌더링은 전용 도메인을 사용하며 직접 S3는 403, 앱 도메인의 `/contents/*`는 404다.
- Phase 11 관찰 진행 중: 읽기 전용 감사 결과 등록 객체 396개는 복사본 해시가 모두 일치하지만 최신 fallback 참조 283개, 사용량 근거 대기 113개, 미등록 2개로 삭제 후보는 0개다. 2026-08-22 22:13 KST부터 쿠키 제외 CloudFront 로그를 비공개 버킷에 수집하며 14일 뒤 자동 만료한다.
- 최소 7일 관찰과 24시간 로그 전달 대기를 마친 2026-08-30 22:13 KST 이후 사용량 근거를 생성한다. `games/*` 객체 삭제는 후보 재산정과 별도 승인 전까지 수행하지 않는다.
