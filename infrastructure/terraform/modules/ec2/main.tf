locals {
  name_prefix = "vebgenix-${var.stage}"
  tags = {
    Environment = var.stage
    Project     = "vebgenix"
    ManagedBy   = "terraform"
  }
}

# ---------------------------------------------------------------------------
# Data source: Latest Amazon Linux 2023 arm64 AMI
# ---------------------------------------------------------------------------
data "aws_ami" "al2023_arm64" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-arm64"]
  }

  filter {
    name   = "architecture"
    values = ["arm64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "state"
    values = ["available"]
  }
}

locals {
  resolved_ami = var.ami_id != "" ? var.ami_id : data.aws_ami.al2023_arm64.id
}

# ---------------------------------------------------------------------------
# IAM Role for EC2 instance
# ---------------------------------------------------------------------------
resource "aws_iam_role" "ec2_instance" {
  name = "${local.name_prefix}-ec2-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.tags
}

# SSM Session Manager (no SSH required)
resource "aws_iam_role_policy_attachment" "ssm_core" {
  role       = aws_iam_role.ec2_instance.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# CloudWatch Agent
resource "aws_iam_role_policy_attachment" "cloudwatch_agent" {
  role       = aws_iam_role.ec2_instance.name
  policy_arn = "arn:aws:iam::aws:policy/CloudWatchAgentServerPolicy"
}

resource "aws_iam_role_policy" "ec2_app_permissions" {
  name = "${local.name_prefix}-ec2-app-permissions"
  role = aws_iam_role.ec2_instance.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # S3 documents access
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket",
          "s3:GetBucketLocation",
        ]
        Resource = var.documents_bucket_name != "" ? [
          "arn:aws:s3:::${var.documents_bucket_name}",
          "arn:aws:s3:::${var.documents_bucket_name}/*",
        ] : ["arn:aws:s3:::vebgenix-documents-${var.stage}-*", "arn:aws:s3:::vebgenix-documents-${var.stage}-*/*"]
      },
      # Cognito
      {
        Effect = "Allow"
        Action = [
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminDeleteUser",
          "cognito-idp:AdminSetUserPassword",
          "cognito-idp:AdminInitiateAuth",
          "cognito-idp:ListUsers",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminRemoveUserFromGroup",
          "cognito-idp:AdminListGroupsForUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminResetUserPassword",
        ]
        Resource = "*"
      },
      # Secrets Manager
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret",
        ]
        Resource = "arn:aws:secretsmanager:${var.aws_region}:*:secret:vebgenix/${var.stage}/*"
      },
      # SSM Parameter Store
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath",
        ]
        Resource = "arn:aws:ssm:${var.aws_region}:*:parameter/vebgenix/${var.stage}/*"
      },
      # CloudWatch Logs
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
          "logs:DescribeLogStreams",
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      # SQS
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueUrl",
          "sqs:GetQueueAttributes",
        ]
        Resource = "arn:aws:sqs:${var.aws_region}:*:vebgenix-*"
      },
      # EventBridge
      {
        Effect = "Allow"
        Action = [
          "events:PutEvents",
        ]
        Resource = "arn:aws:events:${var.aws_region}:*:event-bus/vebgenix-${var.stage}"
      },
    ]
  })
}

resource "aws_iam_instance_profile" "ec2_instance" {
  name = "${local.name_prefix}-ec2-profile"
  role = aws_iam_role.ec2_instance.name

  tags = local.tags
}

