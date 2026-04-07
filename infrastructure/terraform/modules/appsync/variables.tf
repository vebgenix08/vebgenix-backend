variable "stage" {
  description = "Deployment stage (dev or prod)"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.stage)
    error_message = "Stage must be 'dev' or 'prod'."
  }
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID for AppSync authorization"
  type        = string
}

variable "cognito_user_pool_arn" {
  description = "Cognito User Pool ARN for AppSync authorization"
  type        = string
}

variable "lambda_alias_arns" {
  description = "Map of resolver name to Lambda alias ARN (dev or prod alias)"
  type        = map(string)
}

variable "lambda_execution_role_arn" {
  description = "IAM role ARN for Lambda execution (used to derive invoke role)"
  type        = string
}

variable "schema_path" {
  description = "Path to the GraphQL schema file"
  type        = string
  default     = ""
}

variable "log_field_level" {
  description = "AppSync field-level log detail (NONE, ERROR, ALL)"
  type        = string
  default     = "ERROR"
}

variable "xray_enabled" {
  description = "Enable X-Ray tracing for AppSync"
  type        = bool
  default     = true
}
