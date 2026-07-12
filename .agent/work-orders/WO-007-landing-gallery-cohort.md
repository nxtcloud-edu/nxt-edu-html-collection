# WO-007: 랜딩+갤러리 UX 개편 및 코호트 선택
상태: 검증 대기
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/007` 브랜치 (README 규칙)

## 목표
업로드 앱 첫 화면을 "랜딩 + 갤러리"로 개편한다: 이 페이지가 뭔지 설명하고, 다른 수강생이
올린 게임들을 먼저 구경할 수 있게 하고, 상단 "내 게임 업로드" 버튼으로 업로드 폼에 진입한다.
소속은 자유 입력 대신 코호트 선택으로 바꾼다.
근거: `docs/planning/DECISIONS.md` — 사용자 UX 피드백·코호트 확정.

## 설계 결정 (변경 금지)
1. **코호트 상수** (server.js, 단일 SSOT): `["2026-고대세종-ai", "2026-한이음-ai-중급"]`.
   `GET /api/cohorts` → `{ cohorts: [...] }`. 업로드 검증: `affiliation`이 목록에 없으면
   400 + "등록된 수업(코호트)을 선택하세요."
2. **갤러리 API**: `GET /api/games` → `{ games: [{ key, url, name, affiliation, uploadedAt }] }`,
   `uploadedAt` 내림차순.
   - S3 모드: `ListObjectsV2`(prefix `games/`) + 객체별 `HeadObject`로 Metadata 수집,
     `decodeURIComponent`로 한글 복원. 수백 개 규모 전제 — 페이지네이션은 1000개 한도 내 단일 호출.
   - DRY_RUN 모드: `uploads.log.jsonl` 파싱.
   - Metadata 없는(또는 디코딩 실패) 객체는 name/affiliation을 `"알 수 없음"`으로 표시하되 목록에는 포함.
3. **페이지 구조** (다크 톤·monospace 유지, 프레임워크 금지):
   - `public/index.html` = 랜딩+갤러리. 상단 고정 네비: 좌측 타이틀, **우측 "내 게임 업로드" 버튼**
     (→ `upload.html`). 히어로 한 문단: AI 리터러시 수업에서 수강생이 자기 AI 에이전트와 협업해
     만든 게임들의 갤러리이며, 카드를 누르면 바로 플레이할 수 있다는 설명.
     코호트 필터 탭(전체 + 코호트별). 게임 카드: 이름·코호트·업로드 일시, 클릭 시 새 탭으로 게임.
     게임이 없을 때 빈 상태 문구("아직 업로드된 게임이 없어요. 첫 번째 주인공이 되어 보세요!").
   - `public/upload.html` = 기존 업로드 폼 이동. 소속 입력을 `<select>`로 교체
     (`/api/cohorts`에서 로드). 상단에 "← 갤러리로 돌아가기" 링크. 성공 화면의 URL 표시·복사 유지.
4. **IAM** (infra): Lambda 역할에 `s3:ListBucket`(해당 버킷, `games/*` prefix 조건) +
   `s3:GetObject`(`games/*`) 추가 — 갤러리 조회용 최소 확장.
5. **README.md 4장** 업로드 절차를 코호트 선택 기준으로 갱신 ("소속(수업)을 선택" 문구).
6. **커밋 분리** (최소 3, 혼합은 반려): ① `feat:` API(코호트·갤러리)+검증+테스트
   ② `feat:` UI(랜딩·갤러리·업로드 페이지) ③ `feat:` infra IAM ④ `docs:` README.

## 컨텍스트 (필독 파일)
- `html-delivery/server.js`, `public/index.html` — 현행 구조
- `infra/main.tf` — IAM 인라인 정책 위치
- `README.md` 4장 — 갱신 대상

## 작업 단계
1. server.js: 코호트 상수·/api/cohorts·/api/games·업로드 검증 강화 + 순수 함수 분리
2. node --test: 코호트 검증·갤러리 정렬·메타데이터 디코딩 케이스 추가
3. UI 2페이지 작성 (DRY_RUN으로 갤러리·업로드·필터 동선 실측 — curl과 브라우저)
4. infra IAM 확장, terraform fmt·validate
5. README 4장 갱신
6. TURN_LOG 완료 헤더 + 상태 `검증 대기` + wo/007 커밋

## 완료 기준
- [ ] DRY_RUN에서: 코호트 목록 로드, 미등록 소속 400, 정상 업로드 후 /api/games에 즉시 노출,
      갤러리 카드 클릭 → 게임 열림 (curl 실측 Commands 전수 기재)
- [ ] npm test 전체 그린 (신규 케이스 포함)
- [ ] terraform validate·fmt 통과
- [ ] 커밋 분리 준수, TURN_LOG 완료 헤더 + wo/007에만 커밋

## 금지 사항
- 절대 금지 블록 준수. 검증은 단독 명령만 (긴 && 체인·node -e 금지)
- 게임 파일·lambda.js 수정 금지
- 스코프 밖: 삭제/수정 기능, 인증, 좋아요/댓글, 페이지네이션 UI, DB — 요청 없음
