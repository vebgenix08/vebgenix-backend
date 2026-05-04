import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as nodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';
import * as path from 'path';
import { RUNTIME_LAYER_EXTERNAL_MODULES } from './runtime-deps-stack';

const REPO_ROOT = path.resolve(__dirname, '../../../');

interface AuthStackProps extends cdk.StackProps {
  config: EnvConfig;
  /** Only required when enableNat is true — see AppSyncStack comment. */
  vpc?: ec2.Vpc;
  sgLambda?: ec2.SecurityGroup;
  runtimeDepsLayer: lambda.ILayerVersion;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolId: string;
  public readonly userPoolClientId: string;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { config, vpc, sgLambda, runtimeDepsLayer } = props;
    const vpcConfig = vpc && sgLambda
      ? { vpc, vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS }, securityGroups: [sgLambda] }
      : {};

    // ── Cognito PostConfirmation trigger ─────────────────────────────────
    // Runs after a user confirms sign-up or accepts an admin invite.
    // Creates / updates the AuthUser document in MongoDB so all Lambda
    // resolvers can look up the user by cognitoSub.
    const cognitoSyncFn = new nodejs.NodejsFunction(this, 'CognitoSyncFn', {
      functionName: `vebgenix-cognito-sync-${config.stage}`,
      runtime:      lambda.Runtime.NODEJS_20_X,
      entry:        path.join(REPO_ROOT, 'apps/workers/cognito-sync/src/handler.ts'),
      handler:      'handler',
      timeout:      cdk.Duration.seconds(10),
      memorySize:   256,
      ...vpcConfig,
      environment: {
        STAGE:       config.stage,
        MONGODB_URI: `{{resolve:secretsmanager:vebgenix/${config.stage}/mongodb:SecretString:uri}}`,
        NODE_OPTIONS: '--enable-source-maps',
      },
      layers: [runtimeDepsLayer],
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        forceDockerBundling: false,
        minify:    config.stage === 'prod',
        sourceMap: config.stage !== 'prod',
        externalModules: ['@aws-sdk/*', ...RUNTIME_LAYER_EXTERNAL_MODULES],
      },
    });

    // ── Cognito User Pool ─────────────────────────────────────────────────
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName:    `vebgenix-${config.stage}`,
      selfSignUpEnabled: false,          // Only platform provisions users via InviteStaff
      signInAliases:   { email: true },
      autoVerify:      { email: true },
      standardAttributes: {
        email:    { required: true, mutable: true },
        fullname: { required: true, mutable: true },
        phoneNumber: { required: false, mutable: true },
      },
      customAttributes: {
        // Tenant the user belongs to (set by InviteStaff / AdminCreateUser)
        tenantId: new cognito.StringAttribute({ mutable: false }),
        // Coarse role — fine-grained RBAC enforced in Lambda from MongoDB Profile
        role:     new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength:         10,
        requireLowercase:  true,
        requireUppercase:  true,
        requireDigits:     true,
        requireSymbols:    false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: config.stage === 'prod' ? cognito.Mfa.OPTIONAL : cognito.Mfa.OFF,

      // PostConfirmation trigger — syncs Cognito user to MongoDB
      lambdaTriggers: {
        postConfirmation: cognitoSyncFn,
      },

      removalPolicy: config.stage === 'prod'
        ? cdk.RemovalPolicy.RETAIN
        : cdk.RemovalPolicy.DESTROY,
    });

    // ── Cognito Groups (coarse authorization) ─────────────────────────────
    const groups = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF', 'TEACHER', 'STUDENT'];
    groups.forEach(group => {
      new cognito.CfnUserPoolGroup(this, `Group${group}`, {
        userPoolId:  this.userPool.userPoolId,
        groupName:   group,
        description: `${group} group`,
      });
    });

    // ── App Client ────────────────────────────────────────────────────────
    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `vebgenix-web-${config.stage}`,
      generateSecret:     false,         // SPA + mobile compatible
      authFlows: {
        userPassword: true,              // Email + password sign-in
        userSrp:      true,              // Recommended secure SRP flow
        custom:       true,              // Migration Lambda hook (if needed)
      },
      accessTokenValidity:  cdk.Duration.hours(1),
      idTokenValidity:      cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
    });

    this.userPoolId       = this.userPool.userPoolId;
    this.userPoolClientId = this.userPoolClient.userPoolClientId;

    // ── Outputs (used by frontend .env + CDK downstream stacks) ──────────
    new cdk.CfnOutput(this, 'UserPoolId',       { value: this.userPoolId       });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClientId });
    new cdk.CfnOutput(this, 'UserPoolArn',      { value: this.userPool.userPoolArn });
    new cdk.CfnOutput(this, 'CognitoJwksUrl', {
      value: `https://cognito-idp.${config.region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`,
    });
  }
}
