locals {
  name_prefix = "vebgenix-${var.stage}"
  tags = {
    Environment = var.stage
    Project     = "vebgenix"
    ManagedBy   = "terraform"
  }
}

# ---------------------------------------------------------------------------
# SQS Dead Letter Queues
# ---------------------------------------------------------------------------

resource "aws_sqs_queue" "email_dlq" {
  name                       = "${local.name_prefix}-email-dlq"
  message_retention_seconds  = 1209600 # 14 days
  visibility_timeout_seconds = 30

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = local.tags
}

resource "aws_sqs_queue" "jobs_dlq" {
  name                       = "${local.name_prefix}-jobs-dlq"
  message_retention_seconds  = 1209600 # 14 days
  visibility_timeout_seconds = 30

  sqs_managed_sse_enabled = true

  tags = local.tags
}

resource "aws_sqs_queue" "cognito_provision_dlq" {
  name                       = "${local.name_prefix}-cognito-provision-dlq"
  message_retention_seconds  = 1209600 # 14 days
  visibility_timeout_seconds = 30

  sqs_managed_sse_enabled = true

  tags = local.tags
}

# ---------------------------------------------------------------------------
# SQS Main Queues
# ---------------------------------------------------------------------------

resource "aws_sqs_queue" "email" {
  name                       = "${local.name_prefix}-email"
  message_retention_seconds  = 345600 # 4 days
  visibility_timeout_seconds = var.email_queue_visibility_timeout

  sqs_managed_sse_enabled = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.email_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.tags
}

resource "aws_sqs_queue" "jobs" {
  name                       = "${local.name_prefix}-jobs"
  message_retention_seconds  = 345600 # 4 days
  visibility_timeout_seconds = var.jobs_queue_visibility_timeout

  sqs_managed_sse_enabled = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.jobs_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.tags
}

resource "aws_sqs_queue" "cognito_provision" {
  name                       = "${local.name_prefix}-cognito-provision"
  message_retention_seconds  = 345600 # 4 days
  visibility_timeout_seconds = var.cognito_queue_visibility_timeout

  sqs_managed_sse_enabled = true

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.cognito_provision_dlq.arn
    maxReceiveCount     = 3
  })

  tags = local.tags
}

# ---------------------------------------------------------------------------
# SQS Queue Policies (allow Lambda and application roles to send messages)
# ---------------------------------------------------------------------------

resource "aws_sqs_queue_policy" "email" {
  queue_url = aws_sqs_queue.email.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaAndEC2Send"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.aws_account_id}:root"
        }
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ]
        Resource = aws_sqs_queue.email.arn
      },
      {
        Sid    = "AllowEventBridgeSend"
        Effect = "Allow"
        Principal = {
          Service = "events.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.email.arn
        Condition = {
          ArnLike = {
            "aws:SourceArn" = "arn:aws:events:${var.aws_region}:${var.aws_account_id}:rule/*"
          }
        }
      }
    ]
  })
}

resource "aws_sqs_queue_policy" "jobs" {
  queue_url = aws_sqs_queue.jobs.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaAndEC2Send"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.aws_account_id}:root"
        }
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ]
        Resource = aws_sqs_queue.jobs.arn
      }
    ]
  })
}

resource "aws_sqs_queue_policy" "cognito_provision" {
  queue_url = aws_sqs_queue.cognito_provision.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaAndEC2Send"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${var.aws_account_id}:root"
        }
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
        ]
        Resource = aws_sqs_queue.cognito_provision.arn
      }
    ]
  })
}

# ---------------------------------------------------------------------------
# EventBridge Custom Event Bus
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_event_bus" "main" {
  name = local.name_prefix

  tags = local.tags
}

# EventBridge rule: route failed job events to jobs DLQ for inspection
resource "aws_cloudwatch_event_rule" "job_failed" {
  name           = "${local.name_prefix}-job-failed"
  description    = "Capture failed job events from the custom bus"
  event_bus_name = aws_cloudwatch_event_bus.main.name

  event_pattern = jsonencode({
    source      = ["vebgenix.jobs"]
    detail-type = ["JobFailed"]
  })

  tags = local.tags
}

resource "aws_cloudwatch_event_target" "job_failed_to_jobs_queue" {
  rule           = aws_cloudwatch_event_rule.job_failed.name
  event_bus_name = aws_cloudwatch_event_bus.main.name
  target_id      = "SendToJobsQueue"
  arn            = aws_sqs_queue.jobs.arn
}

# ---------------------------------------------------------------------------
# Lambda Event Source Mappings
# ---------------------------------------------------------------------------

# email-worker ← email queue
resource "aws_lambda_event_source_mapping" "email_worker" {
  event_source_arn                   = aws_sqs_queue.email.arn
  function_name                      = var.email_worker_alias_arn
  batch_size                         = var.email_batch_size
  maximum_batching_window_in_seconds = 5
  enabled                            = true

  function_response_types = ["ReportBatchItemFailures"]

  depends_on = [
    aws_sqs_queue.email,
  ]
}

# jobs-worker ← jobs queue
resource "aws_lambda_event_source_mapping" "jobs_worker" {
  event_source_arn                   = aws_sqs_queue.jobs.arn
  function_name                      = var.jobs_worker_alias_arn
  batch_size                         = var.jobs_batch_size
  maximum_batching_window_in_seconds = 10
  enabled                            = true

  function_response_types = ["ReportBatchItemFailures"]

  depends_on = [
    aws_sqs_queue.jobs,
  ]
}

# cognito-provisioner ← cognito-provision queue
resource "aws_lambda_event_source_mapping" "cognito_provisioner" {
  event_source_arn                   = aws_sqs_queue.cognito_provision.arn
  function_name                      = var.cognito_provisioner_alias_arn
  batch_size                         = var.cognito_batch_size
  maximum_batching_window_in_seconds = 5
  enabled                            = true

  function_response_types = ["ReportBatchItemFailures"]

  depends_on = [
    aws_sqs_queue.cognito_provision,
  ]
}
