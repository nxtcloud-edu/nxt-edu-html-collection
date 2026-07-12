variable "region" {
  description = "AWS 리전"
  type        = string
  default     = "ap-northeast-2"
}

variable "profile" {
  description = "AWS CLI 표준 자격 증명 프로필 이름"
  type        = string
  default     = "default"
}

variable "bucket_name" {
  description = "게임 배포 S3 버킷 이름"
  type        = string
  default     = "nxt-ai-literacy-games"

  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.bucket_name))
    error_message = "bucket_name은 소문자·숫자·점·하이픈으로 된 3~63자여야 합니다."
  }
}
