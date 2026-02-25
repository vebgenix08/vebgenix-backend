import { EnvConfig } from './types';

export const devConfig: EnvConfig = {
  stage: 'dev',
  region: 'ap-south-1',
  account: '998105438053',

  // Tagging
  tags: {
    project: 'vebgenix',
    stage: 'dev',
    owner: 'platform-team',
  },

  // Network
  enableNat: false, // No NAT in dev — use VPC Endpoints + stubs for external APIs

  // Database
  dbInstanceClass: 'db.t4g.micro',
  dbMultiAz: false,
  dbBackupRetentionDays: 1,
  dbDeletionProtection: false,
  dbStorageEncrypted: true,

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
