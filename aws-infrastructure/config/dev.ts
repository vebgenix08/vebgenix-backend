import { EnvConfig } from "./types";

export const devConfig: EnvConfig = {
  stage: "dev",
  region: "ap-south-1",
  account: "278035644568",

  // Tagging
  tags: {
    project: "vebgenix",
    stage: "dev",
    owner: "platform-team",
  },

  // Network
  enableNat: false, // No NAT in dev — use VPC Endpoints + stubs for external APIs

  // EC2 REST API and EC2 Postgres are disabled for dev:
  // - Backend runs as Lambda (AppSync + domain Lambdas via CDK)
  // - Database is MongoDB Atlas (no EC2 Postgres needed)
  enableEc2RestApi: false,
  enableEc2Postgres: false,

  // Database (MongoDB Atlas — no RDS needed)
  enableDatabase: false,

  // App
  appBaseUrl: 'https://d3a3860ho28y9p.cloudfront.net',

  // AppSync
  enableWaf: false,

  // Storage
  s3UseKmsCmk: false, // Use SSE-S3 in dev to save cost

  // Logs
  logRetentionDays: 7,

  // Budget
  budgetWarnAmountUsd: 40,
  budgetCriticalAmountUsd: 50,
};
