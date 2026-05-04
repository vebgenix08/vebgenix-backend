export interface EnvConfig {
  stage: 'dev' | 'prod';
  region: string;
  account: string;

  tags: Record<string, string>;

  // Network
  enableNat: boolean;
  enableEc2RestApi: boolean;

  // Cognito — filled from CDK context / SSM after first deploy
  cognitoClientId?: string;

  // App
  appBaseUrl?: string;   // e.g. https://app.vebgenix.com

  // AppSync
  enableWaf: boolean;

  // Storage
  s3UseKmsCmk: boolean;

  // Logs
  logRetentionDays: number;

  // Budget
  budgetWarnAmountUsd: number;
  budgetCriticalAmountUsd: number;

  // EC2 REST API (optional)
  restApiSubnetId?: string;
  restApiSubnetAz?: string;
  restApiSubnetRouteTableId?: string;
  restApiInstanceClass?: string;
  restApiVolumeSizeGb?: number;

  // EC2 Postgres DB (optional)
  enableEc2Postgres?: boolean;
  ec2DbSubnetId?: string;
  ec2DbSubnetAz?: string;
  ec2DbSubnetRouteTableId?: string;
  ec2DbInstanceClass?: string;
  ec2DbVolumeSizeGb?: number;

  // RDS Database (optional — project uses MongoDB Atlas; keep for backward compat)
  enableDatabase?: boolean;
  dbInstanceClass?: string;
  dbMultiAz?: boolean;
  dbBackupRetentionDays?: number;
  dbDeletionProtection?: boolean;
  dbStorageEncrypted?: boolean;
}
