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
  enableEc2RestApi: true,
  enableEc2Postgres: true,
  restApiSubnetId: "subnet-0981f0e5c706bd982",
  restApiSubnetAz: "ap-south-1b",
  restApiSubnetRouteTableId: "rtb-0f1b4b91acd13b4d4",
  ec2DbSubnetId: "subnet-0981f0e5c706bd982",
  ec2DbSubnetAz: "ap-south-1b",
  ec2DbSubnetRouteTableId: "rtb-0f1b4b91acd13b4d4",

  // Database
  enableDatabase: false,
  dbInstanceClass: "t4g.micro",
  dbMultiAz: false,
  dbBackupRetentionDays: 1,
  dbDeletionProtection: false,
  dbStorageEncrypted: true,
  restApiInstanceClass: "t4g.small",
  restApiVolumeSizeGb: 20,
  ec2DbInstanceClass: "t4g.small",
  ec2DbVolumeSizeGb: 30,

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
