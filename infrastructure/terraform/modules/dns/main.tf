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
# Creates the zone — after apply, copy the NS records to GoDaddy nameservers
# ---------------------------------------------------------------------------
resource "aws_route53_zone" "main" {
  name    = var.domain_name
  comment = "Managed by Terraform for ${local.name_prefix}"
  tags    = local.tags
}

# ---------------------------------------------------------------------------
# ACM Certificate (MUST be in us-east-1 for CloudFront)
# Wildcard cert covers app.vebgenix.com, api.vebgenix.com, and any future subdomain
# ---------------------------------------------------------------------------
resource "aws_acm_certificate" "main" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  validation_method         = "DNS"

  subject_alternative_names = [
    "*.${var.domain_name}",
  ]

  tags = merge(local.tags, { Name = "${local.name_prefix}-cert" })

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
# NOTE: Route53 A/AAAA records pointing to CloudFront are created in
# prod/main.tf as standalone resources AFTER cloudfront module runs.
# This avoids the cloudfront ↔ dns circular dependency.
# ---------------------------------------------------------------------------
