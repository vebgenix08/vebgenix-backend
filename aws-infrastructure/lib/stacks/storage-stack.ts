import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';

interface StorageStackProps extends cdk.StackProps {
  config: EnvConfig;
}

export class StorageStack extends cdk.Stack {
  public readonly bucket: s3.Bucket;
  public readonly bucketName: string;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);
    const { config } = props;

    // ---------------------------------------------------------------
    // KMS Key — CMK in prod, skip in dev (use SSE-S3)
    // ---------------------------------------------------------------
    let encryptionKey: kms.Key | undefined;
    let encryption: s3.BucketEncryption;

    if (config.s3UseKmsCmk) {
      encryptionKey = new kms.Key(this, 'S3KmsKey', {
        alias: `vebgenix/${config.stage}/s3-documents`,
        description: 'KMS CMK for Vebgenix private document storage',
        enableKeyRotation: true,
        removalPolicy: cdk.RemovalPolicy.RETAIN,
      });
      encryption = s3.BucketEncryption.KMS;
    } else {
      encryption = s3.BucketEncryption.S3_MANAGED;
    }

    // ---------------------------------------------------------------
    // Private Document Bucket
    // Key schema: tenant/{tenantId}/{module}/{entityId}/{uuid}-{filename}
    // ---------------------------------------------------------------
    this.bucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `vebgenix-documents-${config.stage}-${this.account}`,
      encryption,
      encryptionKey,

      // Block ALL public access — no exceptions
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      publicReadAccess: false,

      versioned: config.stage === 'prod',

      // Enforce HTTPS only
      enforceSSL: true,

      // Lifecycle: move to IA after 90 days (prod), keep standard in dev
      lifecycleRules: config.stage === 'prod' ? [
        {
          id: 'MoveToIA',
          enabled: true,
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: cdk.Duration.days(90),
            },
          ],
        },
      ] : [],

      removalPolicy: config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: config.stage !== 'prod',

      // CORS — presigned uploads (PUT/POST) and presigned downloads (GET/HEAD)
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD, s3.HttpMethods.PUT, s3.HttpMethods.POST],
          allowedOrigins: ['*'], // Restrict to your domain in prod
          allowedHeaders: ['*'],
          maxAge: 300,
        },
      ],
    });

    this.bucketName = this.bucket.bucketName;

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, 'BucketName', { value: this.bucket.bucketName });
    if (encryptionKey) {
      new cdk.CfnOutput(this, 'KmsKeyArn', { value: encryptionKey.keyArn });
    }
  }
}
