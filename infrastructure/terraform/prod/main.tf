terraform {
  required_version = ">= 1.6"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    neon = {
      source  = "kislerdim/neon"
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

# Required for ACM certificates used by CloudFront (must be in us-east-1)
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

  domain_enabled   = var.domain_name != ""
  frontend_url     = local.domain_enabled ? "https://${var.app_subdomain}.${var.domain_name}" : var.frontend_url
  api_url          = local.domain_enabled ? "https://${var.api_subdomain}.${var.domain_name}" : ""
}

# ===========================================================================
# STEP 1 — Foundation (no cross-module deps)
# ===========================================================================

module "cognito" {
  source = "../modules/cognito"

  stage        = local.stage
  aws_region   = var.aws_region
  frontend_url = local.frontend_url
}

module "network" {
  source = "../modules/network"

  stage               = local.stage
  aws_region          = var.aws_region
  vpc_cidr            = "10.0.0.0/16"
  public_subnet_cidrs = ["10.0.1.0/24", "10.0.2.0/24"]
  availability_zones  = var.availability_zones
  enable_flow_logs    = true
}

# Storage: documents + frontend buckets (NO cloudfront dependency here)
module "storage" {
  source = "../modules/storage"

  stage                  = local.stage
  aws_account_id         = var.aws_account_id
  aws_region             = var.aws_region
  frontend_url           = local.frontend_url
  create_frontend_bucket = true
  force_destroy          = false
}

# ===========================================================================
# STEP 2 — DNS Zone + ACM Certificate
# Created BEFORE CloudFront so cert ARN can be passed to CloudFront.
# No dependency on CloudFront whatsoever.
# ===========================================================================

module "dns" {
  count = local.domain_enabled ? 1 : 0

  source = "../modules/dns"

  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  stage       = local.stage
  domain_name = var.domain_name
}

# ===========================================================================
# STEP 3 — Lambda + AppSync (depend on cognito + storage)
# ===========================================================================

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
  log_retention_days    = 90

  depends_on = [module.cognito, module.storage]
}

module "appsync" {
  source = "../modules/appsync"

  stage                     = local.stage
  aws_region                = var.aws_region
  cognito_user_pool_id      = module.cognito.user_pool_id
  cognito_user_pool_arn     = module.cognito.user_pool_arn
  lambda_execution_role_arn = module.lambda.execution_role_arn
  lambda_alias_arns         = module.lambda.appsync_resolver_prod_arns
  log_field_level           = "ERROR"
  xray_enabled              = true

  depends_on = [module.cognito, module.lambda]
}

# ===========================================================================
# STEP 4 — EC2 REST API (depends on network + storage + cognito)
# ===========================================================================

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

  depends_on = [module.network, module.storage, module.cognito]
}

# ===========================================================================
# STEP 5 — CloudFront
# Depends on: EC2 EIP (origin), storage buckets, ACM cert from dns module.
# Does NOT depend on dns A records (those come after).
# ===========================================================================

module "cloudfront" {
  source = "../modules/cloudfront"

  stage                           = local.stage
  api_origin_ip                   = module.ec2.public_ip
  frontend_bucket_regional_domain = module.storage.frontend_bucket_regional_domain
  frontend_bucket_arn             = module.storage.frontend_bucket_arn
  domain_name                     = var.domain_name
  api_subdomain                   = var.api_subdomain
  app_subdomain                   = var.app_subdomain
  acm_certificate_arn             = local.domain_enabled ? module.dns[0].certificate_arn : ""
  price_class                     = "PriceClass_200"

  depends_on = [module.ec2, module.storage, module.dns]
}

# ===========================================================================
# STEP 6 — Post-CloudFront resources (no circular deps)
# ===========================================================================

# S3 bucket policy — allow CloudFront OAC to read frontend bucket
# Created AFTER cloudfront to get the distribution ARN
resource "aws_s3_bucket_policy" "frontend_oac" {
  bucket = module.storage.frontend_bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudFrontServicePrincipal"
        Effect = "Allow"
        Principal = {
          Service = "cloudfront.amazonaws.com"
        }
        Action   = "s3:GetObject"
        Resource = "${module.storage.frontend_bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = module.cloudfront.frontend_distribution_arn
          }
        }
      }
    ]
  })

  depends_on = [module.storage, module.cloudfront]
}

