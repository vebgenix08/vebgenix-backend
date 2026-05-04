import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';

interface GithubOidcStackProps extends cdk.StackProps {
  config: EnvConfig;
}

export class GithubOidcStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    // Import the existing GitHub OIDC Identity Provider (one provider per URL is allowed per AWS account)
    const githubProvider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(
      this,
      'GithubOidcProvider',
      `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`,
    );

    // Strategy 1: The Deployment Role for the Backend (CDK) Repository
    const backendRole = new iam.Role(this, 'GithubDeployRoleBackend', {
      roleName: `GitHubDeployRole-vebgenix-backend-${props.config.stage}`,
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:vebgenix08/vebgenix-backend:*`,
        },
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
      }),
    });
    // For CDK, it needs AdministratorAccess since it provisions vast ranges of IAM/VPC/RDS resources
    backendRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('AdministratorAccess'));

    // Strategy 2: The Deployment Role for the Frontend (SPA) Repository
    // The frontend only needs to sync to S3, invalidate CloudFront, and read SSM Params
    const frontendRole = new iam.Role(this, 'GithubDeployRoleFrontend', {
      roleName: `GitHubDeployRole-vebgenix-frontend-${props.config.stage}`,
      assumedBy: new iam.WebIdentityPrincipal(githubProvider.openIdConnectProviderArn, {
        StringLike: {
          'token.actions.githubusercontent.com:sub': `repo:vebgenix08/vebgenix-frontend:*`,
        },
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
        },
      }),
    });

    frontendRole.addToPolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [`arn:aws:ssm:${this.region}:${this.account}:parameter/vebgenix/${props.config.stage}/frontend/*`],
    }));

    frontendRole.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:ListBucket', 's3:DeleteObject', 's3:GetObject'],
      resources: [
        `arn:aws:s3:::vebgenix-frontend-${props.config.stage}-${this.account}`,
        `arn:aws:s3:::vebgenix-frontend-${props.config.stage}-${this.account}/*`
      ],
    }));

    frontendRole.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation'],
      resources: [`arn:aws:cloudfront::${this.account}:distribution/*`],
    }));

    new cdk.CfnOutput(this, 'BackendDeployRoleArn', { value: backendRole.roleArn });
    new cdk.CfnOutput(this, 'FrontendDeployRoleArn', { value: frontendRole.roleArn });
  }
}
