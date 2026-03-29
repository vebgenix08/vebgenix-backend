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
  // Keep false until Razorpay/Fast2SMS outbound calls go live.
  // When enabling: add 1 NAT Gateway (cost-optimized, single AZ, acceptable HA tradeoff for MVP).
  enableNat: false,
  enableEc2RestApi: true,
  enableEc2Postgres: true,

  // Database
  enableDatabase: false,
  dbInstanceClass: "t3.small",
  dbMultiAz: true,
  dbBackupRetentionDays: 30,
  dbDeletionProtection: true,
  dbStorageEncrypted: true,
  restApiInstanceClass: "t4g.small",
  restApiVolumeSizeGb: 20,
  ec2DbInstanceClass: "t4g.medium",
  ec2DbVolumeSizeGb: 100,

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
