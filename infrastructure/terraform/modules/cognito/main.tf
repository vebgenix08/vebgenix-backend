locals {
  name_prefix = "vebgenix-${var.stage}"
  tags = {
    Environment = var.stage
    Project     = "vebgenix"
    ManagedBy   = "terraform"
  }

  callback_urls = compact(concat(
    var.frontend_url != "" ? ["${var.frontend_url}/auth/callback"] : [],
    var.additional_callback_urls
  ))

  logout_urls = compact(concat(
    var.frontend_url != "" ? ["${var.frontend_url}/auth/logout"] : [],
    var.additional_logout_urls
  ))
}

# ---------------------------------------------------------------------------
# Cognito User Pool
# ---------------------------------------------------------------------------
resource "aws_cognito_user_pool" "main" {
  # Name matches existing prod pool "vebgenix-prod" (name is immutable after creation)
  name = local.name_prefix

  # Username configuration
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]

  username_configuration {
    case_sensitive = false
  }

  # Password policy
  password_policy {
    minimum_length                   = 8
    require_uppercase                = true
    require_lowercase                = true
    require_numbers                  = true
    require_symbols                  = true
    temporary_password_validity_days = 7
  }

  # MFA - Optional (users can enable TOTP)
  mfa_configuration = "OPTIONAL"

  software_token_mfa_configuration {
    enabled = true
  }

  # Email verification
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
    email_subject        = "Your Vebgenix verification code"
    email_message        = "Your verification code is {####}. This code expires in 24 hours."
  }

  # Account recovery
  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Email configuration (uses Cognito default; override with SES in prod)
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Schema attributes
  schema {
    name                     = "email"
    attribute_data_type      = "String"
    required                 = true
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 5
      max_length = 254
    }
  }

  schema {
    name                     = "tenant_id"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 0
      max_length = 36
    }
  }

  schema {
    name                     = "role"
    attribute_data_type      = "String"
    required                 = false
    mutable                  = true
    developer_only_attribute = false

    string_attribute_constraints {
      min_length = 0
      max_length = 64
    }
  }

  # Admin create user config
  admin_create_user_config {
    allow_admin_create_user_only = false

    invite_message_template {
      email_subject = "Your Vebgenix account invitation"
      email_message = "You have been invited to Vebgenix. Your username is {username} and temporary password is {####}."
      sms_message   = "Your Vebgenix username is {username} and temporary password is {####}."
    }
  }

  # User pool add-ons (advanced security) — managed separately, ignore drift
  user_pool_add_ons {
    advanced_security_mode = var.stage == "prod" ? "ENFORCED" : "AUDIT"
  }

  # Deletion protection for prod
  deletion_protection = var.stage == "prod" ? "ACTIVE" : "INACTIVE"

  tags = local.tags

  lifecycle {
    prevent_destroy = true
    ignore_changes = [
      # name is immutable — ignore drift between config and existing pool
      name,
      # schema changes require recreation — protect against accidental destruction
      schema,
      # advanced security mode — avoid unintentional cost changes on existing pools
      user_pool_add_ons,
      # username_configuration.case_sensitive forces replacement if pool was
      # created without it — ignore drift on existing pools
      username_configuration,
    ]
  }
}

# ---------------------------------------------------------------------------
# Cognito User Pool Domain
# ---------------------------------------------------------------------------
resource "aws_cognito_user_pool_domain" "main" {
  domain       = "${local.name_prefix}-auth"
  user_pool_id = aws_cognito_user_pool.main.id
}

# ---------------------------------------------------------------------------
# Cognito User Pool Client (for frontend SPA)
# ---------------------------------------------------------------------------
resource "aws_cognito_user_pool_client" "frontend" {
  name         = "${local.name_prefix}-frontend-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # No client secret for public SPA clients
  generate_secret = false

  # Auth flows
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
  ]

  # Token validity
  access_token_validity  = 60 # 60 minutes
  id_token_validity      = 60 # 60 minutes
  refresh_token_validity = 30 # 30 days

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  # OAuth 2.0 configuration
  allowed_oauth_flows_user_pool_client = length(local.callback_urls) > 0 ? true : false
  allowed_oauth_flows                  = length(local.callback_urls) > 0 ? ["code"] : []
  allowed_oauth_scopes                 = length(local.callback_urls) > 0 ? ["email", "openid", "profile"] : []

  callback_urls = length(local.callback_urls) > 0 ? local.callback_urls : null
  logout_urls   = length(local.logout_urls) > 0 ? local.logout_urls : null

  supported_identity_providers = ["COGNITO"]

  # Prevent user existence errors from leaking info
  prevent_user_existence_errors = "ENABLED"

  # Read and write attributes
  read_attributes = [
    "email",
    "email_verified",
    "custom:tenant_id",
    "custom:role",
    "name",
    "given_name",
    "family_name",
    "phone_number",
    "updated_at",
  ]

  write_attributes = [
    "email",
    "name",
    "given_name",
    "family_name",
    "phone_number",
    "custom:tenant_id",
    "custom:role",
  ]
}

# ---------------------------------------------------------------------------
# Cognito User Pool Client (for backend server-side operations)
# ---------------------------------------------------------------------------
resource "aws_cognito_user_pool_client" "backend" {
  name         = "${local.name_prefix}-backend-client"
  user_pool_id = aws_cognito_user_pool.main.id

  # Backend client uses client secret
  generate_secret = true

  # Auth flows for server-side
  explicit_auth_flows = [
    "ALLOW_USER_PASSWORD_AUTH",
    "ALLOW_REFRESH_TOKEN_AUTH",
    "ALLOW_USER_SRP_AUTH",
    "ALLOW_ADMIN_USER_PASSWORD_AUTH",
  ]

  # Token validity
  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30

  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  allowed_oauth_flows_user_pool_client = false

  prevent_user_existence_errors = "ENABLED"

  read_attributes = [
    "email",
    "email_verified",
    "custom:tenant_id",
    "custom:role",
    "name",
    "given_name",
    "family_name",
  ]

  write_attributes = [
    "email",
    "name",
    "given_name",
    "family_name",
    "custom:tenant_id",
    "custom:role",
  ]
}

# ---------------------------------------------------------------------------
# Cognito Identity Pool (for direct AWS service access if needed)
# ---------------------------------------------------------------------------
resource "aws_cognito_identity_pool" "main" {
  identity_pool_name               = "${local.name_prefix}-identity"
  allow_unauthenticated_identities = false
  allow_classic_flow               = false

  cognito_identity_providers {
    client_id               = aws_cognito_user_pool_client.frontend.id
    provider_name           = aws_cognito_user_pool.main.endpoint
    server_side_token_check = true
  }

  tags = local.tags
}
