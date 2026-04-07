variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
  default     = "278035644568" # Prod account
}

variable "neon_api_key" {
  description = "Neon serverless PostgreSQL API key"
  type        = string
  sensitive   = true
}

variable "neon_database_url" {
  description = "Neon PostgreSQL connection string for prod environment"
  type        = string
  sensitive   = true
}

variable "frontend_url" {
  description = "Frontend application URL (prod)"
  type        = string
  default     = ""
}

variable "domain_name" {
  description = "Root domain name (e.g., vebgenix.com). Leave empty to skip DNS/custom domain setup."
  type        = string
  default     = ""
}

variable "api_subdomain" {
  description = "API subdomain prefix"
  type        = string
  default     = "api"
}

variable "app_subdomain" {
  description = "Frontend app subdomain prefix"
  type        = string
  default     = "app"
}

variable "prod_lambda_version" {
  description = "Lambda version number for the prod alias"
  type        = string
  default     = "1"
}

variable "alert_email" {
  description = "Email address for CloudWatch alarm notifications"
  type        = string
  default     = ""
}

variable "ec2_instance_type" {
  description = "EC2 instance type for REST API"
  type        = string
  default     = "t4g.small"
}

variable "ec2_volume_size_gb" {
  description = "EC2 root volume size in GB"
  type        = number
  default     = 20
}

variable "availability_zones" {
  description = "Availability zones for subnets"
  type        = list(string)
  default     = ["ap-south-1a", "ap-south-1b"]
}
