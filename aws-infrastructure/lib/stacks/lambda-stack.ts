import * as cdk from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as events from 'aws-cdk-lib/aws-events';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { EnvConfig } from '../../config/types';

interface LambdaStackProps extends cdk.StackProps {
  config: EnvConfig;
  vpc: ec2.Vpc;
  sgLambda: ec2.SecurityGroup;
  api: appsync.GraphqlApi;
  eventBus: events.EventBus;
  documentsBucket: s3.Bucket;
  dbProxyEndpoint: string;
  dbSecretArn: string;
}

/**
 * LambdaStack: 5 domain resolver Lambdas + AppSync datasource wiring.
 *
 * Each Lambda handles one domain (NOT one Lambda per field).
 * All Lambdas run in VPC private subnets with least-privilege SGs.
 */
export class LambdaStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: LambdaStackProps) {
    super(scope, id, props);
    const { config, vpc, sgLambda, api, eventBus, documentsBucket, dbProxyEndpoint, dbSecretArn } = props;

    const privateSubnets = { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };

    // ---------------------------------------------------------------
    // Shared Lambda environment variables
    // ---------------------------------------------------------------
    const sharedEnv = {
      STAGE: config.stage,
      DB_PROXY_ENDPOINT: dbProxyEndpoint,
      DB_SECRET_ARN: dbSecretArn,
      DB_NAME: 'vebgenix',
      EVENT_BUS_NAME: eventBus.eventBusName,
      DOCUMENTS_BUCKET: documentsBucket.bucketName,
      NODE_OPTIONS: '--enable-source-maps',
    };

    // Shared IAM policy for DB access
    const dbPolicy = new iam.PolicyStatement({
      actions: ['secretsmanager:GetSecretValue'],
      resources: [dbSecretArn],
    });

