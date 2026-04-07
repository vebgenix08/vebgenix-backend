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

variable "frontend_url" {
  description = "Frontend application URL for Cognito callback/logout URLs"
  type        = string
  default     = ""
}

variable "additional_callback_urls" {
  description = "Additional OAuth callback URLs (e.g., localhost for dev)"
  type        = list(string)
  default     = []
}

variable "additional_logout_urls" {
  description = "Additional OAuth logout URLs (e.g., localhost for dev)"
  type        = list(string)
  default     = []
}