# ---------------------------------------------------------------------------
# User data script
# ---------------------------------------------------------------------------
locals {
  user_data = <<-USERDATA
    #!/bin/bash
    set -euo pipefail
    exec > >(tee /var/log/user-data.log | logger -t user-data -s 2>/dev/console) 2>&1

    echo "==> Starting vebgenix REST API setup"

    # Update system packages
    dnf update -y

    # Install dependencies
    dnf install -y \
      nginx \
      git \
      curl \
      unzip \
      jq \
      amazon-cloudwatch-agent

    # Install nvm and Node.js ${var.node_version}
    export HOME=/root
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    source "$NVM_DIR/nvm.sh"
    nvm install ${var.node_version}
    nvm alias default ${var.node_version}
    nvm use default

    # Make node/npm available system-wide
    NODE_PATH=$(which node)
    NPM_PATH=$(which npm)
    ln -sf "$NODE_PATH" /usr/local/bin/node
    ln -sf "$NPM_PATH" /usr/local/bin/npm

    # Install PM2 for process management
    npm install -g pm2

    # Create app user
    useradd -r -s /bin/false -d /opt/vebgenix vebgenix || true
    mkdir -p /opt/vebgenix/app
    chown -R vebgenix:vebgenix /opt/vebgenix

    # Configure nginx as reverse proxy
    cat > /etc/nginx/conf.d/vebgenix.conf << 'NGINX'
    server {
        listen 80 default_server;
        server_name _;

        # Health check endpoint
        location /health {
            proxy_pass http://127.0.0.1:${var.app_port};
            proxy_http_version 1.1;
            proxy_set_header Connection "";
            access_log off;
        }

        location / {
            proxy_pass http://127.0.0.1:${var.app_port};
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
            proxy_cache_bypass $http_upgrade;
            proxy_read_timeout 60s;
            proxy_connect_timeout 10s;
        }
    }
    NGINX

    # Remove default nginx config
    rm -f /etc/nginx/conf.d/default.conf

    # Enable and start nginx
    systemctl enable nginx
    systemctl start nginx

    # Create systemd service for the Node.js app
    cat > /etc/systemd/system/vebgenix-rest.service << 'SERVICE'
    [Unit]
    Description=Vebgenix REST API
    After=network.target

    [Service]
    Type=simple
    User=vebgenix
    WorkingDirectory=/opt/vebgenix/app
    ExecStart=/usr/local/bin/node dist/index.js
    Restart=on-failure
    RestartSec=5
    StandardOutput=journal
    StandardError=journal
    SyslogIdentifier=vebgenix-rest
    Environment=NODE_ENV=production
    Environment=PORT=${var.app_port}
    Environment=STAGE=${var.stage}
    Environment=AWS_REGION=${var.aws_region}
    EnvironmentFile=-/opt/vebgenix/.env

    [Install]
    WantedBy=multi-user.target
    SERVICE

    systemctl daemon-reload
    systemctl enable vebgenix-rest

    # CloudWatch agent configuration
    cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CWAGENT'
    {
      "agent": {
        "metrics_collection_interval": 60,
        "run_as_user": "cwagent"
      },
      "logs": {
        "logs_collected": {
          "files": {
            "collect_list": [
              {
                "file_path": "/var/log/nginx/access.log",
                "log_group_name": "/aws/ec2/vebgenix-${var.stage}/nginx-access",
                "log_stream_name": "{instance_id}",
                "retention_in_days": 30
              },
              {
                "file_path": "/var/log/nginx/error.log",
                "log_group_name": "/aws/ec2/vebgenix-${var.stage}/nginx-error",
                "log_stream_name": "{instance_id}",
                "retention_in_days": 30
              },
              {
                "file_path": "/var/log/user-data.log",
                "log_group_name": "/aws/ec2/vebgenix-${var.stage}/user-data",
                "log_stream_name": "{instance_id}",
                "retention_in_days": 7
              }
            ]
          }
        },
        "metrics": {
          "metrics_collected": {
            "mem": {
              "measurement": ["mem_used_percent"]
            },
            "disk": {
              "measurement": ["disk_used_percent"],
              "resources": ["/"]
            }
          }
        }
      }
    }
    CWAGENT

    # Start CloudWatch agent
    systemctl enable amazon-cloudwatch-agent
    systemctl start amazon-cloudwatch-agent

    echo "==> Setup complete. Deploy app code via GitHub Actions."
  USERDATA
}

# ---------------------------------------------------------------------------
# EC2 Instance
# ---------------------------------------------------------------------------
resource "aws_instance" "rest_api" {
  ami                    = local.resolved_ami
  instance_type          = var.instance_type
  subnet_id              = var.subnet_id
  vpc_security_group_ids = var.security_group_ids
  iam_instance_profile   = aws_iam_instance_profile.ec2_instance.name
  key_name               = var.key_name != "" ? var.key_name : null

  # SSH disabled — use SSM Session Manager
  # key_name is optional and left null by default

  monitoring = var.enable_detailed_monitoring

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.volume_size_gb
    encrypted             = true
    delete_on_termination = true

    tags = merge(local.tags, {
      Name = "${local.name_prefix}-rest-api-root"
    })
  }

  user_data                   = local.user_data
  user_data_replace_on_change = false # Prevent recreation on user_data changes

  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # IMDSv2 required
    http_put_response_hop_limit = 1
  }

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-rest-api"
  })

  lifecycle {
    ignore_changes = [
      ami,           # Don't replace on AMI updates — use Systems Manager for patching
      user_data,     # Don't replace on user_data changes — managed via deployment
    ]
  }
}

# ---------------------------------------------------------------------------
# Elastic IP
# ---------------------------------------------------------------------------
resource "aws_eip" "rest_api" {
  domain = "vpc"

  tags = merge(local.tags, {
    Name = "${local.name_prefix}-rest-api-eip"
  })
}

resource "aws_eip_association" "rest_api" {
  instance_id   = aws_instance.rest_api.id
  allocation_id = aws_eip.rest_api.id
}
