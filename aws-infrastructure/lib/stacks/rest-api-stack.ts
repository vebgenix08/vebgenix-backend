import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as ssm from "aws-cdk-lib/aws-ssm";
import { Construct } from "constructs";
import { EnvConfig } from "../../config/types";

interface RestApiStackProps extends cdk.StackProps {
  config: EnvConfig;
  vpc: ec2.Vpc;
  sgApp: ec2.SecurityGroup;
  documentsBucket: s3.Bucket;
  userPoolId: string;
  userPoolClientId: string;
  dbHost: string;
  dbName: string;
  dbSecret: secretsmanager.ISecret;
  eventBusName: string;
  frontendUrl: string;
}

export class RestApiStack extends cdk.Stack {
  public readonly instance: ec2.Instance;
  public readonly apiUrl: string;

  constructor(scope: Construct, id: string, props: RestApiStackProps) {
    super(scope, id, props);
    const {
      config,
      vpc,
      sgApp,
      documentsBucket,
      userPoolId,
      userPoolClientId,
      dbHost,
      dbName,
      dbSecret,
      eventBusName,
      frontendUrl,
    } = props;

    const role = new iam.Role(this, "RestApiInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "AmazonSSMManagedInstanceCore",
        ),
      ],
    });

    documentsBucket.grantReadWrite(role);
    dbSecret.grantRead(role);

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath"],
        resources: [
          `arn:aws:ssm:${config.region}:${config.account}:parameter/vebgenix/${config.stage}/rest/*`,
          `arn:aws:ssm:${config.region}:${config.account}:parameter/vebgenix/${config.stage}/frontend/*`,
        ],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminAddUserToGroup",
          "cognito-idp:AdminEnableUser",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:ListUsers",
          "cognito-idp:ListUsersInGroup",
        ],
        resources: [
          `arn:aws:cognito-idp:${config.region}:${config.account}:userpool/${userPoolId}`,
        ],
      }),
    );

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["events:PutEvents"],
        resources: [
          `arn:aws:events:${config.region}:${config.account}:event-bus/${eventBusName}`,
        ],
      }),
    );

    const userData = ec2.UserData.forLinux();
    userData.addCommands(
      "set -euxo pipefail",
      "dnf update -y",
      "dnf install -y git jq nginx",
      "curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -",
      "dnf install -y nodejs",
      "systemctl enable nginx",
      "cat >/etc/nginx/conf.d/vebgenix-rest.conf <<'EOF'",
      "server {",
      "  listen 80;",
      "  server_name _;",
      "  client_max_body_size 50m;",
      "  location = /healthz {",
      "    add_header Content-Type text/plain;",
      "    return 200 'ok';",
      "  }",
      "  location / {",
      "    proxy_pass http://127.0.0.1:5000;",
      "    proxy_http_version 1.1;",
      "    proxy_set_header Host $host;",
      "    proxy_set_header X-Real-IP $remote_addr;",
      "    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
      "    proxy_set_header X-Forwarded-Proto $scheme;",
      "    proxy_set_header X-Forwarded-Host $host;",
      "  }",
      "}",
      "EOF",
      "systemctl restart nginx",
      "mkdir -p /opt/vebgenix/bin /opt/vebgenix/app /etc/vebgenix",
      `cat >/opt/vebgenix/bin/deploy-rest.sh <<'EOF'
#!/bin/bash
set -euxo pipefail
BRANCH="\${1:-${config.stage === "prod" ? "release" : "main"}}"
ARTIFACT_KEY="\${2:-}"
APP_DIR=/opt/vebgenix/app
STAGE="${config.stage}"
REGION="${config.region}"
REPO_URL="https://github.com/vebgenix08/vebgenix-backend.git"
DOC_BUCKET=$(aws ssm get-parameter --name "/vebgenix/$STAGE/rest/DOCUMENTS_BUCKET" --region "$REGION" --query Parameter.Value --output text)

rm -rf "$APP_DIR"
mkdir -p "$APP_DIR"

if [ -n "$ARTIFACT_KEY" ]; then
  aws s3 cp "s3://$DOC_BUCKET/$ARTIFACT_KEY" /tmp/vebgenix-backend.tgz --region "$REGION"
  tar -xzf /tmp/vebgenix-backend.tgz -C "$APP_DIR"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO_URL" "$APP_DIR"
fi

USER_POOL_ID=$(aws ssm get-parameter --name "/vebgenix/$STAGE/rest/USER_POOL_ID" --region "$REGION" --query Parameter.Value --output text)
USER_POOL_CLIENT_ID=$(aws ssm get-parameter --name "/vebgenix/$STAGE/rest/USER_POOL_CLIENT_ID" --region "$REGION" --query Parameter.Value --output text)
DB_HOST=$(aws ssm get-parameter --name "/vebgenix/$STAGE/rest/DB_HOST" --region "$REGION" --query Parameter.Value --output text)
DB_NAME=$(aws ssm get-parameter --name "/vebgenix/$STAGE/rest/DB_NAME" --region "$REGION" --query Parameter.Value --output text)
DB_SECRET_ARN=$(aws ssm get-parameter --name "/vebgenix/$STAGE/rest/DB_SECRET_ARN" --region "$REGION" --query Parameter.Value --output text)
EVENT_BUS_NAME=$(aws ssm get-parameter --name "/vebgenix/$STAGE/rest/EVENT_BUS_NAME" --region "$REGION" --query Parameter.Value --output text)
FRONTEND_URL=$(aws ssm get-parameter --name "/vebgenix/$STAGE/frontend/APP_URL" --region "$REGION" --query Parameter.Value --output text)
DB_SECRET_JSON=$(aws secretsmanager get-secret-value --secret-id "$DB_SECRET_ARN" --region "$REGION" --query SecretString --output text)
DB_USER=$(echo "$DB_SECRET_JSON" | jq -r '.username')
DB_PASS=$(echo "$DB_SECRET_JSON" | jq -r '.password')

cat >/etc/vebgenix-rest.env <<ENV
PORT=5000
NODE_ENV=production
AWS_REGION=$REGION
AWS_DEFAULT_REGION=$REGION
USER_POOL_ID=$USER_POOL_ID
USER_POOL_CLIENT_ID=$USER_POOL_CLIENT_ID
COGNITO_USER_POOL_ID=$USER_POOL_ID
DB_NAME=$DB_NAME
DATABASE_URL=postgresql://$DB_USER:$DB_PASS@$DB_HOST:5432/$DB_NAME
DIRECT_URL=postgresql://$DB_USER:$DB_PASS@$DB_HOST:5432/$DB_NAME
DOCUMENTS_BUCKET=$DOC_BUCKET
S3_BUCKET_NAME=$DOC_BUCKET
UPLOADS_BUCKET_NAME=$DOC_BUCKET
MEDIA_BUCKET_NAME=$DOC_BUCKET
S3_PUBLIC_BASE_URL=https://$DOC_BUCKET.s3.$REGION.amazonaws.com
S3_UPLOAD_ROOT=tenants
S3_CAMPUS_SEGMENT=campuses
S3_USER_SEGMENT=users
S3_TENANT_CAMPUS_FALLBACK=tenant
S3_PROFILE_SCOPE_NAME=profile
S3_BRANDING_SCOPE_NAME=branding
S3_ADMISSION_SCOPE_NAME=admissions
S3_APPLICATION_SCOPE_NAME=applications
S3_ENQUIRY_SCOPE_NAME=enquiries
S3_DOCUMENT_SCOPE_NAME=documents
S3_RESULTS_SCOPE_NAME=results
S3_PUBLISHED_RESULTS_SCOPE_NAME=published
S3_AVATAR_UPLOAD_NAME=avatar
S3_LOGO_UPLOAD_NAME=logo
EVENT_BUS_NAME=$EVENT_BUS_NAME
FRONTEND_URL=$FRONTEND_URL
HTTP_ACCESS_LOGS=false
PRISMA_DEBUG_QUERIES=false
ENV

cd "$APP_DIR/server"
npm ci
npx prisma generate --schema=prisma/schema.prisma
npx prisma migrate deploy --schema=prisma/schema.prisma
npm run build
systemctl daemon-reload
systemctl enable vebgenix-rest
systemctl restart vebgenix-rest
EOF`,
      "chmod +x /opt/vebgenix/bin/deploy-rest.sh",
      "cat >/etc/systemd/system/vebgenix-rest.service <<'EOF'",
      "[Unit]",
      "Description=Vebgenix REST API",
      "After=network-online.target",
      "Wants=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      "User=ec2-user",
      "WorkingDirectory=/opt/vebgenix/app/server",
      "EnvironmentFile=/etc/vebgenix-rest.env",
      "ExecStart=/usr/bin/node /opt/vebgenix/app/server/dist/main.js",
      "Restart=always",
      "RestartSec=5",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      "EOF",
      "systemctl daemon-reload",
    );

    this.instance = new ec2.Instance(this, "RestApiInstance", {
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      securityGroup: sgApp,
      instanceType: new ec2.InstanceType(config.restApiInstanceClass),
      machineImage: ec2.MachineImage.latestAmazonLinux2023({
        cpuType: ec2.AmazonLinuxCpuType.ARM_64,
      }),
      role,
      userData,
      requireImdsv2: true,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(config.restApiVolumeSizeGb, {
            encrypted: true,
            volumeType: ec2.EbsDeviceVolumeType.GP3,
          }),
        },
      ],
    });

    const apiDistribution = new cloudfront.Distribution(this, "ApiDistribution", {
      defaultBehavior: {
        origin: new origins.HttpOrigin(this.instance.instancePublicDnsName, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
        }),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100,
    });

    this.apiUrl = `https://${apiDistribution.distributionDomainName}`;

    new ssm.StringParameter(this, "FrontendApiBaseUrlParam", {
      parameterName: `/vebgenix/${config.stage}/frontend/VITE_API_BASE_URL`,
      stringValue: this.apiUrl,
    });
    new ssm.StringParameter(this, "FrontendAppUrlParam", {
      parameterName: `/vebgenix/${config.stage}/frontend/APP_URL`,
      stringValue: frontendUrl,
    });
    new ssm.StringParameter(this, "RestUserPoolIdParam", {
      parameterName: `/vebgenix/${config.stage}/rest/USER_POOL_ID`,
      stringValue: userPoolId,
    });
    new ssm.StringParameter(this, "RestUserPoolClientIdParam", {
      parameterName: `/vebgenix/${config.stage}/rest/USER_POOL_CLIENT_ID`,
      stringValue: userPoolClientId,
    });
    new ssm.StringParameter(this, "RestDocumentsBucketParam", {
      parameterName: `/vebgenix/${config.stage}/rest/DOCUMENTS_BUCKET`,
      stringValue: documentsBucket.bucketName,
    });
    new ssm.StringParameter(this, "RestEventBusNameParam", {
      parameterName: `/vebgenix/${config.stage}/rest/EVENT_BUS_NAME`,
      stringValue: eventBusName,
    });
    new cdk.CfnOutput(this, "InstanceId", { value: this.instance.instanceId });
    new cdk.CfnOutput(this, "InstancePublicDns", {
      value: this.instance.instancePublicDnsName,
    });
    new cdk.CfnOutput(this, "ApiUrl", { value: this.apiUrl });
  }
}
