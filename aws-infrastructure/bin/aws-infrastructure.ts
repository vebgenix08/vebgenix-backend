#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { devConfig } from "../config/dev";
import { prodConfig } from "../config/prod";
import { EnvConfig } from "../config/types";
import { NetworkStack } from "../lib/stacks/network-stack";
import { AuthStack } from "../lib/stacks/auth-stack";
import { StorageStack } from "../lib/stacks/storage-stack";
import { AsyncStack } from "../lib/stacks/async-stack";
import { MonitoringStack } from "../lib/stacks/monitoring-stack";
import { AppSyncStack } from "../lib/stacks/appsync-stack";
import { FrontendStack } from "../lib/stacks/frontend-stack";
import { GithubOidcStack } from "../lib/stacks/github-oidc-stack";
import { Ec2DatabaseStack } from "../lib/stacks/ec2-database-stack";
import { RestApiStack } from "../lib/stacks/rest-api-stack";

const app = new cdk.App();

const stage = app.node.tryGetContext("env") as string;
if (!stage || !["dev", "prod"].includes(stage)) {
  throw new Error(
    "Usage: npx cdk deploy -c env=dev  OR  npx cdk deploy -c env=prod",
  );
}

const config: EnvConfig = stage === "prod" ? prodConfig : devConfig;
const env = { account: config.account, region: config.region };

Object.entries(config.tags).forEach(([k, v]) => cdk.Tags.of(app).add(k, v));

// 1. Network: VPC + SGs + VPC Endpoints
const networkStack = new NetworkStack(app, `VebgenixNetwork-${config.stage}`, {
  env,
  config,
});

// 2. Auth: Cognito User Pool + PostConfirmation trigger Lambda
// vpc/sgLambda only passed when NAT is enabled — otherwise Lambda runs outside VPC
const authStack = new AuthStack(app, `VebgenixAuth-${config.stage}`, {
  env,
  config,
  ...(config.enableNat ? { vpc: networkStack.vpc, sgLambda: networkStack.sgLambda } : {}),
});
authStack.addDependency(networkStack);

// 3. Storage: Private S3 Bucket
const storageStack = new StorageStack(app, `VebgenixStorage-${config.stage}`, {
  env,
  config,
});

// 4. EC2 Postgres DB (optional — used by REST API)
let ec2DatabaseStack: Ec2DatabaseStack | undefined;
if (config.enableEc2Postgres) {
  ec2DatabaseStack = new Ec2DatabaseStack(
    app,
    `VebgenixEc2Database-${config.stage}`,
    {
      env,
      config,
      vpc: networkStack.vpc,
      documentsBucket: storageStack.bucket,
    },
  );
  ec2DatabaseStack.addDependency(networkStack);
}

// 5. Async: EventBridge + SQS + Worker Lambdas
const asyncStack = new AsyncStack(app, `VebgenixAsync-${config.stage}`, {
  env,
  config,
  ...(config.enableNat ? { vpc: networkStack.vpc, sgLambda: networkStack.sgLambda } : {}),
});
asyncStack.addDependency(networkStack);

// 6. Monitoring: CloudWatch Alarms + Budget
new MonitoringStack(app, `VebgenixMonitoring-${config.stage}`, {
  env,
  config,
  asyncStack,
});

// 7. AppSync: GraphQL API + all domain Lambda resolvers
const appSyncStack = new AppSyncStack(app, `VebgenixAppSync-${config.stage}`, {
  env,
  config,
  userPool:        authStack.userPool,
  ...(config.enableNat ? { vpc: networkStack.vpc, sgLambda: networkStack.sgLambda } : {}),
  eventBus:        asyncStack.eventBus,
  documentsBucket: storageStack.bucket,
});
appSyncStack.addDependency(authStack);
appSyncStack.addDependency(networkStack);
appSyncStack.addDependency(asyncStack);

// 8. Frontend: S3 Bucket + CloudFront Distribution
const frontendStack = new FrontendStack(
  app,
  `VebgenixFrontend-${config.stage}`,
  {
    env,
    config,
    appSyncApiUrl:    appSyncStack.apiUrl,
    userPoolId:       authStack.userPool.userPoolId,
    userPoolClientId: authStack.userPoolClientId,
  },
);
frontendStack.addDependency(appSyncStack);
frontendStack.addDependency(authStack);

// 9. REST API: EC2 instance with Express app (optional)
if (config.enableEc2RestApi && ec2DatabaseStack) {
  const restApiStack = new RestApiStack(app, `VebgenixRestApi-${config.stage}`, {
    env,
    config,
    vpc:                 networkStack.vpc,
    sgApp:               networkStack.sgApp,
    dbHostSecurityGroup: ec2DatabaseStack.hostSecurityGroup,
    documentsBucket:     storageStack.bucket,
    userPoolId:          authStack.userPool.userPoolId,
    userPoolClientId:    authStack.userPoolClientId,
    dbHost:              ec2DatabaseStack.privateIp,
    dbName:              ec2DatabaseStack.dbName,
    dbSecret:            ec2DatabaseStack.dbSecret,
    eventBusName:        asyncStack.eventBus.eventBusName,
    frontendUrl:         frontendStack.frontendUrl,
  });
  restApiStack.addDependency(authStack);
  restApiStack.addDependency(storageStack);
  restApiStack.addDependency(asyncStack);
  restApiStack.addDependency(frontendStack);
  restApiStack.addDependency(ec2DatabaseStack);
}

// 10. CI/CD OIDC: Passwordless GitHub Actions integration
new GithubOidcStack(app, `VebgenixOidc-${config.stage}`, {
  env,
  config,
});

app.synth();
