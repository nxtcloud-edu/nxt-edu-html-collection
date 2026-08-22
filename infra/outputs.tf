
output "upload_app_url" {
  description = "Lambda Function URL 기반 업로드 앱 URL"
  value       = aws_lambda_function_url.uploader.function_url
}

output "service_url" {
  description = "CloudFront 커스텀 도메인 기반 서비스 URL"
  value       = "https://showcase.nxtcloud.kr"
}

output "content_url" {
  description = "격리된 학생 HTML 전용 CloudFront URL"
  value       = "https://content.showcase.nxtcloud.kr"
}
