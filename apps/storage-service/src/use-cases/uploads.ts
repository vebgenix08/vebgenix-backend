import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { AppError } from '@vebgenix/errors';
import { buildKey } from '../storage-utils';

const s3 = new S3Client({});

export async function handleUploads(
  operation: string,
  args: Record<string, unknown>,
  tenantId: string,
): Promise<unknown> {
  if (operation !== 'generateUploadUrl' && operation !== 'POST:/api/storage/upload-url') return undefined;
  const bucket = process.env.DOCUMENTS_BUCKET;
  if (!bucket) throw new AppError('INTERNAL', 'DOCUMENTS_BUCKET not configured');
  const argsTyped = args as { fileName?: string; filename?: string; contentType: string; folder?: string };
  const fileName = argsTyped.filename ?? argsTyped.fileName;
  const { contentType, folder = 'uploads' } = argsTyped;
  if (!fileName) throw new AppError('BAD_REQUEST', 'fileName is required');
  if (!contentType) throw new AppError('BAD_REQUEST', 'contentType is required');
  const key = buildKey(tenantId, folder, fileName);
  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: 300 },
  );
  return { uploadUrl: url, key, expiresIn: 300 };
}
