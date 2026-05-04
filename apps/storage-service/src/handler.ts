/**
 * Storage Service Lambda
 * Generates presigned S3 URLs for client-side upload/download.
 * Documents are stored under: <tenantId>/<folder>/<timestamp>-<filename>
 */
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';

const s3 = new S3Client({});

function parseEvent(event: Record<string, unknown>) {
  if (event.info) {
    const info = event.info as Record<string, string>;
    return { operation: info.fieldName, args: (event.arguments ?? {}) as Record<string, unknown> };
  }
  const method = event.httpMethod as string;
  const path   = event.path as string;
  const body   = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {}) as Record<string, unknown>;
  const params  = (event.pathParameters ?? {}) as Record<string, string>;
  return { operation: `${method}:${path}`, args: { ...body, ...params } };
}

export const handler = async (event: Record<string, unknown>) => {
  try {
    const ctx = await resolveContext(event);
    const { operation, args } = parseEvent(event);
    const tenantId = getTenantId(ctx);

    const bucket = process.env.DOCUMENTS_BUCKET;
    if (!bucket) throw new AppError('INTERNAL', 'DOCUMENTS_BUCKET not configured');

    switch (operation) {

      // ── Upload URL ────────────────────────────────────────────────────────
      case 'generateUploadUrl':
      case 'POST:/api/storage/upload-url': {
        const { fileName, contentType, folder = 'uploads' } = args as {
          fileName: string;
          contentType: string;
          folder?: string;
        };
        if (!fileName)    throw new AppError('BAD_REQUEST', 'fileName is required');
        if (!contentType) throw new AppError('BAD_REQUEST', 'contentType is required');

        // Sanitise: strip path traversal
        const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key      = `${tenantId}/${folder}/${Date.now()}-${safeName}`;

        const url = await getSignedUrl(
          s3,
          new PutObjectCommand({
            Bucket:      bucket,
            Key:         key,
            ContentType: contentType,
          }),
          { expiresIn: 300 },   // 5 minutes to complete the upload
        );

        return { uploadUrl: url, key, expiresIn: 300 };
      }

      // ── Download URL ──────────────────────────────────────────────────────
      case 'generateDownloadUrl':
      case 'GET:/api/storage/download-url': {
        const { key } = args as { key: string };
        if (!key) throw new AppError('BAD_REQUEST', 'key is required');

        // Enforce tenant isolation — key must start with tenantId/
        if (!key.startsWith(`${tenantId}/`)) {
          throw new AppError('FORBIDDEN', 'Access denied to this document');
        }

        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: bucket, Key: key }),
          { expiresIn: 900 },   // 15 minutes to view the file
        );

        return { downloadUrl: url, key, expiresIn: 900 };
      }

      default:
        throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
    }
  } catch (err) {
    if (isAppError(err)) {
      return { __error: true, code: err.code, message: err.message, statusCode: err.statusCode };
    }
    console.error('[storage-service] unhandled error:', err);
    return { __error: true, code: 'INTERNAL', message: 'Internal server error', statusCode: 500 };
  }
};
