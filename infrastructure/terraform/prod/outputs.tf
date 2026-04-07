# ---------------------------------------------------------------------------
# Prod environment outputs
# ---------------------------------------------------------------------------

output "cognito_user_pool_id" {
  description = "Prod Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_arn" {
  description = "Prod Cognito User Pool ARN"
  value       = module.cognito.user_pool_arn
}

output "cognito_frontend_client_id" {
  description = "Prod Cognito frontend client ID"
  value       = module.cognito.frontend_client_id
}

output "cognito_backend_client_id" {
  description = "Prod Cognito backend client ID"
  value       = module.cognito.backend_client_id
}

output "cognito_backend_client_secret" {
  description = "Prod Cognito backend client secret"
  value       = module.cognito.backend_client_secret
  sensitive   = true
}

output "appsync_graphql_url" {
  description = "Prod AppSync GraphQL endpoint"
  value       = module.appsync.graphql_url
}

output "appsync_api_id" {
  description = "Prod AppSync API ID"
  value       = module.appsync.api_id
}

output "appsync_api_key" {
  description = "Prod AppSync API key"
  value       = module.appsync.api_key
  sensitive   = true
}

output "documents_bucket_name" {
  description = "Prod S3 documents bucket name"
  value       = module.storage.documents_bucket_name
}

output "frontend_bucket_name" {
  description = "Prod S3 frontend bucket name"
  value       = module.storage.frontend_bucket_name
}

output "vpc_id" {
  description = "Prod VPC ID"
  value       = module.network.vpc_id
}

output "ec2_instance_id" {
  description = "Prod EC2 REST API instance ID"
  value       = module.ec2.instance_id
}

output "ec2_public_ip" {
  description = "Prod EC2 Elastic IP"
  value       = module.ec2.public_ip
}

# cloudfront is a single module (no count/for_each) — access directly
output "cloudfront_api_distribution_id" {
  description = "Prod CloudFront API distribution ID"
  value       = module.cloudfront.api_distribution_id
}

output "cloudfront_api_domain" {
  description = "Prod CloudFront API domain name"
  value       = module.cloudfront.api_domain_name
}

output "cloudfront_frontend_distribution_id" {
  description = "Prod CloudFront frontend distribution ID"
  value       = module.cloudfront.frontend_distribution_id
}

output "cloudfront_frontend_domain" {
  description = "Prod CloudFront frontend domain name"
  value       = module.cloudfront.frontend_domain_name
}

output "dns_nameservers" {
  description = "Route53 nameservers — update your domain registrar to use these"
  value       = var.domain_name != "" ? module.dns[0].zone_name_servers : []
}

output "api_fqdn" {
  description = "API fully qualified domain name"
  value       = var.domain_name != "" ? "${var.api_subdomain}.${var.domain_name}" : module.cloudfront.api_domain_name
}

output "app_fqdn" {
  description = "App fully qualified domain name"
  value       = var.domain_name != "" ? "${var.app_subdomain}.${var.domain_name}" : module.cloudfront.frontend_domain_name
}

output "email_queue_url" {
  description = "SQS email queue URL"
  value       = module.async.email_queue_url
}

output "jobs_queue_url" {
  description = "SQS jobs queue URL"
  value       = module.async.jobs_queue_url
}

output "event_bus_name" {
  description = "EventBridge custom event bus name"
  value       = module.async.event_bus_name
}

output "lambda_prod_alias_arns" {
  description = "Prod Lambda function prod-alias ARNs"
  value       = module.lambda.prod_alias_arns
}

output "monitoring_sns_topic_arn" {
  description = "SNS topic ARN for prod alerts"
  value       = module.monitoring.sns_topic_arn
}

output "monitoring_dashboard_name" {
  description = "CloudWatch dashboard name"
  value       = module.monitoring.dashboard_name
}
