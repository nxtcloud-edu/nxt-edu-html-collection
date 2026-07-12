output "s3_website_endpoint" {
  description = "S3 정적 웹사이트 엔드포인트"
  value       = "http://${aws_s3_bucket_website_configuration.games.website_endpoint}"
}

output "upload_app_url" {
  description = "Lambda Function URL 기반 업로드 앱 URL"
  value       = aws_lambda_function_url.uploader.function_url
}
