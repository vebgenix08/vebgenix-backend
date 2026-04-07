output "zone_id" {
  description = "Route53 hosted zone ID"
  value       = aws_route53_zone.main.zone_id
}

output "zone_name_servers" {
  description = "Route53 name servers — update your domain registrar (e.g., GoDaddy) to use these"
  value       = aws_route53_zone.main.name_servers
}

output "certificate_arn" {
  description = "ACM certificate ARN (us-east-1) for use with CloudFront"
  value       = aws_acm_certificate_validation.main.certificate_arn
}

output "certificate_status" {
  description = "ACM certificate validation status"
  value       = aws_acm_certificate.main.status
}
