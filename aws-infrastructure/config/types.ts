export interface EnvConfig {
  stage: 'dev' | 'prod';
  region: string;
  account: string;

  tags: Record<string, string>;

  // Network
  enableNat: boolean;

  // Database
  dbInstanceClass: string;
  dbMultiAz: boolean;
  dbBackupRetentionDays: number;
  dbDeletionProtection: boolean;
  dbStorageEncrypted: boolean;

  // AppSync
  enableWaf: boolean;

  // Storage
  s3UseKmsCmk: boolean;

  // Logs
  logRetentionDays: number;

  // Budget
  budgetWarnAmountUsd: number;
  budgetCriticalAmountUsd: number;
}
