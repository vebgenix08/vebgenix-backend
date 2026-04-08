locals {
  # prod keeps legacy name "vebgenix" (no stage suffix) for backward compat.
  # dev uses "vebgenix-dev" so functions are fully independent with own env vars.
  name_prefix = var.stage == "prod" ? "vebgenix" : "vebgenix-${var.stage}"
  stage       = var.stage
  tags = {
    Environment = var.stage
    Project     = "vebgenix"
    ManagedBy   = "terraform"
  }

  # Lambda function definitions: name -> { memory, timeout, description }
  appsync_resolvers = {
    "dashboard-resolver" = {
      memory      = 256
      timeout     = 30
      description = "AppSync resolver for dashboard queries"
    }
    "students-resolver" = {
      memory      = 512
      timeout     = 30
      description = "AppSync resolver for student management"
    }
    "finance-resolver" = {
      memory      = 512
      timeout     = 30
      description = "AppSync resolver for finance operations"
    }
    "admin-resolver" = {
      memory      = 256
      timeout     = 30
      description = "AppSync resolver for admin operations"
    }
    "users-resolver" = {
      memory      = 512
      timeout     = 30
      description = "AppSync resolver for user management"
    }
    "tenants-resolver" = {
      memory      = 256
      timeout     = 30
      description = "AppSync resolver for tenant management"
    }
    "admissions-resolver" = {
      memory      = 256
      timeout     = 30
      description = "AppSync resolver for admissions workflows"
    }
    "audit-logs-resolver" = {
      memory      = 256
      timeout     = 30
      description = "AppSync resolver for audit log queries"
    }
    "storage-resolver" = {
      memory      = 256
      timeout     = 30
      description = "AppSync resolver for storage operations"
    }
    "settings-resolver" = {
      memory      = 512
      timeout     = 30
      description = "AppSync resolver for settings management"
    }
  }

  async_workers = {
    "email-worker" = {
      memory      = 256
      timeout     = 60
      description = "Async worker for email sending via SQS"
    }
    "jobs-worker" = {
      memory      = 256
      timeout     = 300
      description = "Async worker for background jobs via SQS"
    }
    "cognito-provisioner" = {
      memory      = 256
      timeout     = 60
      description = "Async worker for Cognito user provisioning via SQS"
    }
  }

  all_functions = merge(local.appsync_resolvers, local.async_workers)

  base_env_vars = merge(
    {
      STAGE = var.stage
      # AWS_REGION is reserved by Lambda — injected automatically, cannot be set
      # DATABASE_URL is passed separately as sensitive
      COGNITO_USER_POOL_ID = var.cognito_user_pool_id
      COGNITO_CLIENT_ID    = var.cognito_client_id
      DOCUMENTS_BUCKET     = var.documents_bucket_name
    },
    var.additional_env_vars
  )
}

# ---------------------------------------------------------------------------
# IAM Role for Lambda execution
# ---------------------------------------------------------------------------
resource "aws_iam_role" "lambda_exec" {
  name = "${local.name_prefix}-lambda-exec-${var.stage}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "lambda_vpc" {
  count      = length(var.vpc_subnet_ids) > 0 ? 1 : 0
  role       = aws_iam_role.lambda_exec.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole"
}

resource "aws_iam_role_policy" "lambda_permissions" {
  name = "${local.name_prefix}-lambda-permissions-${var.stage}"
  role = aws_iam_role.lambda_exec.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # CloudWatch Logs
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      # SSM Parameter Store (for secrets)
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/vebgenix/${var.stage}/*"
      },
      # Secrets Manager
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:vebgenix/${var.stage}/*"
      },
      # S3 documents bucket
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:GetObjectAttributes",
          "s3:ListBucket",
        ]
        Resource = var.documents_bucket_name != "" ? [
          "arn:aws:s3:::${var.documents_bucket_name}",
          "arn:aws:s3:::${var.documents_bucket_name}/*",
        ] : ["arn:aws:s3:::vebgenix-documents-${var.stage}-*", "arn:aws:s3:::vebgenix-documents-${var.stage}-*/*"]
      },
      # Cognito
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:AdminRespondToAuthChallenge",
          "cognito-idp:ListUsers",
          "cognito-idp:ListUsersInGroup",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminResetUserPassword",
        ]
        Resource = "*"
      },
      # SQS
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:GetQueueUrl",
          "sqs:ChangeMessageVisibility",
        ]
        Resource = "arn:aws:sqs:${var.aws_region}:*:vebgenix-*"
      },
      # EventBridge
      {
        Effect = "Allow"
        Action = [
          "events:PutEvents",
          "events:DescribeEventBus",
        ]
        Resource = "arn:aws:events:${var.aws_region}:*:event-bus/vebgenix-${var.stage}"
      },
      # SES (for direct email if needed)
      {
        Effect = "Allow"
        Action = [
          "ses:SendEmail",
          "ses:SendRawEmail",
        ]
        Resource = "*"
      },
      # X-Ray tracing
      {
        Effect = "Allow"
        Action = [
          "xray:PutTraceSegments",
          "xray:PutTelemetryRecords",
        ]
        Resource = "*"
      },
    ]
  })
}

