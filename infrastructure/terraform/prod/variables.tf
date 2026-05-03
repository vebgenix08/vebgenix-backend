variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "ap-south-1"
}

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
}

variable "mongodb_atlas_org_id" {
  description = "MongoDB Atlas Organization ID"
  type        = string
  sensitive   = true
}

variable "mongodb_atlas_public_key" {
  description = "MongoDB Atlas API public key"
  type        = string
  sensitive   = true
}

variable "mongodb_atlas_private_key" {
  description = "MongoDB Atlas API private key"
  type        = string
  sensitive   = true
}

variable "mongodb_app_password" {
  description = "Password for the MongoDB Atlas app user (vebgenix_app)"
  type        = string
  sensitive   = true
}

variable "mongodb_db_name" {
  description = "MongoDB database name"
  type        = string
  default     = "vebgenix_prod"
}

variable "lambda_egress_cidrs" {
  description = "List of NAT Gateway EIP CIDRs that Lambdas use for outbound traffic. Add /32 per EIP. Get these from the CDK VPC stack outputs."
  type        = list(string)
  # Example: ["13.235.10.100/32", "52.66.200.50/32"]
  # Leave empty to skip IP access list entries (open to all — NOT recommended for prod)
  default     = []
}
