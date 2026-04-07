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
    key            = "prod/terraform.tfstate"
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
      Environment = "prod"
    }
  }
}

# us-east-1 provider — required for ACM certificates used by CloudFront
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "vebgenix"
      ManagedBy   = "terraform"
      Environment = "prod"
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
  stage = "prod"

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

  frontend_url_resolved = var.frontend_url != "" ? var.frontend_url : (
    var.domain_name != "" ? "https://${var.app_subdomain}.${var.domain_name}" : ""
  )
}

# ---------------------------------------------------------------------------
# Cognito
# ---------------------------------------------------------------------------
module "cognito" {
  source = "../modules/cognito"

  stage        = local.stage
  aws_region   = var.aws_region
  frontend_url = local.frontend_url_resolved
}

# ---------------------------------------------------------------------------
# Network (VPC, subnets, security groups)
# ---------------------------------------------------------------------------
module "network" {
  source = "../modules/network"

  stage              = local.stage
  aws_region         = var.aws_region
  vpc_cidr           = "10.0.0.0/16"
  public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
  availability_zones = var.availability_zones
  enable_flow_logs   = true
}

# ---------------------------------------------------------------------------
# Storage
# ---------------------------------------------------------------------------
module "storage" {
  source = "../modules/storage"

  stage                  = local.stage
  aws_account_id         = var.aws_account_id
  aws_region             = var.aws_region
  frontend_url           = local.frontend_url_resolved
  create_frontend_bucket = true
  force_destroy          = false

  # CloudFront OAC and distribution ARN are set after cloudfront module runs.
  # Use targeted apply order: storage → cloudfront → storage (for policy).
  cloudfront_distribution_arn = try(module.cloudfront[0].frontend_distribution_arn, "")

  depends_on = [module.network]
}

# ---------------------------------------------------------------------------
# Lambda (13 functions)
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
  log_retention_days    = 90 # 90-day retention for prod

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

  # Use prod aliases in prod environment
  lambda_alias_arns = module.lambda.appsync_resolver_prod_arns

  log_field_level = "ERROR"
  xray_enabled    = true

  depends_on = [
    module.cognito,
    module.lambda,
  ]
}

# ---------------------------------------------------------------------------
# EC2 REST API
# ---------------------------------------------------------------------------
module "ec2" {
  source = "../modules/ec2"

  stage                      = local.stage
  aws_region                 = var.aws_region
  vpc_id                     = module.network.vpc_id
  subnet_id                  = module.network.public_subnet_ids[0]
  security_group_ids         = [module.network.rest_api_security_group_id]
  instance_type              = var.ec2_instance_type
  documents_bucket_name      = module.storage.documents_bucket_name
  cognito_user_pool_id       = module.cognito.user_pool_id
  volume_size_gb             = var.ec2_volume_size_gb
  enable_detailed_monitoring = true

  depends_on = [
    module.network,
    module.storage,
    module.cognito,
  ]
}

# ---------------------------------------------------------------------------
# CloudFront (requires EC2 EIP and frontend S3 bucket)
# ---------------------------------------------------------------------------
module "cloudfront" {
  count = 1 # Always create in prod

  source = "../modules/cloudfront"

  stage                           = local.stage
  api_origin_ip                   = module.ec2.public_ip
  frontend_bucket_regional_domain = module.storage.frontend_bucket_regional_domain
  frontend_bucket_arn             = module.storage.frontend_bucket_arn
  domain_name                     = var.domain_name
  api_subdomain                   = var.api_subdomain
  app_subdomain                   = var.app_subdomain
  acm_certificate_arn             = var.domain_name != "" ? try(module.dns[0].certificate_arn, "") : ""
  price_class                     = "PriceClass_200"

  depends_on = [
    module.ec2,
    module.storage,
    module.dns,
  ]
}

# ---------------------------------------------------------------------------
# DNS + ACM (only if domain_name is provided)
# ---------------------------------------------------------------------------
module "dns" {
  count = var.domain_name != "" ? 1 : 0

