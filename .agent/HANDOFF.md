# Handoff

## Current handoff summary
WO-030·WO-031 완료·배포. WO-032(업로드 흐름 개선)은 Hermes가 `wo/032`에 구현하고 `npm test` 46/46 및 구조 단언을 통과했다. 구현·저널 커밋 후 Claude 독립 검증 대기.

## WO-032 구현 결과 (Coder = Hermes, 검증 대기)
1. `upload.html`: 업로드 성공(`data.url`) 시 `window.location.assign(data.url)`로 뷰어 즉시 이동(링크/복사 성공 UI 제거). `?c=` 코호트 미리 선택(loadOptions 후 URLSearchParams). 오류 경로 그대로.
2. `cohort.html`: nav `.site-tools`에 `<a class="upload-link" id="uploadLink" href="upload.html">내 콘텐츠 업로드</a>`, 스크립트에서 `uploadLink.href='upload.html?c='+encodeURIComponent(cohort)`. `.upload-link`는 theme.css 공유.
3. `registry.js`: `findByIdentity`에 `&& item.title === title` 추가(destructure title). → 같은 이름+다른 제목=새 콘텐츠, 같은 제목=버전업(비번). **server.js 불변**(result에 title 이미 포함).
4. `admin-api.test.js`에 같은 name+다른 title=새 contentId(v1) / 같은 name+같은 title+맞는 비번=v2 / 틀린 비번=403 회귀를 추가했고, `admin-ui.test.js`에 URL 이동·코호트 전달 구조 단언을 추가. `npm test` 46/46 통과.
- 범위: registry.js + upload.html + cohort.html + 테스트. innerHTML·외부 라이브러리 금지.

## Verification 계획 (Verifier = Claude)
1. diff 범위(위 파일만), server.js 불변 확인.
2. `cd html-delivery && npm test` 전체 그린.
3. Chrome DRY_RUN: 코호트 페이지 업로드 버튼→upload.html 코호트 선택됨 / 업로드 성공→뷰어 이동 / 같은 이름 다른 제목 업로드→새 콘텐츠 생성.
4. 통과 시 머지 → 사용자 명시 승인 후 배포(프로덕션 배포는 매번 승인 필요).

## Collision risks / 금지 (상시)
- push·main 머지·terraform·aws·배포는 Coder 금지(검증자 전담). **프로덕션 배포는 사용자 명시 승인 필요**(auto-mode 게이트).
- 계정 생성·비밀번호 입력은 Claude 직접 불가.
- 브라우저 검증 과잉 루프 금지(WO-023): 코더는 npm test 그린 + 구조 단언까지. 시각 확인은 검증자.

## 사용자 대기 액션 (WO-031 후속)
- karin.kim/ella.kim은 admin.html → env admin 로그인 → `관리자 추가`로 직접 추가(초기 비번 설정).

## 운영 메모 (세션 함정)
- Hermes: 세션 중 파일 갱신 시 구모듈 캐시 초기화 실패 → `/quit` 후 `hermes` 재기동. 사용량 한도(429)면 모델/플랜 조치.
- 완료 감지: TURN_LOG 커밋 + 세션 `Ctrl+C cancel` 소멸 + 워킹트리 지문 무변화로 판정(편집 중 오탐 방지).
- tmux `grep "❯"` 멀티바이트 실패 — 직접 입력 후 캡처. Chrome은 좌표 스케일 불일치 → ref 기반 form_input/click.
