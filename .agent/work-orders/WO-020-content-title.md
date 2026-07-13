# WO-020: 콘텐츠 제목(title) 필드 도입
상태: 대기
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/020` 브랜치

## 목표
카드·뷰어의 제목이 소유자 이름(팀명)인 현 구조에 **작품 제목** 개념을 도입한다.
근거: 사용자 요청 — 기업인턴십 카드 제목을 "1팀-아이디어노트" 형태로. 이름은 소유권 식별자라
직접 변경 불가 → 표시용 title 필드가 정답. (8건 기존 데이터의 title 주입은 검증자 몫)

## 설계 결정 (변경 금지)
1. **업로드**: `title` 필드 추가 — 신규 업로드 필수(트림 1~60자, 400 메시지 "제목을 입력하세요.").
   버전 업데이트 시 새 title로 갱신. S3 Metadata에도 encodeURIComponent 저장(참고용),
   SSOT는 레지스트리 필드.
2. **표시**: 카드·뷰어 제목 = `title || name` (레거시 fallback — title 없는 기존 데이터는
   기존처럼 이름 표시). 카드·뷰어에 소유자(이름/팀)와 코호트는 메타 줄로 유지.
3. **API**: `/api/games`·업로드 응답에 `title` 포함.
4. **upload.html**: 제목 입력(placeholder "예: 박스 피하기 리믹스") — 팀/이름 필드와 별개.
5. **README**: 4장에 제목 입력 한 줄 반영.
6. **커밋 분리** (최소 2): ① feat: 서버(title 검증·저장·API)+테스트 ② feat: UI+README.

## 작업 단계
1. 서버 + node --test (필수·길이·fallback·버전업 시 title 갱신)
2. UI(업로드 폼·카드·뷰어) + README
3. DRY_RUN 실측: title 포함 업로드→카드·뷰어 제목 표시, title 누락 400,
   레거시(title 없는 데이터) fallback (Commands 전수)
4. npm test 그린, TURN_LOG 완료 헤더 + wo/020 커밋

## 완료 기준
- [ ] 신규 업로드 title 필수, 카드·뷰어가 title 우선 표시, 레거시 fallback 정상
- [ ] npm test 전체 그린, 커밋 분리, TURN_LOG 완료 헤더 + wo/020에만 커밋

## 금지 사항
- 절대 금지 블록 준수. 검증은 단독 명령만. infra 수정 금지
- 소유권 식별(identity)에 title 사용 금지 — 식별은 기존 (코호트·이름·분류) 유지
