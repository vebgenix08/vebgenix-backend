import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3 = new S3Client({});

export function resolvePublicBaseUrl() {
  const raw = String(process.env.APP_BASE_URL ?? '').trim();
  if (!raw) return 'https://app.vebgenix.com';
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.')
    ) {
      return 'https://app.vebgenix.com';
    }
    return parsed.origin.replace(/\/$/, '');
  } catch {
    return 'https://app.vebgenix.com';
  }
}

export function parseEvent(event: Record<string, unknown>) {
  if (event.info) {
    const info = event.info as Record<string, string>;
    return { operation: info.fieldName, args: (event.arguments ?? {}) as Record<string, unknown> };
  }
  const method = event.httpMethod as string;
  const path = event.path as string;
  const body = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {}) as Record<string, unknown>;
  const params = (event.pathParameters ?? {}) as Record<string, string>;
  const qs = (event.queryStringParameters ?? {}) as Record<string, string>;
  return { operation: `${method}:${path}`, args: { ...body, ...params, ...qs } };
}

export function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export async function buildSignedReceiptUrl(fileKey?: string | null): Promise<string | null> {
  const bucket = process.env.DOCUMENTS_BUCKET;
  if (!bucket || !fileKey) return null;
  return getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: fileKey }),
    { expiresIn: 900 },
  );
}
