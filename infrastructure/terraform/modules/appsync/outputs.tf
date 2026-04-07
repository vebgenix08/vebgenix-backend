output "api_id" {
  description = "AppSync GraphQL API ID"
  value       = aws_appsync_graphql_api.main.id
}

output "api_arn" {
  description = "AppSync GraphQL API ARN"
  value       = aws_appsync_graphql_api.main.arn
}

output "graphql_url" {
  description = "AppSync GraphQL endpoint URL"
  value       = aws_appsync_graphql_api.main.uris["GRAPHQL"]
}

output "realtime_url" {
  description = "AppSync real-time (subscriptions) endpoint URL"
  value       = aws_appsync_graphql_api.main.uris["REALTIME"]
}

output "api_key" {
  description = "AppSync default API key"
  value       = aws_appsync_api_key.main.key
  sensitive   = true
}

output "datasource_names" {
  description = "Map of resolver name to AppSync datasource name"
  value = {
    for k, v in aws_appsync_datasource.lambda_resolvers : k => v.name
  }
}

output "function_ids" {
  description = "Map of resolver name to AppSync function ID"
  value = {
    for k, v in aws_appsync_function.resolver_functions : k => v.function_id
  }
}

output "lambda_invoke_role_arn" {
  description = "IAM role ARN used by AppSync to invoke Lambda"
  value       = aws_iam_role.appsync_lambda_invoke.arn
}
