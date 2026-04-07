output "documents_bucket_name" {
  description = "Name of the documents S3 bucket"
  value       = aws_s3_bucket.documents.id
}

output "documents_bucket_arn" {
  description = "ARN of the documents S3 bucket"
  value       = aws_s3_bucket.documents.arn
}

output "documents_bucket_regional_domain" {
  description = "Regional domain name of the documents S3 bucket"
  value       = aws_s3_bucket.documents.bucket_regional_domain_name
}

output "frontend_bucket_id" {
  description = "ID (name) of the frontend static files S3 bucket"
  value       = var.create_frontend_bucket ? aws_s3_bucket.frontend[0].id : ""
}

output "frontend_bucket_name" {
  description = "Name of the frontend static files S3 bucket"
  value       = var.create_frontend_bucket ? aws_s3_bucket.frontend[0].id : ""
}

output "frontend_bucket_arn" {
  description = "ARN of the frontend static files S3 bucket"
  value       = var.create_frontend_bucket ? aws_s3_bucket.frontend[0].arn : ""
}

output "frontend_bucket_regional_domain" {
  description = "Regional domain name of the frontend S3 bucket"
  value       = var.create_frontend_bucket ? aws_s3_bucket.frontend[0].bucket_regional_domain_name : ""
}

output "lambda_documents_policy_arn" {
  description = "IAM policy ARN for Lambda access to documents bucket"
  value       = aws_iam_policy.lambda_documents_access.arn
}
