variable "stage" {
  description = "Deployment stage (dev or prod)"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.stage)
    error_message = "Stage must be 'dev' or 'prod'."
  }
}

variable "aws_account_id" {
  description = "AWS account ID (used for bucket naming)"
  type        = string
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "frontend_url" {
  description = "Frontend URL for CORS configuration (e.g., https://app.vebgenix.com)"
  type        = string
  default     = ""
}

variable "cloudfront_oac_id" {
  description = "CloudFront Origin Access Control ID for frontend bucket policy"
  type        = string
  default     = ""
}

variable "cloudfront_distribution_arn" {
  description = "CloudFront distribution ARN for frontend bucket policy"
  type        = string
  default     = ""
}

variable "create_frontend_bucket" {
  description = "Whether to create the frontend static files bucket"
  type        = bool
  default     = true
}

variable "force_destroy" {
  description = "Allow destruction of non-empty buckets (set true for dev only)"
  type        = bool
  default     = false
}
