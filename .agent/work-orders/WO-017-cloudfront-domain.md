# WO-017: CloudFront + showcase.nxtcloud.kr 커스텀 도메인
상태: 완료 (2026-07-13, 검증자 Claude — 구성 검토·validate·테스트 17/17 통과, main 머지·apply)
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/017` 브랜치

## 목표
Lambda Function URL 앞에 CloudFront를 붙여 `https://showcase.nxtcloud.kr`로 서비스한다.
근거: `docs/planning/DECISIONS.md` 2026-07-13 도메인 결정.
전제: nxtcloud.kr 호스티드 존은 default 계정에 존재 (`Z02981963ALYPFUMUTI0W` — data source로 조회).

## 설계 결정 (변경 금지)
1. **ACM**: `showcase.nxtcloud.kr` 인증서를 **us-east-1**에 발급 (CloudFront 요구) —
   `provider "aws" { alias = "us_east_1", region = "us-east-1", profile = var.profile }` 추가.
   DNS 검증: Route53 레코드 자동 생성(`aws_acm_certificate_validation` 포함, for_each 방식).
2. **CloudFront distribution**:
   - origin: Lambda Function URL 도메인 (custom origin, `https-only`,
     `aws_lambda_function_url.uploader.function_url`에서 도메인 추출 — `replace()`+`trimsuffix()`).
   - aliases `["showcase.nxtcloud.kr"]`, viewer `redirect-to-https`, PriceClass_200.
   - 기본 behavior: allowed_methods 전체(GET~DELETE — POST 업로드·피드백 필요),
     **managed cache policy `CachingDisabled`** + **managed origin request policy
     `AllViewerExceptHostHeader`** (Host를 전달하면 Lambda URL이 거부 — 필수).
   - `/assets/*` behavior: `CachingOptimized` + 같은 origin request policy (정적 자산 캐시).
   - custom header `X-Forwarded-Host: showcase.nxtcloud.kr`는 넣지 않는다 — 대신 3의 env 방식.
3. **발급 URL 고정**: Lambda 환경변수 `APP_BASE_URL = "https://showcase.nxtcloud.kr"` 추가.
   `server.js`의 `requestBaseUrl()`이 `process.env.APP_BASE_URL`을 최우선으로 사용
   (없으면 기존 헤더 기반 동작 — DRY_RUN 무영향). 테스트 1건 추가.
4. **Route53**: `showcase.nxtcloud.kr` A/AAAA alias → distribution (zone은 data source 조회).
5. **outputs**: `service_url = "https://showcase.nxtcloud.kr"` 추가, 기존 Lambda URL output 유지.
6. Terraform 1.5.7 호환, fmt·validate까지만 (plan/apply·aws CLI 금지 — 검증자 수행).
7. **커밋 분리** (최소 2): ① feat: infra(ACM·CloudFront·Route53·env) ② feat: server APP_BASE_URL+테스트
   (+ docs README 필요 시 분리).

## 컨텍스트 (필독 파일)
- `infra/main.tf`·`versions.tf`·`outputs.tf`, `html-delivery/server.js`(requestBaseUrl)

## 작업 단계
1. server.js APP_BASE_URL 우선 적용 + node --test
2. infra: us-east-1 provider·ACM·CloudFront·Route53·env
3. terraform init -backend=false / fmt -check / validate, npm test 그린
4. TURN_LOG 완료 헤더 + 상태 `검증 대기` + wo/017 커밋

## 완료 기준
- [ ] validate·fmt·npm test 그린, managed policy ID가 아닌 name/data source 사용으로 가독성 확보
- [ ] Host 미전달(AllViewerExceptHostHeader) 확인 가능하게 구성
- [ ] TURN_LOG 완료 헤더 + wo/017에만 커밋

## 금지 사항
- 절대 금지 블록 준수 (plan/apply·aws CLI·자격 접근 금지). 검증은 단독 명령만
- Lambda URL 자체 제거·차단 금지 (직접 접근 허용 유지)
- 스코프 밖: WAF, 캐시 무효화 자동화, 다중 도메인 — 요청 없음
