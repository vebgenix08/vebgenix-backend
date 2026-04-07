variable "stage" {
  description = "Deployment stage (dev or prod)"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.stage)
    error_message = "Stage must be 'dev' or 'prod'."
  }
}

variable "api_origin_ip" {
  description = "EC2 Elastic IP address for the API CloudFront distribution origin"
  type        = string
}

variable "frontend_bucket_regional_domain" {
  description = "S3 bucket regional domain name for frontend distribution"
  type        = string
}

variable "frontend_bucket_arn" {
  description = "S3 bucket ARN for frontend (used in OAC policy)"
  type        = string
}

variable "domain_name" {
  description = "Primary domain name (e.g., vebgenix.com). Leave empty to skip custom domain."
  type        = string
  default     = ""
}

variable "api_subdomain" {
  description = "Subdomain prefix for the API distribution"
  type        = string
  default     = "api"
}

variable "app_subdomain" {
  description = "Subdomain prefix for the frontend distribution"
  type        = string
  default     = "app"
}

variable "acm_certificate_arn" {
  description = "ACM certificate ARN (us-east-1) for CloudFront. Required if domain_name is set."
  type        = string
  default     = ""
}

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_200"
}

variable "api_origin_port" {
  description = "Port the EC2 REST API listens on (nginx 80)"
  type        = number
  default     = 80
}

variable "enable_waf" {
  description = "Enable AWS WAF on CloudFront distributions"
  type        = bool
  default     = false
}

variable "waf_acl_arn" {
  description = "WAF ACL ARN (us-east-1) to associate with CloudFront"
  type        = string
  default     = ""
}
