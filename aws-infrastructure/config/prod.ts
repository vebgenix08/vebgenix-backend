import { EnvConfig } from "./types";

export const prodConfig: EnvConfig = {
  stage: "prod",
  region: "ap-south-1",
  account: "278035644568",

  // Tagging
  tags: {
    project: "vebgenix",
    stage: "prod",
    owner: "platform-team",
  },

  // Network
  // NAT: keep false until Razorpay/Fast2SMS outbound calls go live.
  // When enabling: add 1 NAT Gateway (cost-optimised, single AZ).
  enableNat: false,

  // EC2 REST API + EC2 Postgres: disabled — backend is Lambda + MongoDB Atlas.
  // These flags gate VebgenixEc2Database-prod and VebgenixRestApi-prod stacks.
  // Re-enable only if a dedicated REST gateway is ever needed alongside AppSync.
  enableEc2RestApi: false,
  enableEc2Postgres: false,

  // RDS: disabled — using MongoDB Atlas.
  enableDatabase: false,

  // Cognito — reuse the pre-existing User Pool (schema immutability prevents recreating)
  existingUserPoolId: 'ap-south-1_waAjEC9Nj',

  // AppSync
  enableWaf: true,

  // Storage
  s3UseKmsCmk: true, // SSE-KMS with Customer Managed Key in prod

  // Logs
  logRetentionDays: 90,

  // Budget
  budgetWarnAmountUsd: 350,
  budgetCriticalAmountUsd: 500,
};
