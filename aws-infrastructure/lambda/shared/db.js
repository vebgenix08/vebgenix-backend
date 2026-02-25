'use strict';

const { PrismaClient } = require('@prisma/client');

/**
 * RDS Proxy-aware Prisma singleton for Lambda.
 *
 * Lambda execution environment reuses the same process across warm invocations.
 * We keep a single PrismaClient instance to maximise RDS Proxy connection reuse.
 *
 * Connection string is built from:
 *   - DB_PROXY_ENDPOINT: RDS Proxy endpoint (from env)
 *   - DB_SECRET_ARN: Secret ARN — password fetched once at cold start via SDK
 *
 * For local development, DATABASE_URL env var overrides everything.
 */

let _prisma = null;

async function getDbCredentials() {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');
  const sm = new SecretsManagerClient({});
  const { SecretString } = await sm.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN })
  );
  const { username, password, dbname } = JSON.parse(SecretString);
  const host = process.env.DB_PROXY_ENDPOINT;
  const db = dbname ?? process.env.DB_NAME ?? 'vebgenix';
  // Use SSL mode=require for RDS Proxy
  return `postgresql://${username}:${encodeURIComponent(password)}@${host}:5432/${db}?sslmode=require`;
}

async function getPrisma() {
  if (_prisma) return _prisma;

  const url = await getDbCredentials();
  _prisma = new PrismaClient({
    datasources: { db: { url } },
    log: process.env.STAGE === 'dev'
      ? ['query', 'warn', 'error']
      : ['warn', 'error'],
  });

  await _prisma.$connect();
  console.log('PrismaClient connected via RDS Proxy');
  return _prisma;
}

module.exports = { getPrisma };
