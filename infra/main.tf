resource "aws_dynamodb_table" "feedback" {
  name         = "nxt-edu-feedback"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "contentKey"
  range_key    = "createdAt"

  attribute {
    name = "contentKey"
    type = "S"
  }

  attribute {
    name = "createdAt"
    type = "S"
  }
}

resource "aws_s3_bucket" "games" {
  bucket = var.bucket_name
}

data "aws_route53_zone" "nxtcloud" {
  name         = "nxtcloud.kr."
  private_zone = false
}

data "aws_cloudfront_cache_policy" "caching_disabled" {
  name = "Managed-CachingDisabled"
}

data "aws_cloudfront_cache_policy" "caching_optimized" {
  name = "Managed-CachingOptimized"
}

data "aws_cloudfront_origin_request_policy" "all_viewer_except_host" {
  name = "Managed-AllViewerExceptHostHeader"
}

resource "aws_acm_certificate" "showcase" {
  provider          = aws.us_east_1
  domain_name       = "showcase.nxtcloud.kr"
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "showcase_certificate_validation" {
  for_each = {
    for option in aws_acm_certificate.showcase.domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  }

  zone_id = data.aws_route53_zone.nxtcloud.zone_id
  name    = each.value.name
  type    = each.value.type
  records = [each.value.record]
  ttl     = 60
}

resource "aws_acm_certificate_validation" "showcase" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.showcase.arn
  validation_record_fqdns = [for record in aws_route53_record.showcase_certificate_validation : record.fqdn]
}


resource "aws_s3_bucket_public_access_block" "games" {
  bucket = aws_s3_bucket.games.id

  block_public_acls       = false
  ignore_public_acls      = false
  block_public_policy     = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "games" {
  bucket = aws_s3_bucket.games.id

  depends_on = [aws_s3_bucket_public_access_block.games]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicReadGetObject"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource = [
        "${aws_s3_bucket.games.arn}/games/*",
        "${aws_s3_bucket.games.arn}/contents/*"
      ]
    }]
  })
}

resource "aws_s3_bucket_lifecycle_configuration" "exports" {
  bucket = aws_s3_bucket.games.id

  rule {
    id     = "expire-admin-exports"
    status = "Enabled"

    filter {
      prefix = "exports/"
    }

    expiration {
      days = 1
    }
  }
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../html-delivery"
  output_path = "${path.module}/html-delivery-lambda.zip"

  excludes = [
    ".env",
    ".env.example",
    ".local-deploy",
    ".local-exports",
    ".local-feedback.jsonl",
    ".local-registry.json",
    "scripts",
    "test",
    "uploads.log.jsonl",
  ]
}

resource "aws_iam_role" "uploader" {
  name = "nxt-ai-literacy-uploader-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "lambda_logs" {
  role       = aws_iam_role.uploader.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy" "s3_upload" {
  name = "nxt-ai-literacy-s3-upload"
  role = aws_iam_role.uploader.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "WriteAndReadContents"
        Effect = "Allow"
        Action = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = [
          "${aws_s3_bucket.games.arn}/games/*",
          "${aws_s3_bucket.games.arn}/contents/*"
        ]
      },
      {
        Sid      = "ListGames"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.games.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["games/*", "contents/*"]
          }
        }
      },
      {
        Sid      = "WriteReadExports"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
        Resource = "${aws_s3_bucket.games.arn}/exports/*"
      }
    ]
  })
}

resource "aws_iam_role_policy" "feedback" {
  name = "nxt-ai-literacy-feedback"
  role = aws_iam_role.uploader.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:UpdateItem", "dynamodb:DeleteItem"]
      Resource = aws_dynamodb_table.feedback.arn
    }]
  })
}

resource "aws_lambda_function" "uploader" {
  function_name = "nxt-ai-literacy-uploader"
  role          = aws_iam_role.uploader.arn
  runtime       = "nodejs20.x"
  handler       = "lambda.handler"
  memory_size   = 512
  timeout       = 60

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  environment {
    variables = {
      S3_BUCKET           = aws_s3_bucket.games.id
      S3_REGION           = var.region
      BASE_URL            = "https://${aws_s3_bucket.games.id}.s3.${var.region}.amazonaws.com"
      FEEDBACK_TABLE      = aws_dynamodb_table.feedback.name
      APP_BASE_URL        = "https://showcase.nxtcloud.kr"
      ADMIN_ID            = var.admin_id
      ADMIN_PASSWORD_HASH = var.admin_password_hash
      ADMIN_PASSWORD_SALT = var.admin_password_salt
      SESSION_SECRET      = var.session_secret
    }
  }

  depends_on = [
    aws_iam_role_policy.feedback,
    aws_iam_role_policy.s3_upload,
    aws_iam_role_policy_attachment.lambda_logs,
  ]
}

resource "aws_lambda_function_url" "uploader" {
  function_name      = aws_lambda_function.uploader.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_permission" "function_url" {
  statement_id           = "AllowPublicFunctionUrl"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.uploader.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_cloudfront_distribution" "showcase" {
  enabled             = true
  is_ipv6_enabled     = true
  aliases             = ["showcase.nxtcloud.kr"]
  comment             = "NXT AI literacy showcase"
  price_class         = "PriceClass_200"
  default_root_object = "index.html"

  origin {
    domain_name = trimsuffix(replace(aws_lambda_function_url.uploader.function_url, "https://", ""), "/")
    origin_id   = "lambda-function-url"

    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
      origin_read_timeout    = 60
    }
  }

  default_cache_behavior {
    target_origin_id         = "lambda-function-url"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_disabled.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  ordered_cache_behavior {
    path_pattern             = "/assets/*"
    target_origin_id         = "lambda-function-url"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    compress                 = true
    cache_policy_id          = data.aws_cloudfront_cache_policy.caching_optimized.id
    origin_request_policy_id = data.aws_cloudfront_origin_request_policy.all_viewer_except_host.id
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.showcase.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_route53_record" "showcase_ipv4" {
  zone_id = data.aws_route53_zone.nxtcloud.zone_id
  name    = "showcase.nxtcloud.kr"
  type    = "A"

  alias {
    name                   = aws_cloudfront_distribution.showcase.domain_name
    zone_id                = aws_cloudfront_distribution.showcase.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "showcase_ipv6" {
  zone_id = data.aws_route53_zone.nxtcloud.zone_id
  name    = "showcase.nxtcloud.kr"
  type    = "AAAA"

  alias {
    name                   = aws_cloudfront_distribution.showcase.domain_name
    zone_id                = aws_cloudfront_distribution.showcase.hosted_zone_id
    evaluate_target_health = false
  }
}
