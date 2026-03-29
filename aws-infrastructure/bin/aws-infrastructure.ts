#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import * as path from 'path';

// Load server/.env to get SMTP credentials for Lambdas (optional in CI)
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const dotenv = require("dotenv");
  dotenv.config({ path: path.resolve(__dirname, "../../../server/.env") });
} catch {
  // No-op if dotenv is unavailable in CI
}

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
import { DatabaseStack } from "../lib/stacks/database-stack";
import { BastionStack } from "../lib/stacks/bastion-stack";

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

// 2. Auth: Cognito User Pool
const authStack = new AuthStack(app, `VebgenixAuth-${config.stage}`, {
  env,
  config,
});

// 3. Storage: Private S3 Bucket
const storageStack = new StorageStack(app, `VebgenixStorage-${config.stage}`, {
  env,
  config,
});

const enableDatabase = config.enableDatabase === true;

let databaseStack: DatabaseStack | undefined;

if (enableDatabase) {
  databaseStack = new DatabaseStack(app, `VebgenixDatabase-${config.stage}`, {
    env,
    config,
    vpc: networkStack.vpc,
    sgDb: networkStack.sgDb,
    sgProxy: networkStack.sgProxy,
  });
}

// 4. Async: EventBridge + SQS + Worker Lambdas
const asyncStack = new AsyncStack(app, `VebgenixAsync-${config.stage}`, {
  env,
  config,
  vpc: networkStack.vpc,
  sgLambda: networkStack.sgLambda,
  dbProxyEndpoint: databaseStack ? databaseStack.dbProxyEndpoint : "DISABLED",
  dbSecretArn: databaseStack ? databaseStack.dbSecretArn : "DISABLED",
  emailBucket: storageStack.bucket,
  userPoolId: authStack.userPool.userPoolId,
});
asyncStack.addDependency(networkStack);
if (databaseStack) asyncStack.addDependency(databaseStack);

// 5. Monitoring: CloudWatch Alarms + Budget
new MonitoringStack(app, `VebgenixMonitoring-${config.stage}`, {
  env,
  config,
  asyncStack,
});

// 6. AppSync: GraphQL API + 5 domain Lambda resolvers (co-located to avoid CDK token cycles)
const appSyncStack = new AppSyncStack(app, `VebgenixAppSync-${config.stage}`, {
  env,
  config,
  userPool: authStack.userPool,
  vpc: networkStack.vpc,
  sgLambda: networkStack.sgLambda,
  eventBus: asyncStack.eventBus,
  documentsBucket: storageStack.bucket,
  dbProxyEndpoint: databaseStack ? databaseStack.dbProxyEndpoint : "DISABLED",
  dbSecretArn: databaseStack ? databaseStack.dbSecretArn : "DISABLED",
});
appSyncStack.addDependency(authStack);
appSyncStack.addDependency(networkStack);
appSyncStack.addDependency(asyncStack);
if (databaseStack) appSyncStack.addDependency(databaseStack);

// 7. Frontend: S3 Bucket + CloudFront Distribution (connected via SSM)
const frontendStack = new FrontendStack(
  app,
  `VebgenixFrontend-${config.stage}`,
  {
    env,
    config,
    appSyncApiUrl: appSyncStack.apiUrl,
    userPoolId: authStack.userPool.userPoolId,
    userPoolClientId: authStack.userPoolClientId,
  },
);
frontendStack.addDependency(appSyncStack);
frontendStack.addDependency(authStack);

// 8. CI/CD OIDC: Passwordless GitHub Actions integration
new GithubOidcStack(app, `VebgenixOidc-${config.stage}`, {
  env,
  config,
});

// 9. Bastion (Dev only) for DB migrations via SSM
if (config.stage === "dev" && databaseStack) {
  new BastionStack(app, `VebgenixBastion-${config.stage}`, {
    env,
    config,
    vpc: networkStack.vpc,
    sgDb: networkStack.sgDb,
  });
}

// NOTE: prod deployment executes VebgenixDatabase-prod separately.

app.synth();
