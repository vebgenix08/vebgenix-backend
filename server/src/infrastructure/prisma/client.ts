import { PrismaClient, Prisma } from '@prisma/client';

export type TenantDbClient = Prisma.TransactionClient;
export type TenantTxOptions = {
  maxWait?: number;
  timeout?: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
};

let prisma: PrismaClient | undefined;

async function getDatabaseUrl(): Promise<string> {
  if (process.env.DATABASE_URL && !process.env.DB_SECRET_ARN) {
    return process.env.DATABASE_URL;
  }

  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable is missing');
  }

  try {
    const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
    
    const client = new SecretsManagerClient({});
    const response = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    
    if (!response.SecretString) {
      throw new Error('SecretString is empty');
    }
    
    const secret = JSON.parse(response.SecretString);
    const user = secret.username;
    const password = secret.password;
    const host = process.env.DB_PROXY_ENDPOINT || secret.host;
    const db = process.env.DB_NAME || secret.dbname || 'vebgenix';
    
    return `postgresql://${user}:${encodeURIComponent(password)}@${host}:5432/${db}?sslmode=require`;
  } catch (err) {
    console.error('Failed to fetch DB credentials from Secrets Manager:', err);
    throw err;
  }
}

export async function getPrisma(): Promise<PrismaClient> {
  if (prisma) return prisma;

  const url = await getDatabaseUrl();

  prisma = new PrismaClient({
    datasources: { db: { url } },
    log:
      process.env.PRISMA_DEBUG_QUERIES === 'true'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

  return prisma;
}

export async function withTenantTx<T>(
  client: PrismaClient,
  tenantId: string,
  userId: string,
  fn: (tx: TenantDbClient) => Promise<T>,
  options?: TenantTxOptions
): Promise<T> {
  if (!tenantId || !userId) {
    throw new Error('Tenancy Error: tenantId and userId are required for scoped operations');
  }

  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return await fn(tx);
  }, options);
}

export async function runWithTenantContext<T>(
  tenantId: string,
  userId: string,
  fn: (tx: TenantDbClient) => Promise<T>,
  options: TenantTxOptions = { timeout: 10000 },
): Promise<T> {
  const client = await getPrisma();
  return withTenantTx(client, tenantId, userId, fn, options);
}

const defaultPrisma = new PrismaClient({
    log: ['warn', 'error'],
});
export default defaultPrisma;
