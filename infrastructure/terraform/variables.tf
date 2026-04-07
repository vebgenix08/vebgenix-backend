# Root-level variables shared across environments.
# Environment-specific variables live in dev/variables.tf and prod/variables.tf.

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "ap-south-1"
}

variable "neon_api_key" {
  description = "Neon serverless PostgreSQL API key"
  type        = string
  sensitive   = true
}
