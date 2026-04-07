output "api_distribution_id" {
  description = "CloudFront API distribution ID"
  value       = aws_cloudfront_distribution.api.id
}

output "api_distribution_arn" {
  description = "CloudFront API distribution ARN"
  value       = aws_cloudfront_distribution.api.arn
}

output "api_domain_name" {
  description = "CloudFront API distribution domain name"
  value       = aws_cloudfront_distribution.api.domain_name
}

output "api_hosted_zone_id" {
  description = "CloudFront API distribution hosted zone ID (for Route53 alias records)"
  value       = aws_cloudfront_distribution.api.hosted_zone_id
}

output "frontend_distribution_id" {
  description = "CloudFront frontend distribution ID"
  value       = aws_cloudfront_distribution.frontend.id
}

output "frontend_distribution_arn" {
  description = "CloudFront frontend distribution ARN"
  value       = aws_cloudfront_distribution.frontend.arn
}

output "frontend_domain_name" {
  description = "CloudFront frontend distribution domain name"
  value       = aws_cloudfront_distribution.frontend.domain_name
}

output "frontend_hosted_zone_id" {
  description = "CloudFront frontend distribution hosted zone ID (for Route53 alias records)"
  value       = aws_cloudfront_distribution.frontend.hosted_zone_id
}

output "oac_id" {
  description = "CloudFront Origin Access Control ID for frontend S3 bucket"
  value       = aws_cloudfront_origin_access_control.frontend.id
}

output "logs_bucket_name" {
  description = "S3 bucket name for CloudFront access logs"
  value       = aws_s3_bucket.cf_logs.id
}
