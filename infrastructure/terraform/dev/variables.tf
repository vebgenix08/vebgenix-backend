variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
  default     = "998105438053" # Dev account
}

variable "neon_api_key" {
  description = "Neon serverless PostgreSQL API key"
  type        = string
  sensitive   = true
}

variable "neon_database_url" {
  description = "Neon PostgreSQL connection string for dev environment"
  type        = string
  sensitive   = true
}

variable "frontend_url" {
  description = "Frontend application URL (dev)"
  type        = string
  default     = "http://localhost:3000"
}

variable "prod_lambda_version" {
  description = "Lambda version for the prod alias (in dev, typically '1')"
  type        = string
  default     = "1"
}

variable "alert_email" {
  description = "Email address for CloudWatch alarm notifications (dev)"
  type        = string
  default     = ""
}
