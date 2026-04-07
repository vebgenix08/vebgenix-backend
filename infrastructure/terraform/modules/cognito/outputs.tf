output "user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "Cognito User Pool ARN"
  value       = aws_cognito_user_pool.main.arn
}

output "user_pool_endpoint" {
  description = "Cognito User Pool endpoint"
  value       = aws_cognito_user_pool.main.endpoint
}

output "frontend_client_id" {
  description = "Cognito User Pool Client ID for frontend"
  value       = aws_cognito_user_pool_client.frontend.id
}

output "backend_client_id" {
  description = "Cognito User Pool Client ID for backend"
  value       = aws_cognito_user_pool_client.backend.id
}

output "backend_client_secret" {
  description = "Cognito User Pool Client secret for backend"
  value       = aws_cognito_user_pool_client.backend.client_secret
  sensitive   = true
}

output "identity_pool_id" {
  description = "Cognito Identity Pool ID"
  value       = aws_cognito_identity_pool.main.id
}

output "domain" {
  description = "Cognito hosted UI domain"
  value       = aws_cognito_user_pool_domain.main.domain
}
