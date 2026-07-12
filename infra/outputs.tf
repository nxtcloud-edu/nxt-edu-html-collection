
output "upload_app_url" {
  description = "Lambda Function URL 기반 업로드 앱 URL"
  value       = aws_lambda_function_url.uploader.function_url
}