    // ---------------------------------------------------------------
    // Helper: create a domain Lambda + AppSync datasource + resolvers
    // ---------------------------------------------------------------
    const domainLambda = (
      logicalId: string,
      functionName: string,
      assetPath: string,
      extraEnv: Record<string, string> = {}
    ) => {
      const fn = new lambda.Function(this, logicalId, {
        functionName: `vebgenix-${functionName}-${config.stage}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: 'index.handler',
        code: lambda.Code.fromAsset(assetPath),
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        vpc,
        vpcSubnets: privateSubnets,
        securityGroups: [sgLambda],
        environment: { ...sharedEnv, ...extraEnv },
        tracing: lambda.Tracing.ACTIVE,
        logFormat: 'JSON',
        applicationLogLevel: 'INFO',
        systemLogLevel: config.stage === 'prod' ? 'WARN' : 'INFO',
      });
      fn.addToRolePolicy(dbPolicy);
      return fn;
    };

    // ---------------------------------------------------------------
    // 1. Users Lambda
    // ---------------------------------------------------------------
    const usersLambda = domainLambda(
      'UsersLambda', 'users-resolver', 'lambda/users-resolver'
    );
    // Cognito admin permissions (create/update users in user pool)
    usersLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:AdminUpdateUserAttributes',
        'cognito-idp:AdminDisableUser',
        'cognito-idp:AdminGetUser',
        'cognito-idp:ListUsersInGroup',
      ],
      resources: [`arn:aws:cognito-idp:${config.region}:${config.account}:userpool/*`],
    }));

    // ---------------------------------------------------------------
    // 2. Admissions Lambda
    // ---------------------------------------------------------------
    const admissionsLambda = domainLambda(
      'AdmissionsLambda', 'admissions-resolver', 'lambda/admissions-resolver'
    );
    // EventBridge publish permission
    admissionsLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: ['events:PutEvents'],
      resources: [eventBus.eventBusArn],
    }));

    // ---------------------------------------------------------------
    // 3. Tenants Lambda
    // ---------------------------------------------------------------
    const tenantsLambda = domainLambda(
      'TenantsLambda', 'tenants-resolver', 'lambda/tenants-resolver'
    );
    tenantsLambda.addToRolePolicy(new iam.PolicyStatement({
      actions: [
        'cognito-idp:AdminCreateUser',
        'cognito-idp:ListUsers',
      ],
      resources: [`arn:aws:cognito-idp:${config.region}:${config.account}:userpool/*`],
    }));

    // ---------------------------------------------------------------
    // 4. Storage Lambda (presigned URLs)
    // ---------------------------------------------------------------
    const storageLambda = domainLambda(
      'StorageLambda', 'storage-resolver', 'lambda/storage-resolver'
    );
    documentsBucket.grantPut(storageLambda);
    documentsBucket.grantRead(storageLambda);

    // ---------------------------------------------------------------
    // 5. Admin Lambda (SUPER_ADMIN platform ops)
    // ---------------------------------------------------------------
    const adminLambda = domainLambda(
      'AdminLambda', 'admin-resolver', 'lambda/admin-resolver'
    );

    // ---------------------------------------------------------------
    // AppSync Lambda Datasources + Resolver wiring
    // ---------------------------------------------------------------
    const usersDs = api.addLambdaDataSource('UsersDs', usersLambda);
    const admissionsDs = api.addLambdaDataSource('AdmissionsDs', admissionsLambda);
    const tenantsDs = api.addLambdaDataSource('TenantsDs', tenantsLambda);
    const storageDs = api.addLambdaDataSource('StorageDs', storageLambda);
    const adminDs = api.addLambdaDataSource('AdminDs', adminLambda);

    // -- Users resolvers
    usersDs.createResolver('QueryMe', {
      typeName: 'Query', fieldName: 'me',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    usersDs.createResolver('QueryListUsers', {
      typeName: 'Query', fieldName: 'listUsers',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    usersDs.createResolver('QueryGetUser', {
      typeName: 'Query', fieldName: 'getUser',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    usersDs.createResolver('MutationCreateUser', {
      typeName: 'Mutation', fieldName: 'createUser',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    usersDs.createResolver('MutationUpdateUser', {
      typeName: 'Mutation', fieldName: 'updateUser',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    usersDs.createResolver('MutationDeactivateUser', {
      typeName: 'Mutation', fieldName: 'deactivateUser',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // -- Admissions resolvers
    admissionsDs.createResolver('QueryListAdmissions', {
      typeName: 'Query', fieldName: 'listAdmissions',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    admissionsDs.createResolver('QueryGetAdmission', {
      typeName: 'Query', fieldName: 'getAdmission',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    admissionsDs.createResolver('MutationCreateAdmission', {
      typeName: 'Mutation', fieldName: 'createAdmission',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    admissionsDs.createResolver('MutationUpdateAdmission', {
      typeName: 'Mutation', fieldName: 'updateAdmission',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    admissionsDs.createResolver('MutationSubmitAdmission', {
      typeName: 'Mutation', fieldName: 'submitAdmission',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    admissionsDs.createResolver('MutationReviewAdmission', {
      typeName: 'Mutation', fieldName: 'reviewAdmission',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    admissionsDs.createResolver('MutationWithdrawAdmission', {
      typeName: 'Mutation', fieldName: 'withdrawAdmission',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // -- Tenants resolvers (SUPER_ADMIN)
    tenantsDs.createResolver('QueryListTenants', {
      typeName: 'Query', fieldName: 'listTenants',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    tenantsDs.createResolver('QueryGetTenant', {
      typeName: 'Query', fieldName: 'getTenant',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    tenantsDs.createResolver('MutationCreateTenant', {
      typeName: 'Mutation', fieldName: 'createTenant',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    tenantsDs.createResolver('MutationUpdateTenant', {
      typeName: 'Mutation', fieldName: 'updateTenant',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
    tenantsDs.createResolver('MutationDeactivateTenant', {
      typeName: 'Mutation', fieldName: 'deactivateTenant',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // -- Storage resolver
    storageDs.createResolver('MutationGenerateUploadUrl', {
      typeName: 'Mutation', fieldName: 'generateUploadUrl',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });

    // -- Admin resolver
    adminDs.createResolver('QueryPlatformStats', {
      typeName: 'Query', fieldName: 'platformStats',
      requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
      responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
    });
  }
}
