import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';

interface FrontendStackProps extends cdk.StackProps {
  config: EnvConfig;
  appSyncApiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
}

export class FrontendStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);

    // 1. S3 Bucket to hold the static React built files
    const siteBucket = new s3.Bucket(this, 'FrontendBucket', {
      bucketName: `vebgenix-frontend-${props.config.stage}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Secure: only accessible via CloudFront OAC
      removalPolicy: props.config.stage === 'dev' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: props.config.stage === 'dev',
      encryption: s3.BucketEncryption.S3_MANAGED,
    });

    // 2. CloudFront Origin Access Control (OAC) to access the private S3 bucket
    // Note: CloudFront natively supports OAC via BucketDeployment/Distribution in CDK natively
    
    // 3. CloudFront Distribution
    const distribution = new cloudfront.Distribution(this, 'FrontendDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      // Ensure SPA routing works correctly (e.g. /dashboard -> index.html)
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        },
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
          ttl: cdk.Duration.seconds(0),
        }
      ],
      defaultRootObject: 'index.html',
      priceClass: cloudfront.PriceClass.PRICE_CLASS_100, // Cheapest: US, Europe, Asia, Middle East
    });

    // 4. Store crucial connection settings in AWS SSM Parameter Store
    // The frontend GitHub Action will read these right before running 'npm run build'
    new ssm.StringParameter(this, 'AppSyncUrlParam', {
      parameterName: `/vebgenix/${props.config.stage}/frontend/VITE_APPSYNC_URL`,
      stringValue: props.appSyncApiUrl,
      description: 'AppSync GraphQL Endpoint URL',
    });

    new ssm.StringParameter(this, 'UserPoolIdParam', {
      parameterName: `/vebgenix/${props.config.stage}/frontend/VITE_USER_POOL_ID`,
      stringValue: props.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new ssm.StringParameter(this, 'UserPoolClientIdParam', {
      parameterName: `/vebgenix/${props.config.stage}/frontend/VITE_USER_POOL_CLIENT_ID`,
      stringValue: props.userPoolClientId,
      description: 'Cognito App Client ID',
    });

    new ssm.StringParameter(this, 'FrontendBucketNameParam', {
      parameterName: `/vebgenix/${props.config.stage}/frontend/BUCKET_NAME`,
      stringValue: siteBucket.bucketName,
      description: 'S3 bucket name for GitHub Actions deploy',
    });

    new ssm.StringParameter(this, 'CloudFrontDistIdParam', {
      parameterName: `/vebgenix/${props.config.stage}/frontend/CLOUDFRONT_DISTRIBUTION_ID`,
      stringValue: distribution.distributionId,
      description: 'CloudFront Distribution ID for GitHub Actions cache invalidation',
    });

    // Outputs
    new cdk.CfnOutput(this, 'FrontendUrl', {
      value: `https://${distribution.distributionDomainName}`,
      description: 'The URL of your deployed Frontend',
    });
  }
}
