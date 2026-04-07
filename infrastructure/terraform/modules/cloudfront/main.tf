locals {
  name_prefix = "vebgenix-${var.stage}"
  tags = {
    Environment = var.stage
    Project     = "vebgenix"
    ManagedBy   = "terraform"
  }

  api_aliases      = var.domain_name != "" ? ["${var.api_subdomain}.${var.domain_name}"] : []
  frontend_aliases = var.domain_name != "" ? ["${var.app_subdomain}.${var.domain_name}"] : []
}

# ---------------------------------------------------------------------------
# CloudFront Origin Access Control (OAC) for S3 frontend bucket
# ---------------------------------------------------------------------------
resource "aws_cloudfront_origin_access_control" "frontend" {
  name                              = "${local.name_prefix}-frontend-oac"
  description                       = "OAC for ${local.name_prefix} frontend S3 bucket"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

# ---------------------------------------------------------------------------
# Cache Policies
# ---------------------------------------------------------------------------

# No-cache policy for API (always forward to origin)
resource "aws_cloudfront_cache_policy" "api_no_cache" {
  name        = "${local.name_prefix}-api-no-cache"
  comment     = "No caching — pass all requests to API origin"
  default_ttl = 0
  max_ttl     = 0
  min_ttl     = 0

  parameters_in_cache_key_and_forwarded_to_origin {
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
    enable_accept_encoding_brotli = false
    enable_accept_encoding_gzip   = false
  }
}

# Origin Request Policy for API — forward all headers, query strings, cookies
resource "aws_cloudfront_origin_request_policy" "api_all_viewer" {
  name    = "${local.name_prefix}-api-all-viewer"
  comment = "Forward all viewer request headers, query strings, and cookies to API"

  cookies_config {
    cookie_behavior = "all"
  }

  headers_config {
    header_behavior = "allViewer"
  }

  query_strings_config {
    query_string_behavior = "all"
  }
}

# ---------------------------------------------------------------------------
# Distribution 1: API (EC2 EIP as origin)
# ---------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "api" {
  comment         = "${local.name_prefix} REST API distribution"
  enabled         = true
  is_ipv6_enabled = true
  price_class     = var.price_class
  aliases         = local.api_aliases
  web_acl_id      = var.enable_waf && var.waf_acl_arn != "" ? var.waf_acl_arn : null

  origin {
    domain_name = var.api_origin_ip
    origin_id   = "ec2-rest-api"

    custom_origin_config {
      http_port                = var.api_origin_port
      https_port               = 443
      origin_protocol_policy   = "http-only" # EC2 serves HTTP; CloudFront adds HTTPS
      origin_ssl_protocols     = ["TLSv1.2"]
      origin_read_timeout      = 60
      origin_keepalive_timeout = 5
    }

    custom_header {
      name  = "X-CloudFront-Secret"
      value = "${local.name_prefix}-cf-secret"
    }
  }

  default_cache_behavior {
    target_origin_id       = "ec2-rest-api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    cache_policy_id          = aws_cloudfront_cache_policy.api_no_cache.id
    origin_request_policy_id = aws_cloudfront_origin_request_policy.api_all_viewer.id
  }

  dynamic "viewer_certificate" {
    for_each = length(local.api_aliases) > 0 && var.acm_certificate_arn != "" ? [1] : []
    content {
      acm_certificate_arn      = var.acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = length(local.api_aliases) == 0 || var.acm_certificate_arn == "" ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  logging_config {
    include_cookies = false
    bucket          = aws_s3_bucket.cf_logs.bucket_domain_name
    prefix          = "api/"
  }

  tags = local.tags

  lifecycle {
    ignore_changes = [
      # Existing CDK-created distribution may have different origin/behavior config
      origin,
      logging_config,
      default_cache_behavior,
      aliases,
      viewer_certificate,
    ]
  }

  depends_on = [aws_cloudfront_cache_policy.api_no_cache]
}

# ---------------------------------------------------------------------------
# Distribution 2: Frontend (S3 bucket via OAC)
# ---------------------------------------------------------------------------
resource "aws_cloudfront_distribution" "frontend" {
  comment             = "${local.name_prefix} frontend distribution"
  enabled             = true
  is_ipv6_enabled     = true
  default_root_object = "index.html"
  price_class         = var.price_class
  aliases             = local.frontend_aliases
  web_acl_id          = var.enable_waf && var.waf_acl_arn != "" ? var.waf_acl_arn : null

  origin {
    domain_name              = var.frontend_bucket_regional_domain
    origin_id                = "s3-frontend"
    origin_access_control_id = aws_cloudfront_origin_access_control.frontend.id
  }

  default_cache_behavior {
    target_origin_id       = "s3-frontend"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true

    # Use managed cache-optimized policy
    cache_policy_id = data.aws_cloudfront_cache_policy.optimized.id
  }

  # SPA routing — serve index.html for 404/403 from S3
  custom_error_response {
    error_code            = 404
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  custom_error_response {
    error_code            = 403
    response_code         = 200
    response_page_path    = "/index.html"
    error_caching_min_ttl = 10
  }

  dynamic "viewer_certificate" {
    for_each = length(local.frontend_aliases) > 0 && var.acm_certificate_arn != "" ? [1] : []
    content {
      acm_certificate_arn      = var.acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  dynamic "viewer_certificate" {
    for_each = length(local.frontend_aliases) == 0 || var.acm_certificate_arn == "" ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  logging_config {
    include_cookies = false
    bucket          = aws_s3_bucket.cf_logs.bucket_domain_name
    prefix          = "frontend/"
  }

  tags = local.tags
}

# Data source for the managed cache-optimized policy
data "aws_cloudfront_cache_policy" "optimized" {
  name = "Managed-CachingOptimized"
}

# ---------------------------------------------------------------------------
# CloudFront access logs bucket
# ---------------------------------------------------------------------------
resource "aws_s3_bucket" "cf_logs" {
  bucket        = "${local.name_prefix}-cf-logs"
  force_destroy = var.stage == "dev"

  tags = local.tags
}

resource "aws_s3_bucket_ownership_controls" "cf_logs" {
  bucket = aws_s3_bucket.cf_logs.id

  rule {
    object_ownership = "BucketOwnerPreferred"
  }
}

resource "aws_s3_bucket_acl" "cf_logs" {
  depends_on = [aws_s3_bucket_ownership_controls.cf_logs]

  bucket = aws_s3_bucket.cf_logs.id
  acl    = "private"
}

resource "aws_s3_bucket_lifecycle_configuration" "cf_logs" {
  bucket = aws_s3_bucket.cf_logs.id

  rule {
    id     = "expire-logs"
    status = "Enabled"

    # filter {} is required by AWS provider >= 4.0 (even for apply-to-all rules)
    filter {}

    expiration {
      days = var.stage == "prod" ? 90 : 30
    }
  }
}

resource "aws_s3_bucket_public_access_block" "cf_logs" {
  bucket = aws_s3_bucket.cf_logs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "cf_logs" {
  bucket = aws_s3_bucket.cf_logs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
