import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | undefined;

async function getDatabaseUrl(): Promise<string> {
  // Local development override
  if (process.env.DATABASE_URL && !process.env.DB_SECRET_ARN) {
    return process.env.DATABASE_URL;
  }

  // AWS Environment: Fetch credentials from Secrets Manager
  const secretArn = process.env.DB_SECRET_ARN;
  if (!secretArn) {
    throw new Error('DB_SECRET_ARN environment variable is missing');
  }

  try {
    // Dynamic require to avoid build-time dependency check failure locally if SDK not installed
    // Lambda Node.js runtime includes AWS SDK v3
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
    
    // RDS Proxy requires sslmode=require
    return `postgresql://${user}:${encodeURIComponent(password)}@${host}:5432/${db}?sslmode=require`;
  } catch (err) {
    console.error('Failed to fetch DB credentials from Secrets Manager:', err);
    throw err;
  }
}

/**
 * Returns a singleton PrismaClient instance.
 * Initializes connection string asynchronously from Secrets Manager if needed.
 */
export async function getPrisma(): Promise<PrismaClient> {
  if (prisma) return prisma;

  const url = await getDatabaseUrl();
  
  // Sanitize URL for logging
  const sanitizedUrl = url.replace(/:([^:@]+)@/, ':****@');
  console.log(`Initializing PrismaClient with URL: ${sanitizedUrl}`);

  prisma = new PrismaClient({
    datasources: { db: { url } },
    log: process.env.NODE_ENV === 'production' ? ['warn', 'error'] : ['query', 'warn', 'error'],
  });

  return prisma;
}

// Default export is DEPRECATED and should be removed once all consumers migrate to getPrisma()
// It only works if DATABASE_URL is present in environment variables at startup
const defaultPrisma = new PrismaClient({
    log: ['warn', 'error'],
});
export default defaultPrisma;
