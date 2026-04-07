output "function_arns" {
  description = "Map of function name to Lambda function ARN"
  value = {
    for k, v in aws_lambda_function.functions : k => v.arn
  }
}

output "function_names" {
  description = "Map of function name to Lambda function name"
  value = {
    for k, v in aws_lambda_function.functions : k => v.function_name
  }
}

output "dev_alias_arns" {
  description = "Map of function name to dev alias ARN"
  value = {
    for k, v in aws_lambda_alias.dev : k => v.arn
  }
}

output "prod_alias_arns" {
  description = "Map of function name to prod alias ARN"
  value = {
    for k, v in aws_lambda_alias.prod : k => v.arn
  }
}

output "execution_role_arn" {
  description = "IAM role ARN for Lambda execution"
  value       = aws_iam_role.lambda_exec.arn
}

output "execution_role_name" {
  description = "IAM role name for Lambda execution"
  value       = aws_iam_role.lambda_exec.name
}

# Convenience outputs for AppSync datasource configuration
output "appsync_resolver_dev_arns" {
  description = "Map of AppSync resolver name to dev alias ARN"
  value = {
    for k, v in aws_lambda_alias.dev :
    k => v.arn
    if contains(keys({
      "dashboard-resolver"  = true
      "students-resolver"   = true
      "finance-resolver"    = true
      "admin-resolver"      = true
      "users-resolver"      = true
      "tenants-resolver"    = true
      "admissions-resolver" = true
      "audit-logs-resolver" = true
      "storage-resolver"    = true
      "settings-resolver"   = true
    }), k)
  }
}

output "appsync_resolver_prod_arns" {
  description = "Map of AppSync resolver name to prod alias ARN"
  value = {
    for k, v in aws_lambda_alias.prod :
    k => v.arn
    if contains(keys({
      "dashboard-resolver"  = true
      "students-resolver"   = true
      "finance-resolver"    = true
      "admin-resolver"      = true
      "users-resolver"      = true
      "tenants-resolver"    = true
      "admissions-resolver" = true
      "audit-logs-resolver" = true
      "storage-resolver"    = true
      "settings-resolver"   = true
    }), k)
  }
}

output "async_worker_dev_arns" {
  description = "Map of async worker name to dev alias ARN"
  value = {
    for k, v in aws_lambda_alias.dev :
    k => v.arn
    if contains(keys({
      "email-worker"        = true
      "jobs-worker"         = true
      "cognito-provisioner" = true
    }), k)
  }
}

output "async_worker_prod_arns" {
  description = "Map of async worker name to prod alias ARN"
  value = {
    for k, v in aws_lambda_alias.prod :
    k => v.arn
    if contains(keys({
      "email-worker"        = true
      "jobs-worker"         = true
      "cognito-provisioner" = true
    }), k)
  }
}
