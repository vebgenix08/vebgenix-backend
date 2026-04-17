locals {
  name_prefix = "vebgenix-${var.stage}"
  tags = {
    Environment = var.stage
    Project     = "vebgenix"
    ManagedBy   = "terraform"
  }

  # Resolver functions — each maps to a Lambda function alias
  resolver_functions = {
    "dashboard-resolver"   = "dashboard-resolver"
    "students-resolver"    = "students-resolver"
    "finance-resolver"     = "finance-resolver"
    "admin-resolver"       = "admin-resolver"
    "users-resolver"       = "users-resolver"
    "tenants-resolver"     = "tenants-resolver"
    "admissions-resolver"  = "admissions-resolver"
    "attendance-resolver"  = "attendance-resolver"
    "audit-logs-resolver"  = "audit-logs-resolver"
    "storage-resolver"     = "storage-resolver"
    "settings-resolver"    = "settings-resolver"
    "academics-resolver"   = "academics-resolver"
  }
}

# ---------------------------------------------------------------------------
# IAM Role for AppSync to invoke Lambda
# ---------------------------------------------------------------------------
resource "aws_iam_role" "appsync_lambda_invoke" {
  name = "${local.name_prefix}-appsync-lambda-invoke"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "appsync.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy" "appsync_lambda_invoke" {
  name = "${local.name_prefix}-appsync-lambda-invoke"
  role = aws_iam_role.appsync_lambda_invoke.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:InvokeFunction",
        ]
        Resource = [
          for k, arn in var.lambda_alias_arns : arn
        ]
      }
    ]
  })
}

# IAM Role for AppSync CloudWatch logging
resource "aws_iam_role" "appsync_cloudwatch" {
  name = "${local.name_prefix}-appsync-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "appsync.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

resource "aws_iam_role_policy_attachment" "appsync_cloudwatch" {
  role       = aws_iam_role.appsync_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppSyncPushToCloudWatchLogs"
}

# ---------------------------------------------------------------------------
# AppSync GraphQL API
# ---------------------------------------------------------------------------
resource "aws_appsync_graphql_api" "main" {
  name                = local.name_prefix
  authentication_type = "AMAZON_COGNITO_USER_POOLS"

  user_pool_config {
    user_pool_id   = var.cognito_user_pool_id
    aws_region     = var.aws_region
    default_action = "ALLOW"
  }

  # Allow API key for health checks and unauthenticated operations
  additional_authentication_provider {
    authentication_type = "API_KEY"
  }

  # IAM auth for service-to-service calls
  additional_authentication_provider {
    authentication_type = "AWS_IAM"
  }

  log_config {
    cloudwatch_logs_role_arn = aws_iam_role.appsync_cloudwatch.arn
    field_log_level          = var.log_field_level
    exclude_verbose_content  = true
  }

  xray_enabled = var.xray_enabled

  # Schema definition — inline minimal schema; real schema managed by app code
  schema = var.schema_path != "" ? file(var.schema_path) : local.default_schema

  tags = local.tags
}

# API Key for health checks (expires after 1 year; rotate via CI/CD)
resource "aws_appsync_api_key" "main" {
  api_id      = aws_appsync_graphql_api.main.id
  description = "Default API key for ${local.name_prefix}"
  # expires must be between 1 day and 365 days from now
  # Set to 365 days; rotate via automation
  expires = timeadd(timestamp(), "8760h")

  lifecycle {
    ignore_changes = [expires]
  }
}

locals {
  default_schema = <<-GRAPHQL
    type Query {
      health: String
    }

    type Mutation {
      _placeholder: String
    }

    schema {
      query: Query
      mutation: Mutation
    }
  GRAPHQL
}

# ---------------------------------------------------------------------------
# AppSync DataSources (one per Lambda resolver)
# ---------------------------------------------------------------------------
resource "aws_appsync_datasource" "lambda_resolvers" {
  for_each = local.resolver_functions

  api_id           = aws_appsync_graphql_api.main.id
  name             = replace(each.key, "-", "_")
  type             = "AWS_LAMBDA"
  service_role_arn = aws_iam_role.appsync_lambda_invoke.arn

  lambda_config {
    function_arn = lookup(var.lambda_alias_arns, each.value, "")
  }

  depends_on = [aws_appsync_graphql_api.main]
}

# ---------------------------------------------------------------------------
# AppSync Functions (APPSYNC_JS runtime — pipeline resolvers)
# ---------------------------------------------------------------------------
resource "aws_appsync_function" "resolver_functions" {
  for_each = local.resolver_functions

  api_id      = aws_appsync_graphql_api.main.id
  data_source = aws_appsync_datasource.lambda_resolvers[each.key].name
  name        = replace(each.key, "-", "_")
  description = "Pipeline function for ${each.key}"

  runtime {
    name            = "APPSYNC_JS"
    runtime_version = "1.0.0"
  }

  # APPSYNC_JS code that forwards request to Lambda and passes result through
  code = <<-JS
    import { util } from '@aws-appsync/utils';

    export function request(ctx) {
      return {
        operation: 'Invoke',
        payload: {
          field: ctx.info.fieldName,
          arguments: ctx.args,
          identity: ctx.identity,
          source: ctx.source,
          request: ctx.request,
          info: {
            fieldName: ctx.info.fieldName,
            parentTypeName: ctx.info.parentTypeName,
            variables: ctx.info.variables,
          },
        },
      };
    }

    export function response(ctx) {
      if (ctx.error) {
        util.error(ctx.error.message, ctx.error.type, ctx.result);
      }
      return ctx.result;
    }
  JS

  depends_on = [aws_appsync_datasource.lambda_resolvers]
}

# ---------------------------------------------------------------------------
# NONE datasource — for local resolvers that don't call a backend
# ---------------------------------------------------------------------------
resource "aws_appsync_datasource" "none" {
  api_id = aws_appsync_graphql_api.main.id
  name   = "NONE"
  type   = "NONE"

  depends_on = [aws_appsync_graphql_api.main]
}

# ---------------------------------------------------------------------------
# AppSync Resolvers — health query (simple passthrough)
# ---------------------------------------------------------------------------
resource "aws_appsync_resolver" "health" {
  api_id      = aws_appsync_graphql_api.main.id
  type        = "Query"
  field       = "health"
  kind        = "UNIT"
  data_source = aws_appsync_datasource.none.name

  runtime {
    name            = "APPSYNC_JS"
    runtime_version = "1.0.0"
  }

  code = <<-JS
    export function request(ctx) {
      return {};
    }
    export function response(ctx) {
      return 'ok';
    }
  JS

  depends_on = [aws_appsync_graphql_api.main]
}

# Note: Additional Query/Mutation resolvers should be defined in the application's
# IaC or AppSync schema deployment pipeline (GitHub Actions). The resolvers above
# provide the foundation. Each AppSync function above is ready to be attached
# to pipeline resolvers as the GraphQL schema grows.
