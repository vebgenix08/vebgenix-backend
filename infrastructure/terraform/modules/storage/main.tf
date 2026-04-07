locals {
  name_prefix             = "vebgenix"
  documents_bucket_name   = "${local.name_prefix}-documents-${var.stage}-${var.aws_account_id}"
  frontend_bucket_name    = "${local.name_prefix}-frontend-${var.stage}-${var.aws_account_id}"
  cors_allowed_origins = compact([
    var.frontend_url != "" ? var.frontend_url : null,
    var.stage == "dev" ? "http://localhost:3000" : null,
    var.stage == "dev" ? "http://localhost:5173" : null,
  ])
  tags = {
    Environment = var.stage
    Project     = "vebgenix"
    ManagedBy   = "terraform"
  }
}

# ---------------------------------------------------------------------------
# Documents Bucket
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "documents" {
  bucket        = local.documents_bucket_name
  force_destroy = var.force_destroy

  tags = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "documents" {
  bucket = aws_s3_bucket.documents.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Block all public access to documents bucket
resource "aws_s3_bucket_public_access_block" "documents" {
  bucket = aws_s3_bucket.documents.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_cors_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "PUT", "POST", "DELETE", "HEAD"]
    allowed_origins = length(local.cors_allowed_origins) > 0 ? local.cors_allowed_origins : ["*"]
    expose_headers  = ["ETag", "Content-Length", "Content-Type"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "documents" {
  bucket = aws_s3_bucket.documents.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    transition {
      days          = 90
      storage_class = "STANDARD_IA"
    }
  }

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# ---------------------------------------------------------------------------
# Frontend Static Files Bucket (optional in dev)
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "frontend" {
  count = var.create_frontend_bucket ? 1 : 0

  bucket        = local.frontend_bucket_name
  force_destroy = var.force_destroy

  tags = local.tags

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "frontend" {
  count = var.create_frontend_bucket ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "frontend" {
  count = var.create_frontend_bucket ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Block direct public access — CloudFront serves content via OAC
resource "aws_s3_bucket_public_access_block" "frontend" {
  count = var.create_frontend_bucket ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "frontend" {
  count = var.create_frontend_bucket ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  rule {
    id     = "expire-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# S3 bucket policy — allow CloudFront OAC to read frontend bucket
resource "aws_s3_bucket_policy" "frontend" {
  count = var.create_frontend_bucket && var.cloudfront_distribution_arn != "" ? 1 : 0

  bucket = aws_s3_bucket.frontend[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.frontend[0].arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = var.cloudfront_distribution_arn
          }
        }
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# IAM Policy for Lambda access to documents bucket
# ---------------------------------------------------------------------------
resource "aws_iam_policy" "lambda_documents_access" {
  name        = "${local.name_prefix}-lambda-documents-${var.stage}"
  description = "Allow Lambda functions to access the documents S3 bucket"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectAttributes",
          "s3:GetObjectVersion",
          "s3:DeleteObjectVersion",
        ]
        Resource = "${aws_s3_bucket.documents.arn}/*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ]
        Resource = aws_s3_bucket.documents.arn
      },
      # S3 presigned URL generation (no specific resource needed)
      {
        Effect = "Allow"
        Action = [
          "s3:GeneratePresignedPost",
        ]
        Resource = "${aws_s3_bucket.documents.arn}/*"
      }
    ]
  })

  tags = local.tags
}
