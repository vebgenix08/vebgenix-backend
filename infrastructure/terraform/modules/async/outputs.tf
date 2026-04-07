output "email_queue_url" {
  description = "SQS email queue URL"
  value       = aws_sqs_queue.email.id
}

output "email_queue_arn" {
  description = "SQS email queue ARN"
  value       = aws_sqs_queue.email.arn
}

output "email_dlq_url" {
  description = "SQS email dead-letter queue URL"
  value       = aws_sqs_queue.email_dlq.id
}

output "email_dlq_arn" {
  description = "SQS email dead-letter queue ARN"
  value       = aws_sqs_queue.email_dlq.arn
}

output "jobs_queue_url" {
  description = "SQS jobs queue URL"
  value       = aws_sqs_queue.jobs.id
}

output "jobs_queue_arn" {
  description = "SQS jobs queue ARN"
  value       = aws_sqs_queue.jobs.arn
}

output "jobs_dlq_url" {
  description = "SQS jobs dead-letter queue URL"
  value       = aws_sqs_queue.jobs_dlq.id
}

output "jobs_dlq_arn" {
  description = "SQS jobs dead-letter queue ARN"
  value       = aws_sqs_queue.jobs_dlq.arn
}

output "cognito_provision_queue_url" {
  description = "SQS cognito-provision queue URL"
  value       = aws_sqs_queue.cognito_provision.id
}

output "cognito_provision_queue_arn" {
  description = "SQS cognito-provision queue ARN"
  value       = aws_sqs_queue.cognito_provision.arn
}

output "cognito_provision_dlq_url" {
  description = "SQS cognito-provision dead-letter queue URL"
  value       = aws_sqs_queue.cognito_provision_dlq.id
}

output "event_bus_name" {
  description = "EventBridge custom event bus name"
  value       = aws_cloudwatch_event_bus.main.name
}

output "event_bus_arn" {
  description = "EventBridge custom event bus ARN"
  value       = aws_cloudwatch_event_bus.main.arn
}

output "email_queue_name" {
  description = "SQS email queue name (for CloudWatch alarms)"
  value       = aws_sqs_queue.email.name
}

output "email_dlq_name" {
  description = "SQS email DLQ name (for CloudWatch alarms)"
  value       = aws_sqs_queue.email_dlq.name
}

output "jobs_queue_name" {
  description = "SQS jobs queue name (for CloudWatch alarms)"
  value       = aws_sqs_queue.jobs.name
}

output "jobs_dlq_name" {
  description = "SQS jobs DLQ name (for CloudWatch alarms)"
  value       = aws_sqs_queue.jobs_dlq.name
}