  source = "../modules/dns"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  stage                       = local.stage
  domain_name                 = var.domain_name
  api_cloudfront_domain       = try(module.cloudfront[0].api_domain_name, "")
  api_cloudfront_zone_id      = try(module.cloudfront[0].api_hosted_zone_id, "")
  frontend_cloudfront_domain  = try(module.cloudfront[0].frontend_domain_name, "")
  frontend_cloudfront_zone_id = try(module.cloudfront[0].frontend_hosted_zone_id, "")
  api_subdomain               = var.api_subdomain
  app_subdomain               = var.app_subdomain
  create_root_redirect        = true

  depends_on = [module.cloudfront]
}

# ---------------------------------------------------------------------------
# Async (SQS queues, EventBridge, Lambda event source mappings)
# ---------------------------------------------------------------------------
module "async" {
  source = "../modules/async"

  stage                         = local.stage
  aws_region                    = var.aws_region
  aws_account_id                = var.aws_account_id
  email_worker_alias_arn        = module.lambda.async_worker_prod_arns["email-worker"]
  jobs_worker_alias_arn         = module.lambda.async_worker_prod_arns["jobs-worker"]
  cognito_provisioner_alias_arn = module.lambda.async_worker_prod_arns["cognito-provisioner"]

  depends_on = [module.lambda]
}

# ---------------------------------------------------------------------------
# Monitoring
# ---------------------------------------------------------------------------
module "monitoring" {
  source = "../modules/monitoring"

  stage                 = local.stage
  aws_region            = var.aws_region
  alert_email           = var.alert_email
  lambda_function_names = local.all_lambda_function_names
  log_retention_days    = 90

  email_queue_name = module.async.email_queue_name
  email_dlq_name   = module.async.email_dlq_name
  jobs_queue_name  = module.async.jobs_queue_name
  jobs_dlq_name    = module.async.jobs_dlq_name
  ec2_instance_id  = module.ec2.instance_id

  depends_on = [
    module.lambda,
    module.async,
    module.ec2,
  ]
}

# =============================================================================
# Import blocks (Terraform 1.5+ syntax) for existing resources
# Run: terraform plan -generate-config-out=generated.tf  (first time)
# Then: terraform import  or  terraform apply (with import blocks)
# =============================================================================

# ---------------------------------------------------------------------------
# Import: Existing Cognito User Pool (prod)
# ---------------------------------------------------------------------------
import {
  id = "ap-south-1_waAjEC9Nj"
  to = module.cognito.aws_cognito_user_pool.main
}

# ---------------------------------------------------------------------------
# Import: Existing AppSync API (prod)
# ---------------------------------------------------------------------------
import {
  id = "o6cgickkk5dpxej6lirgo7bpna"
  to = module.appsync.aws_appsync_graphql_api.main
}

# ---------------------------------------------------------------------------
# Import: Existing S3 Documents Bucket (prod)
# ---------------------------------------------------------------------------
import {
  id = "vebgenix-documents-prod-278035644568"
  to = module.storage.aws_s3_bucket.documents
}

# ---------------------------------------------------------------------------
# Import: Existing EC2 Instance (prod REST API)
# ---------------------------------------------------------------------------
import {
  id = "i-0b1260d7d90d8f7b3"
  to = module.ec2.aws_instance.rest_api
}

# ---------------------------------------------------------------------------
# Import: Existing EC2 Elastic IP (prod)
# ---------------------------------------------------------------------------
import {
  id = "eipalloc-0d28ee2f60ceecf10"
  to = module.ec2.aws_eip.rest_api
}

# ---------------------------------------------------------------------------
# Import: Existing CloudFront API Distribution (prod)
# ---------------------------------------------------------------------------
import {
  id = "E11WI5ENBRMIYD"
  to = module.cloudfront[0].aws_cloudfront_distribution.api
}

# ---------------------------------------------------------------------------
# Import: Existing CloudFront Frontend Distribution (prod)
# ---------------------------------------------------------------------------
import {
  id = "E1BFBMTG1KVMMD"
  to = module.cloudfront[0].aws_cloudfront_distribution.frontend
}
