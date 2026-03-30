import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as iam from "aws-cdk-lib/aws-iam";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as events from "aws-cdk-lib/aws-events";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as logs from "aws-cdk-lib/aws-logs";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";

import { Construct } from "constructs";
import { EnvConfig } from "../../config/types";
import * as path from "path";

interface AppSyncStackProps extends cdk.StackProps {
  config: EnvConfig;
  userPool: cognito.IUserPool;
  vpc: ec2.Vpc;
  sgLambda: ec2.SecurityGroup;
  eventBus: events.EventBus;
  documentsBucket: s3.Bucket;
  dbProxyEndpoint: string;
  dbSecretArn: string;
}

/**
 * AppSyncStack: GraphQL API + 5 domain Lambda resolvers in a SINGLE stack.
 *
 * Reason for co-location: separating API + Lambdas causes CDK cross-stack
 * cyclic references (Lambda.Arn CfnExport → AppSync datasource cycle).
 * Standard CDK pattern: keep tightly coupled AppSync + datasource Lambdas together.
 */
export class AppSyncStack extends cdk.Stack {
  public readonly api: appsync.GraphqlApi;
  public readonly apiUrl: string;
  public readonly apiId: string;

  constructor(scope: Construct, id: string, props: AppSyncStackProps) {
    super(scope, id, props);
    const {
      config,
      userPool,
      vpc,
      sgLambda,
      eventBus,
      documentsBucket,
      dbProxyEndpoint,
      dbSecretArn,
    } = props;

    const privateSubnets = { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS };
    const dbSecretsEnabled = dbSecretArn.startsWith("arn:");

    // ---------------------------------------------------------------
    // AppSync GraphQL API
    // ---------------------------------------------------------------
    this.api = new appsync.GraphqlApi(this, "Api", {
      name: `vebgenix-${config.stage}`,
      definition: appsync.Definition.fromFile(
        path.join(__dirname, "../schema/schema.graphql"),
      ),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.USER_POOL,
          userPoolConfig: {
            userPool,
            defaultAction: appsync.UserPoolDefaultAction.ALLOW,
          },
        },
        additionalAuthorizationModes: [
          { authorizationType: appsync.AuthorizationType.IAM },
        ],
      },
      logConfig: {
        fieldLogLevel:
          config.stage === "prod"
            ? appsync.FieldLogLevel.ERROR
            : appsync.FieldLogLevel.ALL,
        retention:
          config.stage === "prod"
            ? logs.RetentionDays.THREE_MONTHS
            : logs.RetentionDays.ONE_WEEK,
      },
      xrayEnabled: true,
    });

    this.apiUrl = this.api.graphqlUrl;
    this.apiId = this.api.apiId;

    // Explicitly extract the CfnSchema so resolvers can DependsOn it.
    // This prevents a race condition where CloudFormation tries to create
    // resolvers before AppSync has fully processed the schema update.
    const cfnSchema = this.api.schema?.bind(this.api) as any;
    const schemaNode = this.api.node.findChild("Schema");
    const cfnSchemaResource = schemaNode
      ? (schemaNode as any).node.defaultChild
      : null;

    // ---------------------------------------------------------------
    // Shared Lambda env + IAM
    // ---------------------------------------------------------------
    const sharedEnv = {
      STAGE: config.stage,
      DB_PROXY_ENDPOINT: dbProxyEndpoint,
      DB_SECRET_ARN: dbSecretArn,
      DB_NAME: "vebgenix",
      DATABASE_URL: dbSecretsEnabled
        ? `postgresql://postgres:${dbSecretArn}@${dbProxyEndpoint}:5432/vebgenix`
        : "",
      EVENT_BUS_NAME: eventBus.eventBusName,
      DOCUMENTS_BUCKET: documentsBucket.bucketName,
      USER_POOL_ID: userPool.userPoolId,
      NODE_OPTIONS: "--enable-source-maps",
    };

    const dbPolicy = dbSecretsEnabled
      ? new iam.PolicyStatement({
          actions: [
            "secretsmanager:GetSecretValue",
            "secretsmanager:DescribeSecret",
          ],
          resources: [
            dbSecretArn,
            `${dbSecretArn}-*`,
            `arn:aws:secretsmanager:${config.region}:${config.account}:secret:vebgenix/${config.stage}/db-master*`,
          ],
        })
      : undefined;

    // ---------------------------------------------------------------
    // Helper: create domain Lambda + AppSync datasource
    // ---------------------------------------------------------------
    const makeLambda = (logicalId: string, fnName: string, handler: string) => {
      const fn = new lambda.Function(this, logicalId, {
        functionName: `vebgenix-${fnName}-${config.stage}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        handler,
        // Entire lambda/ folder packaged so shared/ utilities are always available
        code: lambda.Code.fromAsset(path.resolve(__dirname, "../../lambda")),
        timeout: cdk.Duration.seconds(30),
        memorySize: 256,
        vpc,
        vpcSubnets: privateSubnets,
        securityGroups: [sgLambda],
        environment: sharedEnv,
        tracing: lambda.Tracing.ACTIVE,
      });

      if (dbPolicy) {
        fn.addToRolePolicy(dbPolicy);
      }
      return fn;
    };

    const makeDomainLambda = (logicalId: string, fnName: string, entryPath: string) => {
      const fn = new nodejs.NodejsFunction(this, logicalId, {
        functionName: `vebgenix-${fnName}-${config.stage}`,
        runtime: lambda.Runtime.NODEJS_20_X,
        entry: path.resolve(__dirname, '../../../server/src/interfaces/graphql', entryPath),
        handler: 'handler',
        timeout: cdk.Duration.seconds(30),
        memorySize: 512,
        vpc,
        vpcSubnets: privateSubnets,
        securityGroups: [sgLambda],
        environment: sharedEnv,
        tracing: lambda.Tracing.ACTIVE,
        bundling: {
          forceDockerBundling: false,
          minify: true,
          externalModules: ['@aws-sdk/*'], 
          sourceMap: true,
        },
      });

      if (dbPolicy) {
        fn.addToRolePolicy(dbPolicy);
      }
      return fn;
    };

    // ---------------------------------------------------------------
    // 1. Users Lambda
    // ---------------------------------------------------------------
    const usersLambda = makeLambda(
      "UsersLambda",
      "users-resolver",
      "users-resolver/index.handler",
    );
    usersLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "cognito-idp:AdminCreateUser",
          "cognito-idp:AdminUpdateUserAttributes",
          "cognito-idp:AdminDisableUser",
          "cognito-idp:AdminGetUser",
          "cognito-idp:ListUsersInGroup",
        ],
        resources: [
          `arn:aws:cognito-idp:${config.region}:${config.account}:userpool/*`,
        ],
      }),
    );

    // ---------------------------------------------------------------
    // 2. Admissions Lambda
    // ---------------------------------------------------------------
    const admissionsLambda = makeLambda(
      "AdmissionsLambda",
      "admissions-resolver",
      "admissions-resolver/index.handler",
    );
    admissionsLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["events:PutEvents"],
        resources: [eventBus.eventBusArn],
      }),
    );

    // ---------------------------------------------------------------
    // 3. Tenants Lambda (SUPER_ADMIN only)
    // ---------------------------------------------------------------
    const tenantsLambda = makeLambda(
      "TenantsLambda",
      "tenants-resolver",
      "tenants-resolver/index.handler",
    );
    tenantsLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["cognito-idp:AdminCreateUser", "cognito-idp:ListUsers"],
        resources: [
          `arn:aws:cognito-idp:${config.region}:${config.account}:userpool/*`,
        ],
      }),
    );

    // ---------------------------------------------------------------
    // 4. Storage Lambda (presigned upload URLs)
    // ---------------------------------------------------------------
    const storageLambda = makeLambda(
      "StorageLambda",
      "storage-resolver",
      "storage-resolver/index.handler",
    );
    documentsBucket.grantPut(storageLambda);
    documentsBucket.grantRead(storageLambda);

    // ---------------------------------------------------------------
    // 5. Admin Lambda (platform stats, SUPER_ADMIN)
    // ---------------------------------------------------------------
    const adminLambda = makeLambda(
      "AdminLambda",
      "admin-resolver",
      "admin-resolver/index.handler",
    );

    // ---------------------------------------------------------------
    // 6. Dashboard Lambda (superAdminOverview + dashboardOverview)
    // ---------------------------------------------------------------
    const dashboardLambda = makeLambda(
      "DashboardLambda",
      "dashboard-resolver",
      "dashboard-resolver/index.handler",
    );

    // ---------------------------------------------------------------
    // 7. Audit Logs Lambda (SUPER_ADMIN only)
    // ---------------------------------------------------------------
    const auditLogsLambda = makeLambda(
      "AuditLogsLambda",
      "audit-logs-resolver",
      "audit-logs-resolver/index.handler",
    );

    // ---------------------------------------------------------------
    // 8. Settings Lambda (Academic & Templates)
    // ---------------------------------------------------------------
    const settingsLambda = makeLambda(
      "SettingsLambda",
      "settings-resolver",
      "settings-resolver/index.handler",
    );

    // ---------------------------------------------------------------
    // 9. Students Lambda
    // ---------------------------------------------------------------
    const studentsLambda = makeLambda(
      "StudentsLambda",
      "students-resolver",
      "students-resolver/index.handler",
    );

    // ---------------------------------------------------------------
    // 10. Finance Lambda
    // ---------------------------------------------------------------
    const financeLambda = makeLambda(
      "FinanceLambda",
      "finance-resolver",
      "finance-resolver/index.handler",
    );

    // ---------------------------------------------------------------
    // AppSync Datasources
    // ---------------------------------------------------------------
    const usersDs = this.api.addLambdaDataSource("UsersDs", usersLambda);
    const admissionsDs = this.api.addLambdaDataSource(
      "AdmissionsDs",
      admissionsLambda,
    );
    const tenantsDs = this.api.addLambdaDataSource("TenantsDs", tenantsLambda);
    const storageDs = this.api.addLambdaDataSource("StorageDs", storageLambda);
    const adminDs = this.api.addLambdaDataSource("AdminDs", adminLambda);
    const dashboardDs = this.api.addLambdaDataSource(
      "DashboardDs",
      dashboardLambda,
    );
    const auditLogsDs = this.api.addLambdaDataSource(
      "AuditLogsDs",
      auditLogsLambda,
    );
    const settingsDs = this.api.addLambdaDataSource(
      "SettingsDs",
      settingsLambda,
    );
    const studentsDs = this.api.addLambdaDataSource(
      "StudentsDs",
      studentsLambda,
    );
    const financeDs = this.api.addLambdaDataSource(
      "FinanceDs",
      financeLambda,
    );

    // ---------------------------------------------------------------
    // Resolvers
    // ---------------------------------------------------------------
    // Helper: create resolver and explicitly depend on schema resource
    const R =
      (ds: appsync.LambdaDataSource) =>
      (typeName: string, fieldName: string) => {
        const resolver = ds.createResolver(`${typeName}${fieldName}`, {
          typeName,
          fieldName,
          requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
          responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
        });
        // Ensure resolver waits for schema to be fully applied
        if (cfnSchemaResource) {
          resolver.node.defaultChild &&
            (resolver.node.defaultChild as any).addDependency(
              cfnSchemaResource,
            );
        }
        return resolver;
      };

    const users = R(usersDs);
    users("Query", "me");
    users("Query", "listUsers");
    users("Query", "getUser");
    users("Mutation", "createUser");
    users("Mutation", "updateUser");
    users("Mutation", "deactivateUser");
    users("Mutation", "inviteStaff");

    const settings = R(settingsDs);
    settings("Mutation", "createAcademicYear");
    settings("Query", "listAcademicYears");
    settings("Mutation", "createTemplate");
    settings("Mutation", "publishTemplateVersion");
    settings("Query", "listTemplates");

    const students = R(studentsDs);
    students("Query", "listStudents");
    students("Mutation", "convertApplicationToStudent");

    const finance = R(financeDs);
    finance("Mutation", "createFeeHead");
    finance("Mutation", "createFeeStructure");

    const admissions = R(admissionsDs);
    admissions("Query", "listAdmissions");
    admissions("Query", "getAdmission");
    admissions("Mutation", "createAdmission");
    admissions("Mutation", "updateAdmission");
    admissions("Mutation", "submitAdmission");
    admissions("Mutation", "reviewAdmission");
    admissions("Mutation", "withdrawAdmission");

    const tenants = R(tenantsDs);
    tenants("Query", "listTenants");
    tenants("Query", "getTenant");
    tenants("Mutation", "createTenant");
    tenants("Mutation", "updateTenant");
    tenants("Mutation", "deactivateTenant");

    R(storageDs)("Mutation", "generateUploadUrl");
    R(adminDs)("Query", "platformStats");

    // Dashboard resolvers
    const dashboard = R(dashboardDs);
    dashboard("Query", "dashboardOverview");
    dashboard("Query", "superAdminOverview");

    // Audit Logs resolvers (SUPER_ADMIN)
    const auditLogs = R(auditLogsDs);
    auditLogs("Query", "listPlatformAuditLogs");
    auditLogs("Query", "getPlatformAuditLog");

    // ---------------------------------------------------------------
    // Outputs
    // ---------------------------------------------------------------
    new cdk.CfnOutput(this, "ApiUrl", { value: this.apiUrl });
    new cdk.CfnOutput(this, "ApiId", { value: this.apiId });
    new cdk.CfnOutput(this, "ApiArn", { value: this.api.arn });
  }
}
