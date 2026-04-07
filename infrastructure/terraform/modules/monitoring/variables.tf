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

variable "alert_email" {
  description = "Email address for CloudWatch alarm notifications"
  type        = string
  default     = ""
}

variable "lambda_function_names" {
  description = "List of Lambda function names to create log groups for"
  type        = list(string)
  default     = []
}

variable "log_retention_days" {
  description = "CloudWatch log group retention in days"
  type        = number
  default     = 7
}

variable "email_queue_arn" {
  description = "SQS email queue ARN for alarms"
  type        = string
  default     = ""
}

variable "email_queue_name" {
  description = "SQS email queue name for alarms"
  type        = string
  default     = ""
}

variable "jobs_queue_arn" {
  description = "SQS jobs queue ARN for alarms"
  type        = string
  default     = ""
}

variable "jobs_queue_name" {
  description = "SQS jobs queue name for alarms"
  type        = string
  default     = ""
}

variable "email_dlq_name" {
  description = "SQS email DLQ name for depth alarm"
  type        = string
  default     = ""
}

variable "jobs_dlq_name" {
  description = "SQS jobs DLQ name for depth alarm"
  type        = string
  default     = ""
}

variable "ec2_instance_id" {
  description = "EC2 instance ID for alarms (prod only)"
  type        = string
  default     = ""
}
