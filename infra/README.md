# Terraform 인프라

`html-delivery` 실배포용 S3, Lambda, CloudFront, Route 53 구성을 Terraform으로 관리합니다.

## 구성

- S3 단일 비공개 버킷: 레거시 학생 콘텐츠 `games/*`, 신규 콘텐츠 `contents/*`, 관리자 ZIP `exports/*`를 저장. 학생 콘텐츠는 OAC CloudFront만 읽고 ZIP은 1일 뒤 삭제
- Lambda Node.js 20: 512MB, 120초 timeout, HTTP와 비동기 export 이벤트를 함께 처리하는 `lambda.handler`
- Lambda Function URL: CloudFront의 동적 origin
- CloudFront와 Route 53: 앱/API는 `showcase.nxtcloud.kr`, 신뢰하지 않는 학생 HTML은 별도 origin `content.showcase.nxtcloud.kr`로 제공
- 사용량 관찰: 학생 콘텐츠 CloudFront 표준 로그를 쿠키 없이 별도 비공개·AES256 S3 버킷에 저장하고 14일 후 만료
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

적용 후 `service_url`은 앱 URL, `content_url`은 학생 HTML 전용 URL입니다. 코드나 의존성이 바뀌면 `source_code_hash`가 변경되어 다음 apply에서 Lambda 코드가 갱신됩니다.

Function URL은 `authorization_type = "NONE"`이지만 공개 앱 진입점은 CloudFront 커스텀 도메인입니다. 관리자 API는 앱의 관리자 세션 인증을 요구합니다. S3 Public Access Block 4종을 켜고 버킷 정책은 전용 콘텐츠 CloudFront OAC의 `games/*`·`contents/*` 읽기만 허용합니다. ZIP 요청은 동일 Lambda를 비동기로 호출해 처리하고 `exports/*`에 저장한 뒤 15분짜리 S3 서명 URL로 제공합니다. ZIP은 1일 뒤 만료되고 작업 메타는 30일 뒤 DynamoDB TTL로 정리됩니다.

레거시 정리 관찰 로그 버킷은 `nxt-ai-literacy-content-access-logs`입니다. `IncludeCookies=false`, prefix `cloudfront/content/`, Public Access Block 4종, AES256, 14일 수명주기를 사용합니다. 최초 완전 7일 구간은 2026-08-30 22:13 KST 이후 분석할 수 있습니다.

이 작업의 코더는 `terraform plan`, `terraform apply`, `aws` CLI를 실행하지 않습니다. AWS 자격 파일도 읽지 않습니다.
