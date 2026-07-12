# Terraform 인프라

`html-delivery` 실배포용 S3 정적 웹사이트와 Lambda Function URL 업로드 앱을 Terraform으로 관리합니다.

## 구성

- S3 단일 버킷: 웹사이트 호스팅, 퍼블릭 `s3:GetObject`, 업로드 객체 저장
- Lambda Node.js 20: 256MB, 15초 timeout, `lambda.handler`
- Lambda Function URL: 인증 없는 공개 HTTPS 업로드 창구
- IAM: CloudWatch Logs 기본 실행 정책과 해당 버킷 `games/*` 대상 `s3:PutObject` 최소 권한
- 배포 ZIP: `html-delivery/`의 운영 코드와 `node_modules` 포함; 테스트·로컬 환경·로그·스크립트 제외
- 비용 절약: EC2, VPC 네트워크 리소스, SSM, WAF, CloudFront, Route 53, 커스텀 도메인, 원격 Terraform backend는 만들지 않습니다.

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

적용 후 output의 `upload_app_url`은 공개 HTTPS Function URL이고, `s3_website_endpoint`는 학생 게임 URL의 기반입니다. 코드나 의존성이 바뀌면 `source_code_hash`가 변경되어 다음 apply에서 Lambda 코드가 갱신됩니다.

Function URL은 `authorization_type = "NONE"`이므로 인터넷에서 접근할 수 있습니다. 현재 수업용 공개 업로드 창구라는 제품 결정에 따른 설정이며, 별도의 API Gateway·인증·도메인은 범위에 포함하지 않습니다.

이 작업의 코더는 `terraform plan`, `terraform apply`, `aws` CLI를 실행하지 않습니다. AWS 자격 파일도 읽지 않습니다.
