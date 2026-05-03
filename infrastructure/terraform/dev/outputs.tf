output "atlas_cluster_connection_string" {
  description = "MongoDB Atlas cluster SRV connection string (without credentials)"
  value       = mongodbatlas_cluster.dev.connection_strings[0].standard_srv
  sensitive   = true
}

output "atlas_project_id" {
  description = "MongoDB Atlas project ID"
  value       = mongodbatlas_project.dev.id
}

output "mongodb_ssm_parameter_name" {
  description = "SSM parameter name holding the MongoDB URI"
  value       = aws_ssm_parameter.mongodb_uri.name
}
