terraform {
  required_version = ">= 1.7"

  required_providers {
    mongodbatlas = {
      source  = "mongodb/mongodbatlas"
      version = "~> 1.15"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  backend "s3" {
    bucket         = "vebgenix-tf-state-278035644568"
    key            = "prod/terraform.tfstate"
    region         = "ap-south-1"
    dynamodb_table = "vebgenix-tf-locks"
    encrypt        = true
  }
}

provider "aws" {
  region = var.aws_region
}

provider "mongodbatlas" {
  public_key  = var.mongodb_atlas_public_key
  private_key = var.mongodb_atlas_private_key
}

# ── MongoDB Atlas ─────────────────────────────────────────────────────────────

resource "mongodbatlas_project" "prod" {
  name   = "vebgenix-prod"
  org_id = var.mongodb_atlas_org_id
}

resource "mongodbatlas_cluster" "prod" {
  project_id = mongodbatlas_project.prod.id
  name       = "vebgenix-prod"

  # M10 dedicated cluster for production — supports VPC Peering, backups,
  # and auto-scaling. Upgrade to M30+ if p99 latency requires it.
  provider_name               = "AWS"
  provider_region_name        = "AP_SOUTH_1"
  provider_instance_size_name = "M10"

  auto_scaling_disk_gb_enabled = true

  # Continuous backups (oplog-based point-in-time recovery)
  cloud_backup = true

  labels {
    key   = "environment"
    value = "prod"
  }
}

resource "mongodbatlas_database_user" "app" {
  username           = "vebgenix_app"
  password           = var.mongodb_app_password
  project_id         = mongodbatlas_project.prod.id
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = "vebgenix_prod"
  }

  scopes {
    name = mongodbatlas_cluster.prod.name
    type = "CLUSTER"
  }
}

# Prod: restrict to known CIDR ranges (Lambda NAT Gateway EIPs).
# Add each NAT Gateway EIP from the VPC stack here.
resource "mongodbatlas_project_ip_access_list" "lambda_egress" {
  for_each   = toset(var.lambda_egress_cidrs)
  project_id = mongodbatlas_project.prod.id
  cidr_block = each.value
  comment    = "Lambda NAT Gateway EIP — managed by Terraform"
}

# ── AWS Secrets Manager: MongoDB URI ─────────────────────────────────────────
#
# CDK stacks read this via CloudFormation dynamic references:
#   {{resolve:secretsmanager:vebgenix/prod/mongodb:SecretString:uri}}
#
# Secret name MUST match: vebgenix/{stage}/mongodb   key: uri

locals {
  mongodb_uri = "mongodb+srv://${mongodbatlas_database_user.app.username}:${var.mongodb_app_password}@${replace(mongodbatlas_cluster.prod.connection_strings[0].standard_srv, "mongodb+srv://", "")}/${var.mongodb_db_name}?retryWrites=true&w=majority&appName=vebgenix-prod"
}

resource "aws_secretsmanager_secret" "mongodb" {
  name        = "vebgenix/prod/mongodb"
  description = "MongoDB Atlas connection string for prod — read by CDK Lambdas at runtime"

  # Rotate every 30 days if a rotation Lambda is configured
  # rotation_lambda_arn = var.rotation_lambda_arn

  tags = {
    Environment = "prod"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "mongodb" {
  secret_id     = aws_secretsmanager_secret.mongodb.id
  secret_string = jsonencode({ uri = local.mongodb_uri })
}

# ── AWS Secrets Manager: Razorpay ────────────────────────────────────────────
#
# CDK reads:
#   {{resolve:secretsmanager:vebgenix/prod/razorpay:SecretString:keyId}}
#   {{resolve:secretsmanager:vebgenix/prod/razorpay:SecretString:keySecret}}
#   {{resolve:secretsmanager:vebgenix/prod/razorpay:SecretString:webhookSecret}}
#
# Store the actual keys via: aws secretsmanager put-secret-value --secret-id
# vebgenix/prod/razorpay --secret-string '{"keyId":"rzp_live_...","keySecret":"...","webhookSecret":"..."}'
# (NOT via Terraform — keys must never appear in state files)

resource "aws_secretsmanager_secret" "razorpay" {
  name        = "vebgenix/prod/razorpay"
  description = "Razorpay live API keys for prod — populated manually, NOT via Terraform"

  tags = {
    Environment = "prod"
    ManagedBy   = "terraform"
  }
}
