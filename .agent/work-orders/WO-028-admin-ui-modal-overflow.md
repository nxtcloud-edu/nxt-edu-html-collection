# WO-028: 관리자 페이지 UI 정돈 — 비번 변경 모달화 + 표 오버플로 봉합
상태: 대기
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/028` 브랜치 (README 규칙)

## 목표
관리자 페이지의 두 가지 레이아웃 문제를 고친다. **순수 프론트엔드 변경**(admin.html + 그 테스트)만 한다.
1. **관리자 비밀번호 변경**을 사이드바 인라인 폼에서 **상단 툴바 버튼 → 모달**로 옮긴다.
2. **콘텐츠 목록 표**의 헤더 상단·동작 버튼(특히 `삭제`)이 패널 밖으로 삐져나가는 오버플로를 봉합한다.
(참고: WO-027이 추가한 비번 변경 기능/`POST /api/admin/change-password`는 이미 main에 있음. **동작·API는 그대로 두고 표현만 바꾼다**.)

## 배경 (원인 — 확인됨)
- `html-delivery/public/admin.html` line 11 CSS `.table-wrap{overflow-x:visible}` → 표 폭이 컨테이너보다 넓을 때 밖으로 흘러 헤더·삭제 버튼이 패널 우측 밖으로 넘침.
  또 `.actions-cell{...min-width:210px}` + `.row-actions{flex-wrap:nowrap}`인데 동작 버튼 4개(수정/비번 재설정/피드백/삭제)는 210px보다 훨씬 넓어 넘침을 키움.
- line 21: 비번 변경 폼(`id="passwordChangeForm"`)이 필터 `<aside>` 안 인라인으로 박혀 사이드바가 혼잡함.

## 설계 결정 (변경 금지)
1. **비번 변경 → 네이티브 `<dialog id="passwordModal">` 모달**
   - 기존 `<form id="passwordChangeForm">`를 **필드 id/타입/속성 그대로**(`currentAdminPassword`·`newAdminPassword`·`confirmAdminPassword`, `type="password"`, new/confirm의 `minlength="8" maxlength="72"`) 모달 안으로 옮긴다. 제출 버튼 텍스트 `비밀번호 변경`, `passwordChangeStatus` status 라인, 기존 submit 핸들러와 `/api/admin/change-password` 호출 **불변**.
   - **트리거 버튼**: `admin.html`의 상단 `.site-tools`에 `#logoutButton` **옆**에 `<button id="openPasswordButton" class="admin-button" type="button" hidden>비밀번호 변경</button>` 추가. 기본 `hidden`, `showLoggedIn()`에서 노출·`showLoggedOut()`에서 숨김(로그아웃 버튼과 동일 토글).
   - 열기: `passwordModal.showModal()`. 닫기: 모달 내 `취소`(또는 ✕) 버튼 `passwordModal.close()` + ESC(네이티브) + **변경 성공 시 자동 닫기**. 열 때 폼 `reset()` + status 초기화.
   - 필터 `<aside>`에서 비번 변경 섹션(`<hr class="admin-divider">` + `<h2>관리자 비밀번호 변경</h2>` + 폼)을 **제거** → 사이드바는 `필터`만 남는다.
   - 스타일: 기존 `.admin-panel` 톤 재사용(테두리·라운드·패널 배경), `dialog::backdrop`로 배경 딤. DESIGN.md 톤 준수. **innerHTML 금지, `textContent`만.**
2. **표 오버플로 봉합**
   - `.table-wrap{overflow-x:auto}`로 바꾼다(기존 `visible`). → 표가 넓어도 **패널 안에서 가로 스크롤**되고 어떤 요소도 밖으로 나가지 않는다. **이것이 필수 봉합.**
   - 데스크톱(≈1180px) 폭에서 가로 스크롤바 없이 한 행이 담기도록 **동작 컬럼 폭을 조인다**(허용: `.actions-cell`의 과대 `min-width:210px` 축소, 또는 `.row-actions`를 `flex-wrap:wrap`로 2×2 배치). 좁은 뷰포트에서는 가로 스크롤이 폴백.
   - **`overflow-x:visible` 재도입 금지.** 공개 갤러리/업로드 페이지는 손대지 않는다.
