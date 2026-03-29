import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';

interface AsyncStackProps extends cdk.StackProps {
  config: EnvConfig;
  vpc: ec2.Vpc;
  sgLambda: ec2.SecurityGroup;
  dbProxyEndpoint: string;
  dbSecretArn: string;
  emailBucket: s3.Bucket;
  userPoolId: string;
}

export class AsyncStack extends cdk.Stack {
  public readonly emailQueue: sqs.Queue;
  public readonly jobsQueue: sqs.Queue;
  public readonly cognitoProvisionQueue: sqs.Queue;
  public readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props: AsyncStackProps) {
    super(scope, id, props);
    const { config, vpc, sgLambda, dbProxyEndpoint, dbSecretArn, userPoolId } = props;
    const privateSubnetSelection = { subnetType: ec2.SubnetType.PRIVATE_ISOLATED };
    const sharedUploadEnv = {
      DOCUMENTS_BUCKET: props.emailBucket.bucketName,
      S3_BUCKET_NAME: props.emailBucket.bucketName,
      UPLOADS_BUCKET_NAME: props.emailBucket.bucketName,
      MEDIA_BUCKET_NAME: props.emailBucket.bucketName,
      S3_PUBLIC_BASE_URL:
        process.env.S3_PUBLIC_BASE_URL ||
        `https://${props.emailBucket.bucketName}.s3.${config.region}.amazonaws.com`,
      S3_UPLOAD_ROOT: process.env.S3_UPLOAD_ROOT || 'tenants',
      S3_CAMPUS_SEGMENT: process.env.S3_CAMPUS_SEGMENT || 'campuses',
      S3_USER_SEGMENT: process.env.S3_USER_SEGMENT || 'users',
      S3_TENANT_CAMPUS_FALLBACK:
        process.env.S3_TENANT_CAMPUS_FALLBACK || 'tenant',
      S3_PROFILE_SCOPE_NAME: process.env.S3_PROFILE_SCOPE_NAME || 'profile',
      S3_BRANDING_SCOPE_NAME:
        process.env.S3_BRANDING_SCOPE_NAME || 'branding',
      S3_AVATAR_UPLOAD_NAME: process.env.S3_AVATAR_UPLOAD_NAME || 'avatar',
      S3_LOGO_UPLOAD_NAME: process.env.S3_LOGO_UPLOAD_NAME || 'logo',
    };

    // ---------------------------------------------------------------
    // EventBridge Custom Bus
    // ---------------------------------------------------------------
    this.eventBus = new events.EventBus(this, 'AppEventBus', {
      eventBusName: `vebgenix-${config.stage}`,
    });

    // ---------------------------------------------------------------
    // SQS Queues with Dead Letter Queues
    // ---------------------------------------------------------------
    const emailDlq = new sqs.Queue(this, 'EmailDlq', {
      queueName: `vebgenix-email-dlq-${config.stage}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    this.emailQueue = new sqs.Queue(this, 'EmailQueue', {
      queueName: `vebgenix-email-${config.stage}`,
      visibilityTimeout: cdk.Duration.seconds(90),
      deadLetterQueue: { queue: emailDlq, maxReceiveCount: 3 },
    });

    const jobsDlq = new sqs.Queue(this, 'JobsDlq', {
      queueName: `vebgenix-jobs-dlq-${config.stage}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    this.jobsQueue = new sqs.Queue(this, 'JobsQueue', {
      queueName: `vebgenix-jobs-${config.stage}`,
      visibilityTimeout: cdk.Duration.seconds(120),
      deadLetterQueue: { queue: jobsDlq, maxReceiveCount: 3 },
    });

    const cognitoDlq = new sqs.Queue(this, 'CognitoProvisionDlq', {
      queueName: `vebgenix-cognito-provision-dlq-${config.stage}`,
      retentionPeriod: cdk.Duration.days(14),
    });

    this.cognitoProvisionQueue = new sqs.Queue(this, 'CognitoProvisionQueue', {
      queueName: `vebgenix-cognito-provision-${config.stage}`,
      visibilityTimeout: cdk.Duration.seconds(120),
      deadLetterQueue: { queue: cognitoDlq, maxReceiveCount: 3 },
    });

    // AdmissionApproved → Email queue + Jobs queue (generate student ID)
    new events.Rule(this, 'AdmissionApprovedRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['AdmissionApproved'] },
      targets: [
        new targets.SqsQueue(this.emailQueue),
        new targets.SqsQueue(this.jobsQueue, {
          message: events.RuleTargetInput.fromObject({
            'detail-type': 'GenerateStudentId',
            detail: events.EventField.fromPath('$.detail'),
          }),
        }),
      ],
    });

    // AdmissionRejected → Email queue
    new events.Rule(this, 'AdmissionRejectedRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['AdmissionRejected'] },
      targets: [new targets.SqsQueue(this.emailQueue)],
    });

    // UserWelcome (fires from UsersLambda createUser) → Email queue
    new events.Rule(this, 'UserWelcomeRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['UserWelcome'] },
      targets: [new targets.SqsQueue(this.emailQueue)],
    });

    // EnquiryReceived → Email queue
    new events.Rule(this, 'EnquiryReceivedRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['EnquiryReceived'] },
      targets: [new targets.SqsQueue(this.emailQueue)],
    });

    // CognitoProvisionRequested → Cognito Provision queue (SQS) → CognitoProvisionerLambda
    new events.Rule(this, 'CognitoProvisionRequestedRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['CognitoProvisionRequested'] },
      targets: [new targets.SqsQueue(this.cognitoProvisionQueue)],
    });

    // ---------------------------------------------------------------
    // Email Worker Lambda
    // ---------------------------------------------------------------
    const emailWorker = new lambda.Function(this, 'EmailWorkerLambda', {
      functionName: `vebgenix-email-worker-${config.stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/email-worker'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      // No VPC for EmailWorker — uses public SES API via internet (free egress for Lambda)
      // vpc,
      // vpcSubnets: privateSubnetSelection,
      // securityGroups: [sgLambda],
      environment: {
        STAGE: config.stage,
        DB_PROXY_ENDPOINT: dbProxyEndpoint,
        DB_SECRET_ARN: dbSecretArn,
        FROM_EMAIL: `noreply@${config.stage === 'prod' ? 'vebgenix.com' : 'dev.vebgenix.com'}`,
        NODE_OPTIONS: '--enable-source-maps',
        ...sharedUploadEnv,
      },
    });

    // Grant SES send permissions
    emailWorker.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    // Grant Secrets Manager read for DB creds (only when ARN is valid)
    if (dbSecretArn && dbSecretArn.startsWith("arn:")) {
      emailWorker.addToRolePolicy(new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [dbSecretArn],
      }));
    }

    // Trigger from Email Queue (batch 5)
    emailWorker.addEventSource(new lambdaEventSources.SqsEventSource(this.emailQueue, {
      batchSize: 5,
      reportBatchItemFailures: true,
    }));

    // ---------------------------------------------------------------
    // Jobs Worker Lambda — Non-VPC
    // ---------------------------------------------------------------
    const jobsWorker = new lambda.Function(this, 'JobsWorkerLambda', {
      functionName: `vebgenix-jobs-worker-${config.stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/jobs-worker'),
      timeout: cdk.Duration.seconds(120),
      memorySize: 256,
      // No VPC — primarily EventBridge/SQS driven, no direct RDS access currently
      environment: {
        STAGE: config.stage,
        DB_PROXY_ENDPOINT: dbProxyEndpoint,
        DB_SECRET_ARN: dbSecretArn,
        NODE_OPTIONS: '--enable-source-maps',
        ...sharedUploadEnv,
      },
    });

    if (dbSecretArn && dbSecretArn.startsWith("arn:")) {
      jobsWorker.addToRolePolicy(new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [dbSecretArn],
      }));
    }

    jobsWorker.addEventSource(new lambdaEventSources.SqsEventSource(this.jobsQueue, {
      batchSize: 5,
      reportBatchItemFailures: true,
    }));

    // ---------------------------------------------------------------
    // Cognito Provisioner Lambda (SQS consumer)
    // ---------------------------------------------------------------
    const cognitoProvisioner = new lambda.Function(this, 'CognitoProvisionerLambda', {
      functionName: `vebgenix-cognito-provisioner-${config.stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/cognito-provisioner'),
      timeout: cdk.Duration.seconds(60),
      memorySize: 256,
      vpc,
      vpcSubnets: privateSubnetSelection,
      securityGroups: [sgLambda],
      environment: {
        STAGE: config.stage,
        DB_PROXY_ENDPOINT: dbProxyEndpoint,
        DB_SECRET_ARN: dbSecretArn,
        DB_NAME: "vebgenix",
        USER_POOL_ID: userPoolId,
        NODE_OPTIONS: '--enable-source-maps',
        ...sharedUploadEnv,
      },
    });

    if (dbSecretArn && dbSecretArn.startsWith("arn:")) {
      cognitoProvisioner.addToRolePolicy(new iam.PolicyStatement({
        actions: ['secretsmanager:GetSecretValue'],
        resources: [dbSecretArn],
      }));
    }

    cognitoProvisioner.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminGetUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminEnableUser',
        'cognito-idp:AdminDisableUser',
        'cognito-idp:AdminAddUserToGroup',
      ],
      resources: ['*'],
    }));

    cognitoProvisioner.addEventSource(new lambdaEventSources.SqsEventSource(this.cognitoProvisionQueue, {
      batchSize: 5,
      reportBatchItemFailures: true,
    }));

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, 'EventBusName', { value: this.eventBus.eventBusName });
    new cdk.CfnOutput(this, 'EmailQueueUrl', { value: this.emailQueue.queueUrl });
    new cdk.CfnOutput(this, 'JobsQueueUrl', { value: this.jobsQueue.queueUrl });
    new cdk.CfnOutput(this, 'CognitoProvisionQueueUrl', { value: this.cognitoProvisionQueue.queueUrl });
  }
}
