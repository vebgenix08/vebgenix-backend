output "atlas_cluster_connection_string" {
  description = "MongoDB Atlas cluster SRV connection string (without credentials)"
  value       = mongodbatlas_cluster.dev.connection_strings[0].standard_srv
  sensitive   = true
}

output "atlas_project_id" {
  description = "MongoDB Atlas project ID"
  value       = mongodbatlas_project.dev.id
}

output "mongodb_secret_name" {
  description = "Secrets Manager secret name holding the MongoDB URI (read by CDK stacks)"
  value       = aws_secretsmanager_secret.mongodb.name
}
