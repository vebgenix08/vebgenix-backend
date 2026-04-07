# The dns module requires two providers:
#   aws           — default provider (ap-south-1) for Route53 records
#   aws.us_east_1 — aliased provider for ACM certificates (CloudFront requires us-east-1)
#
# The caller MUST pass both providers when using this module:
#
#   module "dns" {
#     source = "../modules/dns"
#
#     providers = {
#       aws           = aws
#       aws.us_east_1 = aws.us_east_1
#     }
#     ...
#   }

terraform {
  required_providers {
    aws = {
      source                = "hashicorp/aws"
      version               = "~> 5.0"
      configuration_aliases = [aws.us_east_1]
    }
  }
}
