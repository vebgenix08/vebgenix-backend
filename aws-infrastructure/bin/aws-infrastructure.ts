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

// 4. Async: EventBridge + SQS + Worker Lambdas
const asyncStack = new AsyncStack(app, `VebgenixAsync-${config.stage}`, {
  env,
  config,
  vpc: networkStack.vpc,
  sgLambda: networkStack.sgLambda,
  dbProxyEndpoint: `placeholder-proxy-${config.stage}`,
  dbSecretArn: `arn:aws:secretsmanager:${config.region}:${config.account}:secret:vebgenix/${config.stage}/db-master*`,
  emailBucket: storageStack.bucket,
});
asyncStack.addDependency(networkStack);

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
  dbProxyEndpoint: `placeholder-proxy-${config.stage}`,
  dbSecretArn: `arn:aws:secretsmanager:${config.region}:${config.account}:secret:vebgenix/${config.stage}/db-master*`,
});
appSyncStack.addDependency(authStack);
appSyncStack.addDependency(networkStack);
appSyncStack.addDependency(asyncStack);

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

// NOTE: DatabaseStack (VebgenixDatabase) omitted until AWS account plan allows RDS.
// Deploy separately once account upgraded:
//   npx cdk deploy VebgenixDatabase-dev -c env=dev --require-approval never

app.synth();