3. **테스트 (`html-delivery/test/admin-ui.test.js` 갱신)**
   - test 2(모달): `<dialog id="passwordModal"`·트리거 버튼 id 단언 추가. 폼 존재·필드·`/api/admin/change-password`·`비밀번호 변경</button>` 단언은 유지(폼이 모달 안으로 이동해도 문자열은 존재). `innerHTML` 부재·`textContent` 단언 유지.
   - test 3(오버플로): `.table-wrap{overflow-x:auto}` 단언 추가, `overflow-x:visible` 부재 단언. `.row-actions`·`.actions-cell` 단언은 **최종 채택 값으로 갱신**(계속 단언해 회귀 잠금). `th{white-space:nowrap}`·`td{word-break:keep-all}`·`table{width:100%...}` 등 유효한 것 유지.

## 컨텍스트 (필독 파일)
- `html-delivery/public/admin.html` — 유일한 구현 대상. 11행 CSS, 15행 nav `.site-tools`, 20~22행 패널 구조, 34~66행 JS 핸들러.
- `html-delivery/test/admin-ui.test.js` — test 2·3이 현재(구) 구조를 단언 중 → 함께 갱신.
- `DESIGN.md` — 디자인 언어(톤·간격·색 변수).
- `.agent/work-orders/README.md` — 절대 금지 블록 + 워크트리·브랜치 게이트.

## 작업 단계
1. admin.html: `.site-tools`에 트리거 버튼 추가, `<dialog id="passwordModal">`(폼 이동) 추가, 사이드바 인라인 비번 섹션 제거, 열기/닫기 배선 + `showLoggedIn/Out` 토글 반영.
2. admin.html CSS: `.table-wrap{overflow-x:auto}`, 동작 컬럼 폭 조정, `dialog`/`::backdrop` 스타일.
3. `admin-ui.test.js` test 2·3 단언 갱신.
4. `cd html-delivery && npm test` 전체 그린. 구조 자기점검(grep): `overflow-x:auto` 존재·`overflow-x:visible` 부재·`<dialog id="passwordModal"` 존재·`innerHTML` 부재.
5. TURN_LOG 완료 헤더(Commands 전수 기재) + 상태 `검증 대기`, 커밋은 wo/028에만.

## 완료 기준
- [ ] 비번 변경이 상단 툴바 버튼 → `<dialog>` 모달로 동작(열기·ESC/취소/성공 닫기·성공 시 필드 초기화·확인 불일치 클라이언트 차단 유지), `/api/admin/change-password` 호출 불변
- [ ] 사이드바에서 인라인 비번 폼 제거(필터만 남음)
- [ ] `.table-wrap{overflow-x:auto}`; 콘텐츠 목록 표의 헤더·동작 버튼(삭제 포함)이 어떤 폭에서도 패널 밖으로 나가지 않음, `overflow-x:visible` 부재
- [ ] `admin-ui.test.js` 갱신(모달+오버플로 단언), `npm test` 전체 그린
- [ ] `admin.html` + `admin-ui.test.js`만 변경(백엔드/인프라/공개 페이지 불변), wo/028에만 커밋 + TURN_LOG 완료 헤더

## 금지 사항
- 절대 금지 블록: push·main 머지·배포·terraform plan/apply·aws CLI 금지(검증자 전담)
- 백엔드 변경 금지: `server.js`·`admin-auth.js`·`registry.js`·API·인프라·env 손대지 말 것. **순수 `admin.html` + `admin-ui.test.js`**
- `resetPassword`의 `window.prompt`·`deleteContent`의 `window.confirm` 동작 변경 금지(범위 밖)
- 공개 페이지(index/cohort/upload/view) nav·푸터·헤더 로직 변경 금지(툴바 버튼 추가는 admin.html의 `.site-tools`에 한정)
- `innerHTML` 금지, 외부 라이브러리 금지(네이티브 `<dialog>` 사용)
- **브라우저 검증 과잉 루프 금지(WO-023 환류)**: `npm test` 그린 + 구조 단언까지가 코더 범위. 모달 개폐·무오버플로의 시각 확인은 검증자(Claude)가 Chrome으로 수행
