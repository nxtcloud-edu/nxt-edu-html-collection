# WO-010: 소유권+버전 관리 및 추천 기능
상태: 검증 대기
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/010` 브랜치 (README 규칙)

## 목표
(1) 업로드에 이름+비밀번호 기반 **소유권**을 도입해, 같은 소유자의 재업로드가 새 콘텐츠가 아닌
**같은 콘텐츠의 새 버전**이 되게 한다 — 뷰어 URL·피드백·추천이 버전을 관통해 유지.
(2) **추천 버튼**과 갤러리 **추천순 정렬**을 추가한다.
근거: `docs/planning/DECISIONS.md` 2026-07-12 소유권·버전·추천 결정.

## 설계 결정 (변경 금지)
1. **콘텐츠 레지스트리** — 기존 DynamoDB 테이블 재사용(단일 테이블): `nxt-edu-feedback`
   → Terraform에서 테이블명 변수화하지 말고 이름 그대로 두되, 아이템 타입으로 구분:
   - 콘텐츠: `contentKey = "content#{contentId}"`, `createdAt = "meta"` —
     attrs: `contentId`, `name`, `affiliation`, `category`, `passwordHash`, `salt`,
     `latestVersion`(N), `latestKey`(S3 key), `likes`(N), `createdAt2`, `updatedAt`
   - 피드백(기존): `contentKey = contentId`, `createdAt = ISO` — **기존 피드백 계약 유지하되
     key를 contentId로 전환**
   - DRY_RUN은 `.local-registry.json`(콘텐츠 맵) + 기존 `.local-feedback.jsonl`로 동일 계약.
2. **contentId** = `{cohortSlug}--{nameSlug}--{categorySlug}`가 아니라 **랜덤 8자 hex** (한글
   슬러그화 회피). (코호트·이름·분류) → contentId 매핑은 레지스트리 조회로 (전 콘텐츠 목록에서
   일치 검색 — 수업 규모라 Scan 허용, 단 `content#` prefix 필터).
3. **비밀번호**: 업로드 폼 필수(4~30자). `crypto.scryptSync(password, salt, 32)` hex 저장,
   salt는 `crypto.randomBytes(16)` hex. **평문 저장·로그 금지**. 비교는 `crypto.timingSafeEqual`.
4. **업로드 플로우** (`POST /api/upload` 확장 — `password` 필드 추가):
   - (코호트·이름·분류) 일치 콘텐츠 없음 → 신규: contentId 발급, v1, S3 key
     `games/{contentId}-v1.html`, 레지스트리 등록
   - 있음 → 비밀번호 검증: 실패 시 403 `"이미 등록된 이름입니다. 비밀번호가 맞지 않아요."`,
     성공 시 `latestVersion+1`, 새 S3 key 업로드, 레지스트리 갱신 (이전 버전 객체는 보존)
   - 응답: `{ url(뷰어), directUrl, contentId, version, uploadedAt }`
5. **갤러리 API** `/api/games`: 레지스트리 기반으로 전환 — 응답 항목에 `contentId`, `version`,
   `likes` 추가. 정렬 파라미터 `?sort=latest|likes` (기본 latest). S3 Listing 코드는 제거.
6. **추천**: `POST /api/like` `{ contentId }` → DynamoDB `ADD likes 1`, 응답 `{ likes }`.
   뷰어에 추천 버튼(현재 수 표시), 클릭 후 localStorage에 기록해 재클릭 시 버튼 비활성(소프트 가드).
   갤러리 카드에 추천 수 표시 + 정렬 토글(최신순/추천순).
7. **뷰어·프록시**: `view.html?id={contentId}` 로 전환 — 메타는 레지스트리에서, iframe은
   `/play/{latestKey}` (기존 key 정규식은 `-v[0-9]+` 반영해 갱신). 뷰어에 `v{n} · 업데이트 일시` 표기.
8. **README**: 4·5장에 비밀번호·버전 업데이트·추천 설명 반영. upload.html에 비밀번호 입력
   (type=password) + "같은 수업·이름·분류로 다시 올리면 새 버전으로 업데이트됩니다" 안내 문구.
9. **infra**: 테이블 재사용이라 시드 변경 없을 수 있음 — Scan 필요 시 IAM에 `dynamodb:Scan`,
   `UpdateItem`, `GetItem` 추가만. terraform fmt·validate.
10. **레거시 미고려**: 기존 S3-only 객체 호환 코드 금지 (검증자가 재시딩) — 코드 단순성 우선.
11. **커밋 분리** (최소 4): ① feat: 레지스트리·소유권·버전 API+테스트 ② feat: 추천 API+테스트
    ③ feat: UI(업로드 폼·뷰어·갤러리 정렬) ④ docs: README.

## 컨텍스트 (필독 파일)
- `html-delivery/server.js`, `public/*.html`, `infra/main.tf`, `README.md`
- `.agent/work-orders/README.md` — 절대 금지 블록

## 작업 단계
1. 레지스트리 모듈(신규/버전업/조회/추천 — DRY_RUN 페어 포함) + scrypt 검증 순수 함수 + 테스트
2. 업로드·갤러리·추천·뷰어 API 전환 + 테스트 (비번 불일치 403, 신규 v1, 갱신 v2, 정렬 케이스)
3. UI 3파일 갱신 (비밀번호 입력·버전 표기·추천 버튼·정렬 토글)
4. infra IAM 갱신, terraform fmt·validate
5. DRY_RUN 실측: 신규 업로드→v1 뷰어→추천→같은 정보+맞는 비번 재업로드→v2 유지 확인(URL 동일)
   →틀린 비번 403→추천순 정렬 (Commands 전수)
6. npm test 그린, README 갱신, TURN_LOG 완료 헤더 + wo/010 커밋

## 완료 기준
- [ ] DRY_RUN 5의 전 동선 통과, 평문 비밀번호가 코드·로그·저장소 어디에도 없음
- [ ] 같은 (코호트·이름·분류) 재업로드: 맞는 비번 → 같은 contentId·버전 증가·뷰어 URL 불변,
      틀린 비번 → 403
- [ ] 추천 증가·추천순 정렬 정확, npm test 전체 그린, terraform validate 통과
- [ ] 커밋 분리 준수, TURN_LOG 완료 헤더 + wo/010에만 커밋

## 금지 사항
- 절대 금지 블록 준수 (실 AWS 호출 금지). 검증은 단독 명령만 (긴 && 체인·node -e 금지)
- 비밀번호 평문 저장·로그 출력 금지, 자체 해시 구현 금지 (crypto.scryptSync만)
- 게임 파일·lambda.js 수정 금지
- 스코프 밖: 버전 롤백/이전 버전 뷰어, 비밀번호 재설정, 계정 시스템, 추천 취소 — 요청 없음
