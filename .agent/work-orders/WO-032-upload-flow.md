# WO-032: 업로드 흐름 개선 — 배포 후 자동 이동 + 코호트 업로드 버튼 + 제목별 생성
상태: 검증 대기
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/032` 브랜치 (README 규칙)

## 목표
1. **배포 완료 시 바로 뷰어(링크) 페이지로 이동** (현재는 링크만 표시).
2. **코호트 페이지 안에도 업로드 버튼** 추가 (그 코호트를 미리 선택).
3. **이름이 같아도 콘텐츠 제목이 다르면 새로 생성** 가능 (현재는 같은 이름=기존 콘텐츠의 새 버전으로 강제).

## 배경 (현재 동작 — 확인됨)
- `POST /api/upload` 응답: `{ url: viewerUrl(...), directUrl, contentId, title, version, uploadedAt }` (201). `url`=뷰어 페이지.
- `upload.html`(약 130~135행): 성공 시 `result`에 "배포 완료: " + 링크 + URL 복사 버튼만 렌더(자동 이동 없음).
- `cohort.html`: nav `.site-tools`에 테마 토글만(업로드 링크 없음). index.html엔 `<a class="upload-link" href="upload.html">내 콘텐츠 업로드</a>` 존재. `.upload-link`는 **theme.css 공유 스타일**.
- `registry.js` `findByIdentity({affiliation, name, category})`: affiliation+name+category 매치 → 업로드 라우트가 존재 시 새 버전(비번 필요)·부재 시 새 콘텐츠. **title 미포함** → 같은 이름+다른 제목이 기존 콘텐츠를 덮어씀(또는 403).

## 설계 결정 (변경 금지)
1. **upload.html — 성공 시 뷰어로 즉시 이동**
   - 업로드 성공(`response.ok`, `data.url` 존재) → `result`에 `'배포 완료 — 콘텐츠 페이지로 이동합니다…'`(성공 톤) 표시 후 `window.location.assign(data.url)`로 이동. 기존 링크/URL 복사 버튼 성공 UI는 제거(즉시 이동이라 불필요).
   - 오류 경로(`!response.ok`, catch)는 그대로(에러 메시지 표시, submit 재활성화). `data.url`이 없으면 이동하지 말고 오류 처리.
2. **upload.html — `?c=` 코호트 미리 선택**
   - `loadOptions()`가 affiliation `<select>`(id=`affiliation`) 채우고 disabled 해제한 뒤, `new URLSearchParams(location.search).get('c')` 값이 채워진 옵션 중 하나와 일치하면 `affiliation.value=` 로 설정하고 **팀 필드 갱신 로직**(기존 affiliation change 핸들러/`updateTeamField`류)을 트리거. 없거나 무효면 기본값 유지(널 세이프).
3. **cohort.html — 업로드 버튼(코호트 전달)**
   - nav `.site-tools`에 `<a class="upload-link" id="uploadLink" href="upload.html">내 콘텐츠 업로드</a>` 추가(테마 토글 옆). `.upload-link` theme.css 스타일 사용(별도 CSS 불필요, 렌더 확인).
   - 스크립트에서 현재 코호트(`?c=` 값, 기존에 읽는 변수 재사용)로 `uploadLink.href = 'upload.html?c=' + encodeURIComponent(cohort)` 설정. **href/textContent만, innerHTML 금지.**
4. **registry.js — identity에 title 포함 (핵심 로직)**
   - `findByIdentity({ affiliation, name, category, title }, normalizeCategory)`에 `&& item.title === title` 조건 추가. → 같은 {affiliation,name,category}라도 **title 다르면 미매치=새 콘텐츠**, **title 동일하면 기존 매치=새 버전(비번)**.
   - **server.js 변경 불필요**(업로드 라우트가 이미 `findByIdentity(result, normalizeCategory)`로 title 포함 `result`를 넘김). 라우트 로직·응답 그대로.
   - Consequence(의도된 동작): 콘텐츠 버전 업데이트는 **제목이 동일**해야 함. 제목을 바꾸면 새 콘텐츠가 생성된다.
5. **범위**: `html-delivery/registry.js` + `html-delivery/public/upload.html` + `html-delivery/public/cohort.html` + 테스트. server.js·admin·공개 나머지 페이지 미수정. 인프라/env 불변.

## 컨텍스트 (필독 파일)
- `html-delivery/public/upload.html` — 44~ 폼, 73~ 스크립트, `loadOptions`(101~), 제출 핸들러(~130), affiliation/team 필드 로직.
- `html-delivery/public/cohort.html` — nav `.site-tools`, `?c=` 읽는 스크립트.
- `html-delivery/public/index.html` — `.upload-link` 사용 예(참고).
- `html-delivery/registry.js` — `findByIdentity`(약 83행).
- `html-delivery/server.js` — `/api/upload` 라우트(참고, 수정 없음), `viewerUrl`.
- `html-delivery/test/admin-api.test.js` — `uploadContent` 헬퍼(name·title 랜덤), 업로드/버전 테스트.
- `.agent/work-orders/README.md` — 절대 금지 블록 + 게이트.

## 작업 단계
1. registry.js: `findByIdentity`에 title 매치 추가 → node --test.
2. upload.html: 성공 시 `window.location.assign(data.url)`, `?c=` 미리 선택.
3. cohort.html: `.site-tools`에 upload-link + `?c=` href 세팅.
4. 테스트: 같은 name+다른 title=새 contentId / 같은 name+같은 title+맞는 비번=v2 / 같은 name+같은 title+틀린 비번=403. 기존 버전업 테스트가 title 랜덤이면 title 고정으로 수정. (선택) admin-ui.test.js에 upload.html `window.location`+`URLSearchParams`, cohort.html `upload-link` 구조 단언 추가.
5. `cd html-delivery && npm test` 전체 그린. 구조 자기점검(grep): upload.html `window.location`, cohort.html `upload-link`, registry `item.title === title`.
6. TURN_LOG 완료 헤더(Commands 전수 기재) + 상태 `검증 대기`, 커밋은 wo/032에만.

## 완료 기준
- [ ] 업로드 성공 시 뷰어 페이지로 즉시 이동(오류 시 이동 안 함·메시지 표시)
- [ ] 코호트 페이지 업로드 버튼 → `upload.html?c=<코호트>`, upload.html에서 해당 코호트 미리 선택
- [ ] 같은 이름+다른 제목 → 새 콘텐츠(다른 contentId), 같은 이름+같은 제목 → 버전업(비번)·틀린 비번 403
- [ ] `npm test` 전체 그린, server.js 로직/응답 불변, 인프라/env 불변
- [ ] `registry.js`+`upload.html`+`cohort.html`(+테스트)만 변경, wo/032에만 커밋 + TURN_LOG 완료 헤더

## 금지 사항
- 절대 금지 블록: push·main 머지·배포·terraform plan/apply·aws CLI 금지(검증자 전담)
- server.js 업로드 라우트 로직·응답 형태 변경 금지(identity는 registry에서만). 새 API·새 필드 금지
- 공개 페이지 푸터/관리자 링크·나머지 페이지 수정 금지. innerHTML·외부 라이브러리 금지
- 코호트/카테고리/기존 데이터 스키마 변경 금지
- 브라우저 검증 과잉 루프 금지(WO-023): npm test 그린 + 구조 단언까지. 시각 확인은 검증자(Claude)
