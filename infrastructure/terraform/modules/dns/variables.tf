variable "stage" {
  description = "Deployment stage (dev or prod)"
  type        = string
  validation {
    condition     = contains(["dev", "prod"], var.stage)
    error_message = "Stage must be 'dev' or 'prod'."
  }
}

variable "domain_name" {
  description = "Root domain name (e.g., vebgenix.com)"
  type        = string
}

variable "api_cloudfront_domain" {
  description = "CloudFront domain name for API distribution"
  type        = string
}

variable "api_cloudfront_zone_id" {
  description = "CloudFront hosted zone ID for API distribution"
  type        = string
}

variable "frontend_cloudfront_domain" {
  description = "CloudFront domain name for frontend distribution"
  type        = string
}

variable "frontend_cloudfront_zone_id" {
  description = "CloudFront hosted zone ID for frontend distribution"
  type        = string
}

variable "api_subdomain" {
  description = "Subdomain for the API (e.g., 'api' → api.vebgenix.com)"
  type        = string
  default     = "api"
}

variable "app_subdomain" {
  description = "Subdomain for the frontend app (e.g., 'app' → app.vebgenix.com)"
  type        = string
  default     = "app"
}

variable "create_root_redirect" {
  description = "Create an A record for the root domain pointing to the frontend"
  type        = bool
  default     = true
}
