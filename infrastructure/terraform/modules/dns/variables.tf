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

# NOTE: cloudfront domain/zone_id variables removed from this module.
# Route53 A records are created in prod/main.tf after cloudfront runs.
# This prevents the cloudfront ↔ dns circular dependency.
