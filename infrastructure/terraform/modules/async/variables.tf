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

variable "aws_account_id" {
  description = "AWS account ID"
  type        = string
}

variable "email_worker_alias_arn" {
  description = "ARN of the email-worker Lambda alias"
  type        = string
}

variable "jobs_worker_alias_arn" {
  description = "ARN of the jobs-worker Lambda alias"
  type        = string
}

variable "cognito_provisioner_alias_arn" {
  description = "ARN of the cognito-provisioner Lambda alias"
  type        = string
}

variable "email_queue_visibility_timeout" {
  description = "SQS visibility timeout for email queue in seconds"
  type        = number
  default     = 30
}

variable "jobs_queue_visibility_timeout" {
  description = "SQS visibility timeout for jobs queue in seconds"
  type        = number
  default     = 300
}

variable "cognito_queue_visibility_timeout" {
  description = "SQS visibility timeout for cognito-provision queue in seconds"
  type        = number
  default     = 60
}

variable "email_batch_size" {
  description = "Lambda event source batch size for email queue"
  type        = number
  default     = 10
}

variable "jobs_batch_size" {
  description = "Lambda event source batch size for jobs queue"
  type        = number
  default     = 5
}

variable "cognito_batch_size" {
  description = "Lambda event source batch size for cognito-provision queue"
  type        = number
  default     = 10
}