# Route53 A/AAAA records pointing to CloudFront distributions
# Created AFTER cloudfront module — this breaks the cloudfront ↔ dns cycle
resource "aws_route53_record" "api_a" {
  count   = local.domain_enabled ? 1 : 0
  zone_id = module.dns[0].zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.cloudfront.api_domain_name
    zone_id                = module.cloudfront.api_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.dns, module.cloudfront]
}

resource "aws_route53_record" "api_aaaa" {
  count   = local.domain_enabled ? 1 : 0
  zone_id = module.dns[0].zone_id
  name    = "${var.api_subdomain}.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = module.cloudfront.api_domain_name
    zone_id                = module.cloudfront.api_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.dns, module.cloudfront]
}

resource "aws_route53_record" "app_a" {
  count   = local.domain_enabled ? 1 : 0
  zone_id = module.dns[0].zone_id
  name    = "${var.app_subdomain}.${var.domain_name}"
  type    = "A"

  alias {
    name                   = module.cloudfront.frontend_domain_name
    zone_id                = module.cloudfront.frontend_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.dns, module.cloudfront]
}

resource "aws_route53_record" "app_aaaa" {
  count   = local.domain_enabled ? 1 : 0
  zone_id = module.dns[0].zone_id
  name    = "${var.app_subdomain}.${var.domain_name}"
  type    = "AAAA"

  alias {
    name                   = module.cloudfront.frontend_domain_name
    zone_id                = module.cloudfront.frontend_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.dns, module.cloudfront]
}

# Root domain vebgenix.com → app.vebgenix.com (CloudFront frontend)
resource "aws_route53_record" "root_a" {
  count   = local.domain_enabled ? 1 : 0
  zone_id = module.dns[0].zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.cloudfront.frontend_domain_name
    zone_id                = module.cloudfront.frontend_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.dns, module.cloudfront]
}

resource "aws_route53_record" "root_aaaa" {
  count   = local.domain_enabled ? 1 : 0
  zone_id = module.dns[0].zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = module.cloudfront.frontend_domain_name
    zone_id                = module.cloudfront.frontend_hosted_zone_id
    evaluate_target_health = false
  }

  depends_on = [module.dns, module.cloudfront]
}

# ===========================================================================
# STEP 7 — Async + Monitoring
# ===========================================================================

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

module "monitoring" {
  source = "../modules/monitoring"

  stage                 = local.stage
  aws_region            = var.aws_region
  alert_email           = var.alert_email
  lambda_function_names = local.all_lambda_function_names
  log_retention_days    = 90
  email_queue_name      = module.async.email_queue_name
  email_dlq_name        = module.async.email_dlq_name
  jobs_queue_name       = module.async.jobs_queue_name
  jobs_dlq_name         = module.async.jobs_dlq_name
  ec2_instance_id       = module.ec2.instance_id

  depends_on = [module.lambda, module.async, module.ec2]
}

# ===========================================================================
# Import blocks — existing resources (Terraform 1.5+ syntax)
# Comment these out after first successful import
# ===========================================================================

import {
  id = "ap-south-1_waAjEC9Nj"
  to = module.cognito.aws_cognito_user_pool.main
}

import {
  id = "o6cgickkk5dpxej6lirgo7bpna"
  to = module.appsync.aws_appsync_graphql_api.main
}

import {
  id = "vebgenix-documents-prod-278035644568"
  to = module.storage.aws_s3_bucket.documents
}

import {
  id = "i-0b1260d7d90d8f7b3"
  to = module.ec2.aws_instance.rest_api
}

import {
  id = "eipalloc-0d28ee2f60ceecf10"
  to = module.ec2.aws_eip.rest_api
}

import {
  id = "E11WI5ENBRMIYD"
  to = module.cloudfront.aws_cloudfront_distribution.api
}

import {
  id = "E1BFBMTG1KVMMD"
  to = module.cloudfront.aws_cloudfront_distribution.frontend
}
