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
}

export class AsyncStack extends cdk.Stack {
  public readonly emailQueue: sqs.Queue;
  public readonly jobsQueue: sqs.Queue;
  public readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props: AsyncStackProps) {
    super(scope, id, props);
    const { config, vpc, sgLambda, dbProxyEndpoint, dbSecretArn } = props;
    const privateSubnetSelection = { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };

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
      vpc,
      vpcSubnets: privateSubnetSelection,
      securityGroups: [sgLambda],
      environment: {
        STAGE: config.stage,
        DB_PROXY_ENDPOINT: dbProxyEndpoint,
        DB_SECRET_ARN: dbSecretArn,
        FROM_EMAIL: `noreply@${config.stage === 'prod' ? 'vebgenix.com' : 'dev.vebgenix.com'}`,
        DOCUMENTS_BUCKET: props.emailBucket.bucketName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    // Grant SES send permissions
    emailWorker.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ses:SendEmail', 'ses:SendRawEmail'],
      resources: ['*'],
    }));

    // Grant Secrets Manager read for DB creds
    emailWorker.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [dbSecretArn],
    }));

    // Trigger from Email Queue (batch 5)
    emailWorker.addEventSource(new lambdaEventSources.SqsEventSource(this.emailQueue, {
      batchSize: 5,
      reportBatchItemFailures: true,
    }));

    // ---------------------------------------------------------------
    // Jobs Worker Lambda
    // ---------------------------------------------------------------
    const jobsWorker = new lambda.Function(this, 'JobsWorkerLambda', {
      functionName: `vebgenix-jobs-worker-${config.stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('lambda/jobs-worker'),
      timeout: cdk.Duration.seconds(120),
      memorySize: 256,
      vpc,
      vpcSubnets: privateSubnetSelection,
      securityGroups: [sgLambda],
      environment: {
        STAGE: config.stage,
        DB_PROXY_ENDPOINT: dbProxyEndpoint,
        DB_SECRET_ARN: dbSecretArn,
        DOCUMENTS_BUCKET: props.emailBucket.bucketName,
        NODE_OPTIONS: '--enable-source-maps',
      },
    });

    jobsWorker.addToRolePolicy(new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [dbSecretArn],
    }));

    jobsWorker.addEventSource(new lambdaEventSources.SqsEventSource(this.jobsQueue, {
      batchSize: 5,
      reportBatchItemFailures: true,
    }));

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, 'EventBusName', { value: this.eventBus.eventBusName });
    new cdk.CfnOutput(this, 'EmailQueueUrl', { value: this.emailQueue.queueUrl });
    new cdk.CfnOutput(this, 'JobsQueueUrl', { value: this.jobsQueue.queueUrl });
  }
}
