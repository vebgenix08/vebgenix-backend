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

variable "neon_database_url" {
  description = "Neon PostgreSQL connection string"
  type        = string
  sensitive   = true
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
}

variable "cognito_client_id" {
  description = "Cognito User Pool Client ID (backend)"
  type        = string
}

variable "cognito_client_secret" {
  description = "Cognito User Pool Client secret (backend)"
  type        = string
  sensitive   = true
}

variable "documents_bucket_name" {
  description = "S3 bucket name for document storage"
  type        = string
  default     = ""
}

variable "prod_lambda_version" {
  description = "Lambda version number to use for the 'prod' alias"
  type        = string
  default     = "1"
}

variable "additional_env_vars" {
  description = "Additional environment variables to pass to all Lambda functions"
  type        = map(string)
  default     = {}
}

variable "vpc_subnet_ids" {
  description = "List of VPC subnet IDs for Lambda (if VPC access needed)"
  type        = list(string)
  default     = []
}

variable "vpc_security_group_ids" {
  description = "List of security group IDs for Lambda VPC config"
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "CloudWatch log group retention in days"
  type        = number
  default     = 7
}

variable "appsync_api_id" {
  description = "AppSync API ID for granting invoke permissions"
  type        = string
  default     = ""
}
