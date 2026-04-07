locals {
  name_prefix = "vebgenix-${var.stage}"
  tags = {
    Environment = var.stage
    Project     = "vebgenix"
    ManagedBy   = "terraform"
  }
}

# ---------------------------------------------------------------------------
# Route53 Hosted Zone
# ---------------------------------------------------------------------------
resource "aws_route53_zone" "main" {
  name    = var.domain_name
  comment = "Managed by Terraform for ${local.name_prefix}"

  tags = local.tags
}

# ---------------------------------------------------------------------------
# ACM Certificate (MUST be in us-east-1 for CloudFront)
# ---------------------------------------------------------------------------
resource "aws_acm_certificate" "main" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  validation_method         = "DNS"

  subject_alternative_names = [
    "*.${var.domain_name}",          # Wildcard covers all subdomains
    "${var.api_subdomain}.${var.domain_name}",
    "${var.app_subdomain}.${var.domain_name}",
  ]

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-cert"
  })

  lifecycle {
    create_before_destroy = true
  }
}

# ---------------------------------------------------------------------------
# DNS Validation Records for ACM Certificate
# ---------------------------------------------------------------------------
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options :
    dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.main.zone_id
}

resource "aws_acm_certificate_validation" "main" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]

  depends_on = [aws_route53_record.cert_validation]
}

# ---------------------------------------------------------------------------
# DNS Records — API subdomain → CloudFront API distribution
# ---------------------------------------------------------------------------
resource "aws_route53_record" "api_a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.api_cloudfront_domain
    zone_id                = var.api_cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "api_aaaa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = var.api_cloudfront_domain
    zone_id                = var.api_cloudfront_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------------------------------------
# DNS Records — App subdomain → CloudFront frontend distribution
# ---------------------------------------------------------------------------
resource "aws_route53_record" "app_a" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "${var.app_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = var.frontend_cloudfront_domain
    zone_id                = var.frontend_cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "app_aaaa" {
  zone_id = aws_route53_zone.main.zone_id
  name    = "${var.app_subdomain}.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = var.frontend_cloudfront_domain
    zone_id                = var.frontend_cloudfront_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------------------------------------
# Root domain → frontend (optional)
# ---------------------------------------------------------------------------
resource "aws_route53_record" "root_a" {
  count = var.create_root_redirect ? 1 : 0

  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = var.frontend_cloudfront_domain
    zone_id                = var.frontend_cloudfront_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "root_aaaa" {
  count = var.create_root_redirect ? 1 : 0

  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = var.frontend_cloudfront_domain
    zone_id                = var.frontend_cloudfront_zone_id
    evaluate_target_health = false
  }
}

# ---------------------------------------------------------------------------
# MX / TXT records placeholder (update when email provider is chosen)
# ---------------------------------------------------------------------------
# Add SES DKIM, SPF, DMARC records here once configured.
# Example:
# resource "aws_route53_record" "spf" {
#   zone_id = aws_route53_zone.main.zone_id
#   name    = var.domain_name
#   type    = "TXT"
#   ttl     = 300
#   records = ["v=spf1 include:amazonses.com ~all"]
# }
