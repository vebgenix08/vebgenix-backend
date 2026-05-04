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
    key            = "dev/terraform.tfstate"
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

resource "mongodbatlas_project" "dev" {
  name   = "vebgenix-dev"
  org_id = var.mongodb_atlas_org_id
}

resource "mongodbatlas_cluster" "dev" {
  project_id = mongodbatlas_project.dev.id
  name       = "vebgenix-dev"

  provider_name               = "TENANT"
  backing_provider_name       = "AWS"
  provider_region_name        = "AP_SOUTH_1"
  provider_instance_size_name = "M0" # Free tier for dev

  auto_scaling_disk_gb_enabled = false

  labels {
    key   = "environment"
    value = "dev"
  }
}

resource "mongodbatlas_database_user" "app" {
  username           = "ags"
  password           = var.mongodb_app_password
  project_id         = mongodbatlas_project.dev.id
  auth_database_name = "admin"

  roles {
    role_name     = "readWrite"
    database_name = "vebgenix_dev"
  }

  scopes {
    name = mongodbatlas_cluster.dev.name
    type = "CLUSTER"
  }
}

# Allow all IPs (Lambda/EC2 IPs are dynamic) — restrict in prod via VPC Peering
resource "mongodbatlas_project_ip_access_list" "all" {
  project_id = mongodbatlas_project.dev.id
  cidr_block = "0.0.0.0/0"
  comment    = "Dev: all IPs (Lambda IPs are dynamic)"
}

# ── AWS Secrets Manager: Write Atlas URI so CDK resolves it at deploy time ────
#
# CDK stacks read this via CloudFormation dynamic references:
#   {{resolve:secretsmanager:vebgenix/dev/mongodb:SecretString:uri}}
#
# The secret name MUST match exactly: vebgenix/{stage}/mongodb
# The JSON key MUST be: uri

locals {
  mongodb_uri = "mongodb+srv://${mongodbatlas_database_user.app.username}:${var.mongodb_app_password}@${replace(mongodbatlas_cluster.dev.connection_strings[0].standard_srv, "mongodb+srv://", "")}/${var.mongodb_db_name}?retryWrites=true&w=majority"
}

resource "aws_secretsmanager_secret" "mongodb" {
  name        = "vebgenix/dev/mongodb"
  description = "MongoDB Atlas connection string for dev — read by CDK Lambdas at runtime"

  tags = {
    Environment = "dev"
    ManagedBy   = "terraform"
  }
}

resource "aws_secretsmanager_secret_version" "mongodb" {
  secret_id     = aws_secretsmanager_secret.mongodb.id
  secret_string = jsonencode({ uri = local.mongodb_uri })
}
