# WO-003: Terraform 인프라 (S3 + EC2 + IAM) 및 S3 모드 URL 수정
상태: 대기
작성: Claude (Planner) / 실행: Hermes (Coder)
워크트리 게이트: `wo/003` 브랜치 (README 규칙)

## 목표
html-delivery 실배포 인프라를 Terraform으로 코드화한다: 수강생 게임을 서빙할 S3 정적 호스팅
버킷 + Express 업로드 앱을 상시 구동할 EC2. 함께, DRY_RUN에서 안 드러난 S3 모드 URL 버그를 고친다.
근거: `docs/planning/DECISIONS.md` — Terraform IaC·EC2 신규·서울 리전·default 프로필·단일 버킷 확정.
퍼블릭 레포(https://github.com/nxtcloud-edu/nxt-ai-literacy)가 연결되어 EC2 배포는 git clone 방식.

## 설계 결정 (변경 금지)
1. **위치**: 루트 `infra/` — `main.tf`, `variables.tf`, `outputs.tf` (파일 분리는 이 3개 기준,
   리소스가 많은 부분은 `s3.tf`·`ec2.tf`로 나눠도 좋다). backend는 local state.
2. **provider**: `hashicorp/aws ~> 5.0`, region 변수 기본 `ap-northeast-2`, profile 변수 기본 `default`.
   **Terraform v1.5.7 문법 호환** (검증자 로컬 버전 — 이보다 새 문법 금지).
3. **S3**: `aws_s3_bucket`(이름은 `bucket_name` 변수, 기본 `nxt-ai-literacy-games`) +
   `aws_s3_bucket_website_configuration` + `aws_s3_bucket_public_access_block`(4개 모두 false) +
   `aws_s3_bucket_policy`(퍼블릭 `s3:GetObject`). 버전 관리·암호화 커스텀 불필요.
4. **EC2**: `aws_instance` — AL2023 최신 AMI(data source), 타입 변수 기본 `t3.micro`.
   보안 그룹: ingress 80/tcp(0.0.0.0/0)만, **22 열지 않음** — 원격 접속은 SSM Session Manager.
   IAM role + instance profile: `AmazonSSMManagedInstanceCore` 관리형 정책 +
   해당 버킷 `games/*`에 `s3:PutObject`만 허용하는 최소 인라인 정책.
5. **user_data**: dnf로 nodejs20·git 설치 → 퍼블릭 레포 clone → `html-delivery` npm install →
   systemd 유닛 생성·기동. 유닛은 `PORT=80` + `AmbientCapabilities=CAP_NET_BIND_SERVICE`
   (root 상시 실행 금지, 전용 유저), 환경변수 `S3_BUCKET`·`S3_REGION`·`BASE_URL`(S3 웹사이트
   엔드포인트) 주입 — Terraform 리소스 참조로 조립.
6. **publicUrl 버그 수정** (`html-delivery/server.js`): S3 모드(`S3_BUCKET` 설정 시)의 발급 URL은
   `${BASE_URL}/${key}` (S3 웹사이트 엔드포인트 직결), DRY_RUN은 기존 `${BASE_URL}/deployed/${key}`
   유지. 단위 테스트 추가.
7. **provision-s3.sh 제거**: Terraform이 IaC SSOT — 별도 `tidy:` 커밋으로 삭제 (README 참조도 정리).
8. **outputs**: 버킷 웹사이트 엔드포인트, EC2 퍼블릭 IP, 업로드 앱 URL(`http://<ip>`).
9. **코더의 클라우드 금지 유지**: 허용 명령은 `terraform init -backend=false`, `terraform fmt`,
   `terraform validate`, `npm test`뿐. **plan/apply/aws CLI 절대 금지** — apply는 검증자 몫.

## 컨텍스트 (필독 파일)
- `html-delivery/server.js` — publicUrl 수정 대상
- `html-delivery/scripts/provision-s3.sh` — 대체·제거 대상 (BPA 해제 등 반영 사항을 TF로 승계)
- `html-delivery/README.md` — 배포 절차 문단 갱신 대상
- `docs/planning/DECISIONS.md`, `.agent/work-orders/README.md` — 확정 결정·절대 금지 블록

## 작업 단계
1. `infra/` 작성 (S3 → IAM → EC2 → user_data 순 권장)
2. `server.js` publicUrl 분기 수정 + `node --test` 테스트 추가
3. `terraform init -backend=false && terraform fmt -check && terraform validate` 그린
4. `npm test` 그린
5. provision-s3.sh 제거 + README 배포 절차를 Terraform 기준으로 갱신 (`tidy:` 커밋 분리)
6. TURN_LOG(완료 헤더, Commands 전수) + 상태 `검증 대기` (커밋은 wo/003에만)

## 완료 기준
- [ ] `terraform validate` 통과 (init은 -backend=false), `terraform fmt -check` 통과
- [ ] user_data가 클라우드에서 손 안 대고 앱을 80포트로 올리는 완결 스크립트일 것
      (레포 clone → install → systemd enable --now)
- [ ] publicUrl S3 모드 수정 + 테스트, `npm test` 전체 그린
- [ ] provision-s3.sh 제거, README 갱신
- [ ] TURN_LOG 완료 헤더 + wo/003에만 커밋 (타입 접두사)

## 금지 사항
- 절대 금지 블록: **terraform plan/apply, aws CLI, AWS 자격 파일 읽기 일체 금지**
- `box-game/`·`run-game/` 수정 금지
- 스코프 밖: CloudFront, Route53/도메인, HTTPS 인증서, Auto Scaling, 원격 backend — 요청 없음
- Terraform 1.5.7 초과 문법(예: 신형 import 블록 활용 등) 금지
