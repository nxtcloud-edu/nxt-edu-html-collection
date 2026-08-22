# Current State

Updated: 2026-08-22 22:27 KST

## Active owners
- Codex: 사용자 지시에 따라 별도 Hermes 세션·워크오더 없이 현재 main 워크트리에서 직접 작업.
- Hermes: 이번 변경에 관여하지 않음.

## Last verified repo state
- Branch: `main`, Phase 11 fallback 은퇴 준비 문서 커밋 `f7becb7`까지 origin/main에 push 완료.
- Worktree: Phase 11 협업 저널 최종 갱신 중.
- Tests: 전체 `npm test` 직렬 실행 104/104.
- Terraform: 콘텐츠 CloudFront 접근 로그용 비공개·AES256 S3 버킷, PAB 4종, 14일 TTL 생성. CloudFront 로그는 쿠키 제외로 배포 완료. 최종 리소스 삭제 0.
- Prod audit: 레거시 398개, 등록·복사본 해시 일치 396개, 활성 fallback 283개, 사용량 근거 대기 113개, 미등록 2개, 삭제 후보 0개.
- User verification: 사용자가 운영 환경에서 실제 코호트 ZIP 다운로드를 직접 검증했다고 확인.

## Completed
- 관리자 코호트별 최신 HTML ZIP 다운로드 구현·배포 완료.
- ZIP 내부 파일명: 순번·이름/팀명·제목·최신 버전. `manifest.csv`와 `manifest.json` 포함.
- 운영 ZIP은 동일 S3 버킷의 비공개 `exports/`에 저장하고 15분 서명 URL로 제공, 수명주기 1일.
- 개편 Phase 1 완료: v2 콘텐츠·코호트·버전 모델, API 호환 계약, S3 무삭제 마이그레이션 게이트와 전체 로드맵 문서화.
- 개편 Phase 2 완료: 콘텐츠 domain normalizer·legacy adapter·repository 경계 도입, 기존 API와 S3 키 불변.
- 개편 Phase 3 완료: 인증된 관리자 화면에서 코호트별 콘텐츠 수·게임/웹페이지·누적 버전·최신 수정·저장 키 방식·ZIP 준비 상태 확인 가능.
- 개편 Phase 4 완료: 코드 배포 후 코호트 9개·콘텐츠 283개 additive backfill 성공. 재 dry-run 갱신 대상 0, unresolved/conflict 0.
- 개편 Phase 5 완료: 신규 콘텐츠 `contents/*`, 레거시 버전 `games/*` 고정, 이중 키 조회·ZIP·삭제와 권한 정책 반영 및 운영 E2E 통과.
- 개편 Phase 6 완료: v2 공개 조회·항상 신규 생성·명시적 버전 추가 API와 학생·갤러리 UX 전환을 배포. 레거시 API·공유 URL 유지.
- 개편 Phase 7 완료: 등록된 기존 버전 396개를 새 키로 조건부 복사하고 재실행 전수 검증 통과. 원본과 읽기 포인터는 변경하지 않음.
- 개편 Phase 8 완료: 검증된 283개에 새 우선 포인터를 조건부 추가하고 레거시 fallback을 보존. 공개 API·ZIP·후속 버전 경로와 실제 브라우저 렌더링 검증.
- 개편 Phase 9 완료: 비동기 ZIP 작업 상태·최근 이력·조건부 재시도·30일 TTL·Lambda 오류 alarm 배포. 운영 46개 ZIP이 실패 보존 후 재시도되어 `attempt 2`, `completed`; 관리자 UI 다운로드 상태와 alarm `OK` 확인.
- 개편 Phase 10 완료: 학생 HTML을 전용 origin으로 격리하고 S3 직접 공개를 차단. `games/*` 398개와 `contents/*` 396개 보존 확인.
- 개편 Phase 11 관찰 진행 중: 삭제 차단형 dry-run 감사와 CloudFront 로그 수집기를 구현·배포. 2026-08-22 22:13 KST 관찰 시작, 객체·포인터 삭제/변경 없음.
- Phase 11 fallback 은퇴 준비 완료: 완전한 7일 사용량 근거·검증 복사본·정확한 이중 포인터·레거시 요청 0건을 모두 요구하는 조건부 도구를 배포. 운영 dry-run은 283개 모두 `awaitingUsageEvidence`, ready·conflict 0이며 apply는 실행하지 않음.

## Next safe action
1. 2026-08-30 22:13 KST 이후 첫 7일 CloudFront 로그 사용량 근거를 수집하고 cleanup audit를 재실행한다.
2. 같은 근거로 fallback 은퇴 dry-run을 실행하고 ready·observedUsage·conflict를 별도 검토한다.
3. 포인터 apply는 별도 승인 후에만 실행한다.
4. 기존 `games/*` 삭제는 포인터 은퇴 후에도 별도 승인 전까지 수행하지 않는다.
