terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    neon = {
      source  = "kislerdm/neon"
      version = "~> 0.6"
    }
  }

  backend "s3" {
    bucket         = "vebgenix-terraform-state-278035644568"
    key            = "dev/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "vebgenix-terraform-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "vebgenix"
      ManagedBy   = "terraform"
      Environment = "dev"
    }
  }
}

# us-east-1 provider — required for ACM certificates used by CloudFront
# (Not used in dev since CloudFront/DNS are skipped, but declared for completeness)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "vebgenix"
      ManagedBy   = "terraform"
      Environment = "dev"
    }
  }
}

provider "neon" {
  api_key = var.neon_api_key
}

# ---------------------------------------------------------------------------
# Locals
# ---------------------------------------------------------------------------
locals {
  stage = "dev"

  all_lambda_function_names = [
    "vebgenix-dashboard-resolver",
    "vebgenix-students-resolver",
    "vebgenix-finance-resolver",
    "vebgenix-admin-resolver",
    "vebgenix-users-resolver",
    "vebgenix-tenants-resolver",
    "vebgenix-admissions-resolver",
    "vebgenix-audit-logs-resolver",
    "vebgenix-storage-resolver",
    "vebgenix-settings-resolver",
    "vebgenix-email-worker",
    "vebgenix-jobs-worker",
    "vebgenix-cognito-provisioner",
  ]
}

# ---------------------------------------------------------------------------
# Cognito
# ---------------------------------------------------------------------------
module "cognito" {
  source = "../modules/cognito"

  stage        = local.stage
  aws_region   = var.aws_region
  frontend_url = var.frontend_url

  additional_callback_urls = [
    "http://localhost:3000/auth/callback",
    "http://localhost:5173/auth/callback",
  ]
  additional_logout_urls = [
    "http://localhost:3000/auth/logout",
    "http://localhost:5173/auth/logout",
  ]
}

# ---------------------------------------------------------------------------
# Storage (no frontend bucket in dev)
# ---------------------------------------------------------------------------
module "storage" {
  source = "../modules/storage"

  stage                  = local.stage
  aws_account_id         = var.aws_account_id
  aws_region             = var.aws_region
  frontend_url           = var.frontend_url
  create_frontend_bucket = false
  force_destroy          = true # Allow cleanup in dev
}

# ---------------------------------------------------------------------------
# Lambda (13 functions, dev + prod aliases)
# ---------------------------------------------------------------------------
module "lambda" {
  source = "../modules/lambda"

  stage                 = local.stage
  aws_region            = var.aws_region
  neon_database_url     = var.neon_database_url
  cognito_user_pool_id  = module.cognito.user_pool_id
  cognito_client_id     = module.cognito.backend_client_id
  cognito_client_secret = module.cognito.backend_client_secret
  documents_bucket_name = module.storage.documents_bucket_name
  prod_lambda_version   = var.prod_lambda_version
  log_retention_days    = 7 # Short retention for dev

  depends_on = [
    module.cognito,
    module.storage,
  ]
}

# ---------------------------------------------------------------------------
# AppSync
# ---------------------------------------------------------------------------
module "appsync" {
  source = "../modules/appsync"

  stage                     = local.stage
  aws_region                = var.aws_region
  cognito_user_pool_id      = module.cognito.user_pool_id
  cognito_user_pool_arn     = module.cognito.user_pool_arn
  lambda_execution_role_arn = module.lambda.execution_role_arn

  # Use dev aliases for dev environment
  lambda_alias_arns = module.lambda.appsync_resolver_dev_arns

  log_field_level = "ALL" # Verbose logging in dev
  xray_enabled    = true

  depends_on = [
    module.cognito,
    module.lambda,
  ]
}

# ---------------------------------------------------------------------------
# Dev-only: Update AppSync permission to reference correct API ID
# ---------------------------------------------------------------------------
# Note: Lambda permissions for AppSync are managed in the lambda module.
# After appsync is created, re-run apply to propagate the api_id.

# ---------------------------------------------------------------------------
# Monitoring (minimal for dev)
# ---------------------------------------------------------------------------
module "monitoring" {
  source = "../modules/monitoring"

  stage                 = local.stage
  aws_region            = var.aws_region
  alert_email           = var.alert_email
  lambda_function_names = local.all_lambda_function_names
  log_retention_days    = 7

  depends_on = [module.lambda]
}
