export interface EnvConfig {
  stage: "dev" | "prod";
  region: string;
  account: string;

  tags: Record<string, string>;

  // Network
  enableNat: boolean;
  enableEc2RestApi: boolean;
  enableEc2Postgres: boolean;

  // Database
  enableDatabase: boolean;
  dbInstanceClass: string;
  dbMultiAz: boolean;
  dbBackupRetentionDays: number;
  dbDeletionProtection: boolean;
  dbStorageEncrypted: boolean;
  restApiInstanceClass: string;
  restApiVolumeSizeGb: number;
  ec2DbInstanceClass: string;
  ec2DbVolumeSizeGb: number;

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
