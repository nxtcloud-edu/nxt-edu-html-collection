# Handoff

## Current handoff summary
WO-018에서 `2026-고대세종-기업인턴십` 코호트와 1팀~8팀 서버 SSOT를 추가했다. 이 코호트는 이름 대신 팀만 허용하며, 업로드 UI가 코호트에 따라 이름 input과 팀 select를 전환하고 값을 초기화한다. `랜딩페이지`는 새 canonical `웹페이지`로 표시하되 `normalizeCategory`가 레거시 저장 데이터를 조회·필터·상세·동일 identity 갱신에서 호환한다. `/api/cohorts`는 `{name, teams}` 객체 배열로 확장했고 index/cohort/upload 소비부를 같은 커밋에서 갱신했다.

## Verification evidence
- `node --test test/validation.test.js`: 최종 14/14 통과
- `npm test`: 최종 20/20 통과
- DRY_RUN: health 200
- 인턴십+3팀+웹페이지 업로드 201
- 인턴십+일반 이름 업로드 400, `팀을 선택하세요.`
- 일반 코호트+일반 이름 업로드 201
- `/api/cohorts`, `/api/categories`, 웹페이지 필터 API 모두 200; 계약 스크립트 통과
- 브라우저: 코호트 3개·분류 `웹페이지` 노출; 인턴십 선택 시 팀 라벨/select와 1팀~8팀; 일반 코호트 복귀 시 이름 input 및 값 초기화
- 브라우저 console/JS 오류 0
- 생성한 레지스트리 2행·artifact 2개 및 임시 비밀번호/응답/스크립트 정리
- background process 0건, `git diff --check` 통과
- 실 AWS·프로덕션·배포·시딩·push 실행 안 함

## Commits
- `83d3104 feat: 인턴십 팀 검증과 웹페이지 분류 추가`
- `cd12ecb feat: 팀 선택 UI와 코호트 계약 확장`
- 상태·저널 문서 커밋은 현재 HEAD `docs: WO-018 인턴십 코호트 검증 인계`

## Next recommended project actions
1. 검증자가 API 객체 계약과 index/cohort/upload 소비부를 함께 리뷰
2. 배포 후 팀 select, 팀 외 값 400, 일반 코호트 이름 입력을 실제 도메인에서 확인
3. 검증자 권한으로 1팀~8팀 콘텐츠 시딩

## Collision risks
- 기존 저장 데이터는 수정하지 않았고 응답 시에만 `랜딩페이지`→`웹페이지` 정규화
- 레거시 identity 재업로드도 같은 콘텐츠로 찾도록 registry lookup에 normalizer를 주입
- 팀 코호트별 특수 갤러리 UI는 스코프 밖
