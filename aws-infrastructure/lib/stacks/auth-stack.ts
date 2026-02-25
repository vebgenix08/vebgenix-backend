import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';

interface AuthStackProps extends cdk.StackProps {
  config: EnvConfig;
}

export class AuthStack extends cdk.Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolId: string;
  public readonly userPoolClientId: string;

  constructor(scope: Construct, id: string, props: AuthStackProps) {
    super(scope, id, props);
    const { config } = props;

    // ---------------------------------------------------------------
    // Cognito User Pool (NO Identity Pool — presigned URLs via Lambda)
    // ---------------------------------------------------------------
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `vebgenix-${config.stage}`,
      selfSignUpEnabled: false, // Only platform provisions users
      signInAliases: { email: true },
      autoVerify: { email: true },
      standardAttributes: {
        email: { required: true, mutable: true },
        fullname: { required: true, mutable: true },
      },
      customAttributes: {
        // Tenant ID stored on the user — read in every Lambda resolver
        tenant_id: new cognito.StringAttribute({ mutable: false }),
        // Coarse role — fine-grained permissions enforced in Lambda
        role: new cognito.StringAttribute({ mutable: true }),
      },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
        tempPasswordValidity: cdk.Duration.days(7),
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      mfa: config.stage === 'prod'
        ? cognito.Mfa.OPTIONAL
        : cognito.Mfa.OFF,
      removalPolicy: config.stage === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // ---------------------------------------------------------------
    // Cognito Groups (coarse authorization, checked in Lambda)
    // ---------------------------------------------------------------
    const groups = ['SUPER_ADMIN', 'SCHOOL_ADMIN', 'STAFF', 'TEACHER'];
    groups.forEach(group => {
      new cognito.CfnUserPoolGroup(this, `Group${group}`, {
        userPoolId: this.userPool.userPoolId,
        groupName: group,
        description: `${group} group`,
      });
    });

    // ---------------------------------------------------------------
    // App Client (no client secret — SPA / mobile compatible)
    // ---------------------------------------------------------------
    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `vebgenix-web-${config.stage}`,
      generateSecret: false,
      authFlows: {
        userPassword: true,     // For initial migration from Supabase
        userSrp: true,          // Recommended long-term
        custom: true,           // For migration Lambda trigger
      },
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      enableTokenRevocation: true,
      preventUserExistenceErrors: true,
    });

    this.userPoolId = this.userPool.userPoolId;
    this.userPoolClientId = this.userPoolClient.userPoolClientId;

    // ---------------------------------------------------------------
    // Outputs (used by frontend .env and Lambda configs)
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, 'UserPoolId', { value: this.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: this.userPoolClientId });
    new cdk.CfnOutput(this, 'UserPoolArn', { value: this.userPool.userPoolArn });
    new cdk.CfnOutput(this, 'CognitoJwksUrl', {
      value: `https://cognito-idp.${config.region}.amazonaws.com/${this.userPoolId}/.well-known/jwks.json`,
    });
  }
}
