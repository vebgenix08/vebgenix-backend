import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '@vebgenix/errors';
import { ensureTenantPrefix } from '../storage-utils';

const s3 = new S3Client({});

export async function handleDownloads(
  operation: string,
  args: Record<string, unknown>,
  tenantId: string,
): Promise<unknown> {
  if (operation !== 'generateDownloadUrl' && operation !== 'GET:/api/storage/download-url') return undefined;
  const bucket = process.env.DOCUMENTS_BUCKET;
  if (!bucket) throw new AppError('INTERNAL', 'DOCUMENTS_BUCKET not configured');
  const { key } = args as { key: string };
  if (!key) throw new AppError('BAD_REQUEST', 'key is required');
  try {
    ensureTenantPrefix(key, tenantId);
  } catch {
    throw new AppError('FORBIDDEN', 'Access denied to this document');
  }
  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: 900 },
  );
  return { downloadUrl: url, key, expiresIn: 900 };
}
