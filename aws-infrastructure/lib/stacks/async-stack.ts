import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';
import * as path from 'path';
import { RUNTIME_LAYER_EXTERNAL_MODULES } from './runtime-deps-stack';

const REPO_ROOT = path.resolve(__dirname, '../../../');

interface AsyncStackProps extends cdk.StackProps {
  config: EnvConfig;
  /** Only required when enableNat is true — see AppSyncStack comment. */
  vpc?: ec2.Vpc;
  sgLambda?: ec2.SecurityGroup;
  runtimeDepsLayer: lambda.ILayerVersion;
}

export class AsyncStack extends cdk.Stack {
  public readonly emailQueue: sqs.Queue;
  public readonly jobsQueue: sqs.Queue;
  public readonly eventBus: events.EventBus;

  constructor(scope: Construct, id: string, props: AsyncStackProps) {
    super(scope, id, props);
    const { config, vpc, sgLambda, runtimeDepsLayer } = props;
    const vpcConfig = vpc && sgLambda
      ? { vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, securityGroups: [sgLambda] }
      : {};

    // ── EventBridge Custom Bus ───────────────────────────────────────────
    this.eventBus = new events.EventBus(this, 'AppEventBus', {
      eventBusName: `vebgenix-${config.stage}`,
    });

    // ── SQS: Email ────────────────────────────────────────────────────────
    const emailDlq = new sqs.Queue(this, 'EmailDlq', {
      queueName:        `vebgenix-email-dlq-${config.stage}`,
      retentionPeriod:  cdk.Duration.days(14),
    });
    this.emailQueue = new sqs.Queue(this, 'EmailQueue', {
      queueName:         `vebgenix-email-${config.stage}`,
      visibilityTimeout: cdk.Duration.seconds(90),
      deadLetterQueue:   { queue: emailDlq, maxReceiveCount: 3 },
    });

    // ── SQS: Background Jobs ─────────────────────────────────────────────
    const jobsDlq = new sqs.Queue(this, 'JobsDlq', {
      queueName:       `vebgenix-jobs-dlq-${config.stage}`,
      retentionPeriod: cdk.Duration.days(14),
    });
    this.jobsQueue = new sqs.Queue(this, 'JobsQueue', {
      queueName:         `vebgenix-jobs-${config.stage}`,
      visibilityTimeout: cdk.Duration.seconds(120),
      deadLetterQueue:   { queue: jobsDlq, maxReceiveCount: 3 },
    });

    // ── EventBridge Rules ─────────────────────────────────────────────────
    // AdmissionApproved → email (acceptance letter) + jobs (generate student reg number)
    new events.Rule(this, 'AdmissionApprovedRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['AdmissionApproved'] },
      targets: [
        new targets.SqsQueue(this.emailQueue),
        new targets.SqsQueue(this.jobsQueue, {
          message: events.RuleTargetInput.fromObject({
            type:      'GENERATE_REG_NUMBER',
            tenantId:  events.EventField.fromPath('$.detail.tenantId'),
            entityId:  events.EventField.fromPath('$.detail.studentId'),
          }),
        }),
      ],
    });

