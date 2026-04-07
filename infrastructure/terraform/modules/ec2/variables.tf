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

variable "vpc_id" {
  description = "VPC ID to launch the EC2 instance in"
  type        = string
}

variable "subnet_id" {
  description = "Subnet ID for the EC2 instance (public subnet)"
  type        = string
}

variable "security_group_ids" {
  description = "Security group IDs for the EC2 instance"
  type        = list(string)
}

variable "instance_type" {
  description = "EC2 instance type (arm64)"
  type        = string
  default     = "t4g.small"
}

variable "ami_id" {
  description = "AMI ID for the EC2 instance. Leave empty to use the latest Amazon Linux 2023 arm64 AMI."
  type        = string
  default     = ""
}

variable "key_name" {
  description = "EC2 key pair name (optional — use SSM Session Manager instead)"
  type        = string
  default     = ""
}

variable "documents_bucket_name" {
  description = "S3 documents bucket name for EC2 IAM policy"
  type        = string
  default     = ""
}

variable "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  type        = string
  default     = ""
}

variable "node_version" {
  description = "Node.js major version to install via nvm"
  type        = string
  default     = "20"
}

variable "app_port" {
  description = "Port the Node.js REST API listens on"
  type        = number
  default     = 3000
}

variable "volume_size_gb" {
  description = "Root EBS volume size in GB"
  type        = number
  default     = 20
}

variable "enable_detailed_monitoring" {
  description = "Enable detailed CloudWatch monitoring for the EC2 instance"
  type        = bool
  default     = true
}
