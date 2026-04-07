# Backend configuration is specified per environment.
# Each environment (dev/prod) directory contains its own backend configuration.
# This root-level file documents the shared backend resources.
#
# Backend bucket: vebgenix-terraform-state-278035644568
# DynamoDB lock table: vebgenix-terraform-locks
# Region: ap-south-1
#
# To bootstrap the backend resources, run from the AWS Console or CLI:
#
#   aws s3api create-bucket \
#     --bucket vebgenix-terraform-state-278035644568 \
#     --region ap-south-1 \
#     --create-bucket-configuration LocationConstraint=ap-south-1
#
#   aws s3api put-bucket-versioning \
#     --bucket vebgenix-terraform-state-278035644568 \
#     --versioning-configuration Status=Enabled
#
#   aws s3api put-bucket-encryption \
#     --bucket vebgenix-terraform-state-278035644568 \
#     --server-side-encryption-configuration \
#       '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
#
#   aws dynamodb create-table \
#     --table-name vebgenix-terraform-locks \
#     --attribute-definitions AttributeName=LockID,AttributeType=S \
#     --key-schema AttributeName=LockID,KeyType=HASH \
#     --billing-mode PAY_PER_REQUEST \
#     --region ap-south-1
