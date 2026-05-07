#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";

import { devConfig } from "../config/dev";
import { prodConfig } from "../config/prod";
import { EnvConfig } from "../config/types";
import { NetworkStack }    from "../lib/stacks/network-stack";
import { AuthStack }       from "../lib/stacks/auth-stack";
import { StorageStack }    from "../lib/stacks/storage-stack";
import { AsyncStack }      from "../lib/stacks/async-stack";
import { MonitoringStack } from "../lib/stacks/monitoring-stack";
import { AppSyncStack }    from "../lib/stacks/appsync-stack";
import { FrontendStack }   from "../lib/stacks/frontend-stack";
import { GithubOidcStack } from "../lib/stacks/github-oidc-stack";
import { RuntimeDepsStack } from "../lib/stacks/runtime-deps-stack";

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

// 1. Network: VPC + SGs (+ VPC endpoints when enableNat:true)
//    Only created when NAT is enabled OR a database is inside the VPC.
//    When enableNat:false + no DB, all Lambdas run outside VPC — no VPC cost.
const needsVpc = config.enableNat || config.enableDatabase || config.enableEc2Postgres;
const networkStack = needsVpc
  ? new NetworkStack(app, `VebgenixNetwork-${config.stage}`, { env, config })
  : undefined;

// 2. Stable third-party Node.js packages shared through a Lambda Layer
const runtimeDepsStack = new RuntimeDepsStack(app, `VebgenixRuntimeDeps-${config.stage}`, {
  env,
  config,
});

// 3. Auth: Cognito User Pool + PostConfirmation trigger Lambda
// vpc/sgLambda passed only when NAT is enabled — Lambdas run outside VPC otherwise
const authStack = new AuthStack(app, `VebgenixAuth-${config.stage}`, {
  env,
  config,
  runtimeDepsLayer: runtimeDepsStack.layer,
  ...(networkStack ? { vpc: networkStack.vpc, sgLambda: networkStack.sgLambda } : {}),
});
authStack.addDependency(runtimeDepsStack);
if (networkStack) {
  authStack.addDependency(networkStack);
}

// 4. Storage: Private S3 Bucket
const storageStack = new StorageStack(app, `VebgenixStorage-${config.stage}`, {
  env,
  config,
});

// 5. Async: EventBridge + SQS + Worker Lambdas
const asyncStack = new AsyncStack(app, `VebgenixAsync-${config.stage}`, {
  env,
  config,
  runtimeDepsLayer: runtimeDepsStack.layer,
  ...(networkStack ? { vpc: networkStack.vpc, sgLambda: networkStack.sgLambda } : {}),
});
asyncStack.addDependency(runtimeDepsStack);
if (networkStack) {
  asyncStack.addDependency(networkStack);
}

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
  runtimeDepsLayer: runtimeDepsStack.layer,
  ...(networkStack ? { vpc: networkStack.vpc, sgLambda: networkStack.sgLambda } : {}),
  eventBus:        asyncStack.eventBus,
  documentsBucket: storageStack.bucket,
});
appSyncStack.addDependency(authStack);
appSyncStack.addDependency(asyncStack);
appSyncStack.addDependency(runtimeDepsStack);
if (networkStack) {
  appSyncStack.addDependency(networkStack);
}

// 8. Frontend: S3 Bucket + CloudFront Distribution
const frontendStack = new FrontendStack(app, `VebgenixFrontend-${config.stage}`, {
  env,
  config,
  appSyncApiUrl:    appSyncStack.apiUrl,
  userPoolId:       authStack.userPool.userPoolId,
  userPoolClientId: authStack.userPoolClientId,
});
frontendStack.addDependency(appSyncStack);
frontendStack.addDependency(authStack);

// 9. CI/CD OIDC: Passwordless GitHub Actions integration
new GithubOidcStack(app, `VebgenixOidc-${config.stage}`, {
  env,
  config,
});

app.synth();