    // AdmissionRejected → email
    new events.Rule(this, 'AdmissionRejectedRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['AdmissionRejected'] },
      targets: [new targets.SqsQueue(this.emailQueue)],
    });

    // StaffInvited → email (handled by Cognito AdminCreateUser directly,
    //   but EventBridge rule kept for custom onboarding emails)
    new events.Rule(this, 'StaffInvitedRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['StaffInvited'] },
      targets: [new targets.SqsQueue(this.emailQueue)],
    });

    // EnquiryReceived → email (acknowledgement)
    new events.Rule(this, 'EnquiryReceivedRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['EnquiryReceived'] },
      targets: [new targets.SqsQueue(this.emailQueue)],
    });

    // InvoiceCreated → email
    new events.Rule(this, 'InvoiceCreatedRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['InvoiceCreated'] },
      targets: [new targets.SqsQueue(this.emailQueue)],
    });

    // PaymentReceived → email (receipt)
    new events.Rule(this, 'PaymentReceivedRule', {
      eventBus: this.eventBus,
      eventPattern: { detailType: ['PaymentReceived'] },
      targets: [new targets.SqsQueue(this.emailQueue)],
    });

    // ── Shared Lambda env ─────────────────────────────────────────────────
    const workerEnv: Record<string, string> = {
      STAGE:      config.stage,
      MONGODB_URI:`{{resolve:secretsmanager:vebgenix/${config.stage}/mongodb:SecretString:uri}}`,
      NODE_OPTIONS: '--enable-source-maps',
    };

    // ── Email Worker Lambda ───────────────────────────────────────────────
    const emailWorker = new nodejs.NodejsFunction(this, 'EmailWorkerLambda', {
      functionName: `vebgenix-email-worker-${config.stage}`,
      runtime:      lambda.Runtime.NODEJS_20_X,
      entry:        path.join(REPO_ROOT, 'apps/workers/email-worker/src/handler.ts'),
      handler:      'handler',
      timeout:      cdk.Duration.seconds(60),
      memorySize:   256,
      ...vpcConfig,
      environment: {
        ...workerEnv,
        SMTP_HOST:     `{{resolve:secretsmanager:vebgenix/${config.stage}/smtp:SecretString:host}}`,
        SMTP_PORT:     `{{resolve:secretsmanager:vebgenix/${config.stage}/smtp:SecretString:port}}`,
        SMTP_USER:     `{{resolve:secretsmanager:vebgenix/${config.stage}/smtp:SecretString:user}}`,
        SMTP_PASSWORD: `{{resolve:secretsmanager:vebgenix/${config.stage}/smtp:SecretString:password}}`,
        SMTP_FROM:     `{{resolve:secretsmanager:vebgenix/${config.stage}/smtp:SecretString:from}}`,
        APP_NAME:      'Vebgenix',
        APP_BASE_URL:  config.appBaseUrl ?? '',
      },
      layers: [runtimeDepsLayer],
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        forceDockerBundling: false,
        minify:   config.stage === 'prod',
        sourceMap: config.stage !== 'prod',
        externalModules: ['@aws-sdk/*', ...RUNTIME_LAYER_EXTERNAL_MODULES],
      },
    });

    // SES fallback (email-worker can also use SES directly via AWS SDK)
    emailWorker.addToRolePolicy(new iam.PolicyStatement({
      actions:   ['ses:SendEmail', 'ses:SendRawEmail', 'ses:SendTemplatedEmail'],
      resources: ['*'],
    }));

    emailWorker.addEventSource(new lambdaEventSources.SqsEventSource(this.emailQueue, {
      batchSize:            5,
      reportBatchItemFailures: true,
    }));

    // ── Jobs Worker Lambda ────────────────────────────────────────────────
    const jobsWorker = new nodejs.NodejsFunction(this, 'JobsWorkerLambda', {
      functionName: `vebgenix-jobs-worker-${config.stage}`,
      runtime:      lambda.Runtime.NODEJS_20_X,
      entry:        path.join(REPO_ROOT, 'apps/workers/jobs-worker/src/handler.ts'),
      handler:      'handler',
      timeout:      cdk.Duration.seconds(120),
      memorySize:   256,
      ...vpcConfig,
      environment:  workerEnv,
      layers:       [runtimeDepsLayer],
      tracing:      lambda.Tracing.ACTIVE,
      bundling: {
        forceDockerBundling: false,
        minify:    config.stage === 'prod',
        sourceMap: config.stage !== 'prod',
        externalModules: ['@aws-sdk/*', ...RUNTIME_LAYER_EXTERNAL_MODULES],
      },
    });

    jobsWorker.addEventSource(new lambdaEventSources.SqsEventSource(this.jobsQueue, {
      batchSize:            5,
      reportBatchItemFailures: true,
    }));

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, 'EventBusName', { value: this.eventBus.eventBusName });
    new cdk.CfnOutput(this, 'EventBusArn',  { value: this.eventBus.eventBusArn  });
    new cdk.CfnOutput(this, 'EmailQueueUrl',{ value: this.emailQueue.queueUrl   });
    new cdk.CfnOutput(this, 'JobsQueueUrl', { value: this.jobsQueue.queueUrl    });
  }
}
