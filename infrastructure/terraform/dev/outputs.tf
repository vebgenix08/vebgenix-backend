# ---------------------------------------------------------------------------
# Dev environment outputs
# ---------------------------------------------------------------------------

output "cognito_user_pool_id" {
  description = "Dev Cognito User Pool ID"
  value       = module.cognito.user_pool_id
}

output "cognito_user_pool_arn" {
  description = "Dev Cognito User Pool ARN"
  value       = module.cognito.user_pool_arn
}

output "cognito_frontend_client_id" {
  description = "Dev Cognito frontend client ID"
  value       = module.cognito.frontend_client_id
}

output "cognito_backend_client_id" {
  description = "Dev Cognito backend client ID"
  value       = module.cognito.backend_client_id
}

output "cognito_backend_client_secret" {
  description = "Dev Cognito backend client secret"
  value       = module.cognito.backend_client_secret
  sensitive   = true
}

output "appsync_graphql_url" {
  description = "Dev AppSync GraphQL endpoint"
  value       = module.appsync.graphql_url
}

output "appsync_api_id" {
  description = "Dev AppSync API ID"
  value       = module.appsync.api_id
}

output "appsync_api_key" {
  description = "Dev AppSync API key"
  value       = module.appsync.api_key
  sensitive   = true
}

output "documents_bucket_name" {
  description = "Dev S3 documents bucket name"
  value       = module.storage.documents_bucket_name
}

output "lambda_dev_alias_arns" {
  description = "Dev Lambda function dev-alias ARNs"
  value       = module.lambda.dev_alias_arns
}

output "lambda_prod_alias_arns" {
  description = "Dev Lambda function prod-alias ARNs"
  value       = module.lambda.prod_alias_arns
}

output "monitoring_sns_topic_arn" {
  description = "SNS topic ARN for dev alerts"
  value       = module.monitoring.sns_topic_arn
}
