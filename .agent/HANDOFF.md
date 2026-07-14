# Handoff

## Current handoff summary
WO-028(관리자 페이지 UI 정돈) Hermes 구현 완료. `wo/028`의 `c8d6559`에서 **순수 프론트엔드**(admin.html + admin-ui.test.js)만 변경했으며, 검증자 Claude의 독립 검증을 대기한다.

구현 결과:
1. 관리자 비밀번호 변경을 사이드바 인라인 폼 → **상단 `.site-tools` 버튼(`#openPasswordButton`, 로그아웃 옆) → 네이티브 `<dialog id="passwordModal">` 모달**로 이동. 폼 id/필드/제출 핸들러·`/api/admin/change-password` 호출 불변. 사이드바 인라인 비번 섹션 제거(필터만 남김).
2. `.table-wrap{overflow-x:visible}` → **`overflow-x:auto`** + 동작 컬럼 폭 조정으로 표 헤더·삭제 버튼의 패널 밖 오버플로 봉합.
3. `admin-ui.test.js` test 2(모달)·test 3(오버플로) 단언 갱신, `npm test` 전체 그린.

배경: WO-027은 완료·main 머지·프로덕션 배포됨(관리자 비번 변경 백엔드/패널 존재). 이번엔 그 표현만 정돈.

## Verification 계획 (Verifier = Claude)
1. diff 범위 확인: `html-delivery/public/admin.html`, `html-delivery/test/admin-ui.test.js` 두 파일만.
2. `cd html-delivery && npm test` 전체 그린 재확인.
3. Chrome 시각 확인(검증자 담당, 코더 범위 아님): 로그인 → 툴바 `비밀번호 변경` → 모달 개폐(ESC/취소/성공) → 콘텐츠 목록 표 헤더·삭제 버튼이 패널 밖으로 안 나감(데스크톱·좁은 폭).
4. 통과 시 Claude만 main 머지 + Lambda 재배포(정적 자산 변경이므로 배포 필요).

## Coder verification
- `cd html-delivery && npm test` → 38/38 pass.
- 구조 점검: password dialog/trigger/form 포함, `overflow-x:auto` 존재, `overflow-x:visible`·`innerHTML` 부재 확인.
- 브라우저 시각 검증은 WO 지시대로 실행 안 함(Claude 담당).

## Collision risks / 금지
- push·main 머지·terraform plan/apply·aws CLI·배포는 Coder 금지(검증자 전담).
- 백엔드(server.js·admin-auth.js·registry.js)·API·인프라·env 변경 금지. 순수 admin.html + 그 테스트.
- `resetPassword` prompt·`deleteContent` confirm 동작 변경 금지(범위 밖). innerHTML·외부 라이브러리 금지.
- 공개 페이지(index/cohort/upload/view) nav·푸터·헤더 변경 금지(툴바 버튼은 admin.html의 `.site-tools`에 한정).
- 브라우저 검증 과잉 루프 금지(WO-023 환류): 코더는 npm test 그린 + 구조 단언까지. 시각 확인은 검증자.
