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
      Resource  = "${aws_s3_bucket.games.arn}/*"
    }]
  })
}

data "archive_file" "lambda" {
  type        = "zip"
  source_dir  = "${path.module}/../html-delivery"
  output_path = "${path.module}/html-delivery-lambda.zip"

  excludes = [
    ".env",
    ".env.example",
    ".local-deploy",
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
        Sid      = "WriteAndReadGames"
        Effect   = "Allow"
        Action   = ["s3:PutObject", "s3:GetObject"]
        Resource = "${aws_s3_bucket.games.arn}/games/*"
      },
      {
        Sid      = "ListGames"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.games.arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["games/*"]
          }
        }
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
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:UpdateItem"]
      Resource = aws_dynamodb_table.feedback.arn
    }]
  })
}

resource "aws_lambda_function" "uploader" {
  function_name = "nxt-ai-literacy-uploader"
  role          = aws_iam_role.uploader.arn
  runtime       = "nodejs20.x"
  handler       = "lambda.handler"
  memory_size   = 256
  timeout       = 15

  filename         = data.archive_file.lambda.output_path
  source_code_hash = data.archive_file.lambda.output_base64sha256

  environment {
    variables = {
      S3_BUCKET      = aws_s3_bucket.games.id
      S3_REGION      = var.region
      BASE_URL       = "https://${aws_s3_bucket.games.id}.s3.${var.region}.amazonaws.com"
      FEEDBACK_TABLE = aws_dynamodb_table.feedback.name
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
