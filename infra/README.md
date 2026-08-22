# Terraform 인프라

`html-delivery` 실배포용 S3, Lambda, CloudFront, Route 53 구성을 Terraform으로 관리합니다.

## 구성

- S3 단일 버킷: 레거시 학생 콘텐츠 `games/*`와 신규 콘텐츠 `contents/*`는 공개 조회, 관리자 ZIP `exports/*`는 비공개 저장 후 1일 뒤 삭제
- Lambda Node.js 20: 512MB, 120초 timeout, HTTP와 비동기 export 이벤트를 함께 처리하는 `lambda.handler`
- Lambda Function URL: CloudFront의 동적 origin
- CloudFront와 Route 53: 앱·학생 콘텐츠를 `showcase.nxtcloud.kr` 단일 도메인으로 제공
- DynamoDB: 기존 테이블에 export 작업 메타를 함께 저장하고 `expiresAt` 기준 30일 TTL 적용
- IAM: CloudWatch Logs 기본 실행 정책, `games/*`·`contents/*` 관리 권한, `exports/*` ZIP 생성·서명 다운로드 권한, 동일 Lambda 비동기 호출 권한
- 모니터링: 비동기 호출의 자동 재시도는 끄고 Lambda `Errors >= 1/5분` CloudWatch alarm 생성
- 배포 ZIP: `html-delivery/`의 운영 코드와 `node_modules` 포함; 테스트·로컬 환경·로그·스크립트 제외
- 비용 절약: EC2, VPC 네트워크 리소스, SSM, WAF, 원격 Terraform backend는 만들지 않습니다.

## 로컬 검증

Terraform 1.5.7 기준으로 실행합니다.

```bash
terraform -chdir=infra init -backend=false
terraform -chdir=infra fmt -check
terraform -chdir=infra validate
cd html-delivery && npm test
```

`init -backend=false`는 원격 state를 만들지 않습니다. validate는 Terraform 구성의 구문과 provider 스키마만 확인하며 실제 Lambda·S3 배포 성공을 의미하지 않습니다.

## 적용·배포 준비 (검증자/운영자 전용)

`archive_file`은 로컬 `html-delivery/node_modules`를 ZIP에 포함합니다. 따라서 Terraform 적용 전에 반드시 운영 의존성을 설치해야 합니다.

```bash
cd html-delivery
npm install --omit=dev
cd ..
cp infra/terraform.tfvars.example infra/terraform.tfvars
terraform -chdir=infra apply
terraform -chdir=infra output
```

적용 후 output의 `service_url`이 앱과 학생 콘텐츠의 공개 URL입니다. 코드나 의존성이 바뀌면 `source_code_hash`가 변경되어 다음 apply에서 Lambda 코드가 갱신됩니다.

Function URL은 `authorization_type = "NONE"`이지만 공개 진입점은 CloudFront 커스텀 도메인입니다. 관리자 API는 앱의 관리자 세션 인증을 요구합니다. ZIP 요청은 동일 Lambda를 비동기로 호출해 처리하고, 공개 버킷 정책에서 제외된 `exports/*`에 저장한 뒤 15분짜리 S3 서명 URL로 제공합니다. ZIP은 1일 뒤 만료되고 작업 메타는 30일 뒤 DynamoDB TTL로 정리됩니다.

이 작업의 코더는 `terraform plan`, `terraform apply`, `aws` CLI를 실행하지 않습니다. AWS 자격 파일도 읽지 않습니다.
