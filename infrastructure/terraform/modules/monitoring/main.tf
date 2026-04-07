locals {
  name_prefix = "vebgenix-${var.stage}"
  tags = {
    Environment = var.stage
    Project     = "vebgenix"
    ManagedBy   = "terraform"
  }
}

# ---------------------------------------------------------------------------
# SNS Topic for Alerts
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name         = "${local.name_prefix}-alerts"
  display_name = "Vebgenix ${upper(var.stage)} Alerts"

  # Encryption at rest
  kms_master_key_id = "alias/aws/sns"

  tags = local.tags
}

resource "aws_sns_topic_subscription" "email_alerts" {
  count = var.alert_email != "" ? 1 : 0

  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# Note: Lambda log groups (/aws/lambda/*) are managed by the lambda module.
# We reference Lambda function names only for alarms — no separate log group here.

# Log groups for EC2 nginx (prod only)
resource "aws_cloudwatch_log_group" "nginx_access" {
  count = var.ec2_instance_id != "" ? 1 : 0

  name              = "/aws/ec2/${local.name_prefix}/nginx-access"
  retention_in_days = var.log_retention_days

  tags = local.tags
}

resource "aws_cloudwatch_log_group" "nginx_error" {
  count = var.ec2_instance_id != "" ? 1 : 0

  name              = "/aws/ec2/${local.name_prefix}/nginx-error"
  retention_in_days = var.log_retention_days

  tags = local.tags
}

# ---------------------------------------------------------------------------
# CloudWatch Alarms — SQS Email Queue
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "email_queue_age" {
  count = var.email_queue_name != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-email-queue-age-high"
  alarm_description   = "Email queue message age exceeds 300 seconds — email delivery may be delayed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 300
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.email_queue_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "email_dlq_depth" {
  count = var.email_dlq_name != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-email-dlq-not-empty"
  alarm_description   = "Email DLQ has messages — investigate failed email deliveries"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.email_dlq_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = local.tags
}

# ---------------------------------------------------------------------------
# CloudWatch Alarms — SQS Jobs Queue
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "jobs_queue_age" {
  count = var.jobs_queue_name != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-jobs-queue-age-high"
  alarm_description   = "Jobs queue message age exceeds 300 seconds — background job processing may be delayed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 300
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.jobs_queue_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "jobs_dlq_depth" {
  count = var.jobs_dlq_name != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-jobs-dlq-not-empty"
  alarm_description   = "Jobs DLQ has messages — investigate failed background jobs"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Sum"
  threshold           = 0
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = var.jobs_dlq_name
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = local.tags
}

# ---------------------------------------------------------------------------
# CloudWatch Alarms — Lambda Error Rates
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = toset(var.lambda_function_names)

  alarm_name          = "${local.name_prefix}-lambda-${each.value}-errors"
  alarm_description   = "Lambda function ${each.value} error rate is elevated"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 60
  statistic           = "Sum"
  threshold           = 5
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = each.value
  }

  alarm_actions = [aws_sns_topic.alerts.arn]

  tags = local.tags
}

# ---------------------------------------------------------------------------
# CloudWatch Alarms — EC2 (prod only)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "ec2_cpu_high" {
  count = var.ec2_instance_id != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-ec2-cpu-high"
  alarm_description   = "EC2 REST API CPU utilization is above 80%"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "CPUUtilization"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Average"
  threshold           = 80
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = var.ec2_instance_id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.tags
}

resource "aws_cloudwatch_metric_alarm" "ec2_status_check" {
  count = var.ec2_instance_id != "" ? 1 : 0

  alarm_name          = "${local.name_prefix}-ec2-status-check-failed"
  alarm_description   = "EC2 REST API instance status check failed"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "StatusCheckFailed"
  namespace           = "AWS/EC2"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  treat_missing_data  = "breaching"

  dimensions = {
    InstanceId = var.ec2_instance_id
  }

  alarm_actions = [aws_sns_topic.alerts.arn]
  ok_actions    = [aws_sns_topic.alerts.arn]

  tags = local.tags
}

# ---------------------------------------------------------------------------
# CloudWatch Dashboard
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = local.name_prefix

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "text"
        x      = 0
        y      = 0
        width  = 24
        height = 1
        properties = {
          markdown = "## Vebgenix ${upper(var.stage)} — Operations Dashboard"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 1
        width  = 12
        height = 6
        properties = {
          title  = "SQS Queue Depths"
          region = var.aws_region
          period = 60
          stat   = "Sum"
          metrics = var.email_queue_name != "" && var.jobs_queue_name != "" ? [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.email_queue_name],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", var.jobs_queue_name],
          ] : [["AWS/SQS", "ApproximateNumberOfMessagesVisible"]]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 1
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Errors"
          region = var.aws_region
          period = 60
          stat   = "Sum"
          metrics = [
            for fn in var.lambda_function_names :
            ["AWS/Lambda", "Errors", "FunctionName", fn]
          ]
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 7
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Duration (p99)"
          region = var.aws_region
          period = 60
          stat   = "p99"
          metrics = [
            for fn in var.lambda_function_names :
            ["AWS/Lambda", "Duration", "FunctionName", fn]
          ]
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 7
        width  = 12
        height = 6
        properties = {
          title  = "Lambda Invocations"
          region = var.aws_region
          period = 60
          stat   = "Sum"
          metrics = [
            for fn in var.lambda_function_names :
            ["AWS/Lambda", "Invocations", "FunctionName", fn]
          ]
        }
      },
    ]
  })
}
