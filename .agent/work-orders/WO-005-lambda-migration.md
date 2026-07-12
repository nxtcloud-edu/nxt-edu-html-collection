# WO-005: 업로드 앱 EC2 → Lambda Function URL 전환 (비용 최적화)
상태: 완료 (2026-07-12, 검증자 Claude — validate·테스트 8/8 통과, 커밋 분리 준수, main 머지)
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/005` 브랜치 (README 규칙)

## 목표
업로드 앱 운영을 상시 EC2에서 Lambda Function URL로 전환해 유휴 비용을 제거한다(사실상 $0/월).
근거: `docs/planning/DECISIONS.md` — 사용자 확정. 수업 시간에만 트래픽이 있는 버스트 패턴.
S3 정적 호스팅(수강생 게임 서빙)은 그대로 유지 — 바뀌는 것은 "업로드 창구"뿐이다.

## 설계 결정 (변경 금지)
1. **앱**: Express 구조 유지. `html-delivery/lambda.js` 추가 — `serverless-http`로
   `createApp()`을 감싸 `handler` export. `server.js`(로컬 DRY_RUN 경로)는 수정하지 않는다.
   의존성 추가는 `serverless-http` 1개만.
2. **infra 제거**: `aws_instance`, `aws_security_group`, `aws_iam_instance_profile`,
   SSM 정책 attachment, `data.aws_ami`·`data.aws_vpc`·`data.aws_subnets` — EC2 관련 전부.
3. **infra 추가** (Terraform 1.5.7 호환):
   - `data "archive_file"` — `html-delivery/`를 zip 패키징. 제외: `test/`, `.env*`,
     `.local-deploy/`, `uploads.log.jsonl`, `scripts/`. **`node_modules`는 포함**
     (apply 전 `npm install --omit=dev` 필요 — README에 명시).
   - `aws_lambda_function` — runtime `nodejs20.x`, handler `lambda.handler`,
     memory 256MB, timeout 15s, 환경변수 `S3_BUCKET`·`S3_REGION`·`BASE_URL`(S3 웹사이트
     엔드포인트, `http://` 포함). `source_code_hash`로 재배포 감지.
   - `aws_lambda_function_url` — authorization_type `NONE` +
     `aws_lambda_permission`(principal `*`, action `lambda:InvokeFunctionUrl`,
     function_url_auth_type `NONE`).
   - IAM: Lambda assume role + `AWSLambdaBasicExecutionRole` 관리형 정책 +
     버킷 `games/*` `s3:PutObject` 인라인 정책 (기존 최소권한 원칙 유지).
4. **outputs**: `upload_app_url`을 Function URL로 교체, `s3_website_endpoint` 유지,
   `ec2_public_ip` 제거.
5. **업로드 로그**: Lambda 파일시스템은 휘발성 — `uploads.log.jsonl` append는 S3 모드에서
   실패해도 업로드 응답을 막지 않게 try/catch로 감싼다(로그 실패는 콘솔 경고만).
   S3 객체 Metadata가 소속·이름의 영구 기록이다.
6. **커밋 분리** (WO-003 환류 — 미분리는 반려): ① `feat:` 앱 어댑터(lambda.js·package.json)
   ② `feat:` 인프라 전환(infra/) ③ `docs:` README 갱신 — 최소 이 단위로.

## 컨텍스트 (필독 파일)
- `html-delivery/server.js` — createApp export 구조 (수정 금지, import만)
- `infra/main.tf` — 제거·추가 대상
- `docs/planning/DECISIONS.md`, `.agent/work-orders/README.md`

## 작업 단계
1. `lambda.js` + `serverless-http` 의존성 + `npm install` (lockfile 갱신)
2. infra 전환 (제거 → 추가), `terraform -chdir=infra fmt -check && validate`
3. `npm test` 그린 (기존 7건 — lambda.js는 얇은 래퍼라 단위 테스트 불요, TURN_LOG에 명시)
4. `html-delivery/README.md`·`infra/README.md` — Lambda 기준 운영 절차로 갱신
   (apply 전 `npm install --omit=dev` 필수 단계 포함)
5. TURN_LOG 완료 헤더 + 상태 `검증 대기` + wo/005 커밋

## 완료 기준
- [ ] terraform validate·fmt 통과, EC2 관련 리소스·데이터소스 완전 제거
- [ ] lambda.js가 createApp 재사용 (중복 앱 정의 없음)
- [ ] npm test 그린, README 2종 갱신
- [ ] 커밋 3개 이상으로 목적 분리 (혼합 커밋은 반려)
- [ ] TURN_LOG 완료 헤더 + wo/005에만 커밋

## 금지 사항
- 절대 금지 블록: terraform plan/apply·aws CLI·AWS 자격 파일 읽기 금지 (apply는 검증자)
- `server.js`·게임 파일 수정 금지
- 스코프 밖: API Gateway, CloudFront, 커스텀 도메인, S3 업로드 로그 저장소 — 요청 없음
