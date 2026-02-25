'use strict';

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');
const { randomUUID } = require('crypto');

const s3 = new S3Client({});
const BUCKET = process.env.DOCUMENTS_BUCKET;
const EXPIRES_IN = 300; // 5 minutes
const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_CONTENT_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

/**
 * StorageLambda — AppSync resolver for Storage domain
 *
 * Generates S3 presigned POST URLs for secure client-side uploads.
 * Key format: tenant/{tenantId}/{module}/{entityId}/{uuid}-{fileName}
 */
exports.handler = async (event) => {
  const { fieldName, arguments: args, identity } = event;

  const tenantId = identity?.claims?.['custom:tenant_id'];
  const userId   = identity?.claims?.sub;

  switch (fieldName) {
    case 'generateUploadUrl': {
      const { entityType, entityId, fileName, contentType, module } = args.input;

      // Validate content type allowlist
      if (!ALLOWED_CONTENT_TYPES.includes(contentType)) {
        throw new Error(`Content type "${contentType}" is not allowed`);
      }

      // Build S3 key with tenant scoping
      const uuid = randomUUID();
      const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
      const key = `tenant/${tenantId}/${module.toLowerCase()}/${entityId}/${uuid}-${safeFileName}`;

      // Generate presigned POST (supports size limits + content type enforcement)
      const { url, fields } = await createPresignedPost(s3, {
        Bucket: BUCKET,
        Key: key,
        Conditions: [
          ['content-length-range', 1, MAX_SIZE_BYTES],
          ['eq', '$Content-Type', contentType],
        ],
        Fields: { 'Content-Type': contentType },
        Expires: EXPIRES_IN,
      });

      return {
        url,
        fields: JSON.stringify(fields),
        key,
        expiresIn: EXPIRES_IN,
      };
    }

    default:
      throw new Error(`StorageLambda: unknown field "${fieldName}"`);
  }
};