# ---------------------------------------------------------------------------
# Lambda Functions
# ---------------------------------------------------------------------------
resource "aws_lambda_function" "functions" {
  for_each = local.all_functions

  function_name = "${local.name_prefix}-${each.key}"
  description   = each.value.description
  role          = aws_iam_role.lambda_exec.arn

  # Placeholder code — real code is deployed by GitHub Actions
  filename         = "${path.module}/placeholder.zip"
  source_code_hash = filebase64sha256("${path.module}/placeholder.zip")

  runtime       = "nodejs20.x"
  # Handler matches directory layout: lambda/{fn-name}/index.js → exports.handler
  # e.g. admin-resolver/index.handler, email-worker/index.handler
  handler       = "${each.key}/index.handler"
  architectures = ["arm64"]
  publish       = true # Enable versioning

  timeout     = each.value.timeout
  memory_size = each.value.memory

  environment {
    variables = merge(local.base_env_vars, {
      DATABASE_URL          = var.neon_database_url
      COGNITO_CLIENT_SECRET = var.cognito_client_secret
    })
  }

  # VPC config (optional — only if VPC IDs provided)
  dynamic "vpc_config" {
    for_each = length(var.vpc_subnet_ids) > 0 ? [1] : []
    content {
      subnet_ids         = var.vpc_subnet_ids
      security_group_ids = var.vpc_security_group_ids
    }
  }

  # X-Ray tracing
  tracing_config {
    mode = "Active"
  }

  tags = local.tags

  lifecycle {
    # Ignore code/config changes — GitHub Actions manages deployments
    ignore_changes = [
      source_code_hash,
      filename,
      handler,      # deploy-lambdas.yml sets the real handler; placeholder is index.handler
      environment,  # Managed via CI/CD; prevent Terraform drift on secrets
    ]
  }
}

# ---------------------------------------------------------------------------
# Lambda Aliases
# ---------------------------------------------------------------------------

# "dev" alias always points to $LATEST
resource "aws_lambda_alias" "dev" {
  for_each = local.all_functions

  name             = "dev"
  description      = "Development alias pointing to $LATEST"
  function_name    = aws_lambda_function.functions[each.key].function_name
  function_version = "$LATEST"
}

# "prod" alias points to a specific published version
resource "aws_lambda_alias" "prod" {
  for_each = local.all_functions

  name             = "prod"
  description      = "Production alias pointing to a stable published version"
  function_name    = aws_lambda_function.functions[each.key].function_name
  function_version = var.prod_lambda_version

  depends_on = [aws_lambda_function.functions]
}

# ---------------------------------------------------------------------------
# CloudWatch Log Groups
# ---------------------------------------------------------------------------
# Each stage now has its own Lambda functions (dev: vebgenix-dev-*, prod: vebgenix-*).
# Log groups are created for all stages — no conflict since function names differ.
resource "aws_cloudwatch_log_group" "lambda_logs" {
  for_each = local.all_functions

  name              = "/aws/lambda/${local.name_prefix}-${each.key}"
  retention_in_days = var.log_retention_days

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Lambda permissions for AppSync to invoke resolvers
# ---------------------------------------------------------------------------
resource "aws_lambda_permission" "appsync_dev" {
  for_each = var.appsync_api_id != "" ? local.appsync_resolvers : {}

  statement_id  = "AllowAppSyncInvokeDev"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions[each.key].function_name
  principal     = "appsync.amazonaws.com"
  source_arn    = "arn:aws:appsync:${var.aws_region}:*:apis/${var.appsync_api_id}"
  qualifier     = aws_lambda_alias.dev[each.key].name
}

resource "aws_lambda_permission" "appsync_prod" {
  for_each = var.appsync_api_id != "" ? local.appsync_resolvers : {}

  statement_id  = "AllowAppSyncInvokeProd"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.functions[each.key].function_name
  principal     = "appsync.amazonaws.com"
  source_arn    = "arn:aws:appsync:${var.aws_region}:*:apis/${var.appsync_api_id}"
  qualifier     = aws_lambda_alias.prod[each.key].name
}
