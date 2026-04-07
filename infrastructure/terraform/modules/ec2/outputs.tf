output "instance_id" {
  description = "EC2 instance ID"
  value       = aws_instance.rest_api.id
}

output "instance_arn" {
  description = "EC2 instance ARN"
  value       = aws_instance.rest_api.arn
}

output "private_ip" {
  description = "EC2 instance private IP address"
  value       = aws_instance.rest_api.private_ip
}

output "public_ip" {
  description = "Elastic IP address (public)"
  value       = aws_eip.rest_api.public_ip
}

output "eip_allocation_id" {
  description = "Elastic IP allocation ID"
  value       = aws_eip.rest_api.allocation_id
}

output "instance_profile_arn" {
  description = "IAM instance profile ARN"
  value       = aws_iam_instance_profile.ec2_instance.arn
}

output "iam_role_arn" {
  description = "IAM role ARN for the EC2 instance"
  value       = aws_iam_role.ec2_instance.arn
}

output "ami_id" {
  description = "AMI ID used for the EC2 instance"
  value       = local.resolved_ami
}
