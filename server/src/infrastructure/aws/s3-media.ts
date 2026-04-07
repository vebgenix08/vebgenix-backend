import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const region =
  process.env.AWS_REGION ||
  process.env.AWS_DEFAULT_REGION ||
  "ap-south-1";

const bucket =
  process.env.S3_BUCKET_NAME ||
  process.env.UPLOADS_BUCKET_NAME ||
  process.env.MEDIA_BUCKET_NAME ||
  process.env.DOCUMENTS_BUCKET ||
  "";

const publicBaseUrl =
  process.env.S3_PUBLIC_BASE_URL ||
  (bucket ? `https://${bucket}.s3.${region}.amazonaws.com` : "");

const s3 = new S3Client({ region });

const uploadRoot = process.env.S3_UPLOAD_ROOT || "tenants";
const campusSegment = process.env.S3_CAMPUS_SEGMENT || "campuses";
const userSegment = process.env.S3_USER_SEGMENT || "users";
const tenantCampusFallback = process.env.S3_TENANT_CAMPUS_FALLBACK || "tenant";
const profileScopeName = process.env.S3_PROFILE_SCOPE_NAME || "profile";
const brandingScopeName = process.env.S3_BRANDING_SCOPE_NAME || "branding";
const admissionScopeName = process.env.S3_ADMISSION_SCOPE_NAME || "admissions";
const applicationScopeName =
  process.env.S3_APPLICATION_SCOPE_NAME || "applications";
const enquiryScopeName = process.env.S3_ENQUIRY_SCOPE_NAME || "enquiries";
const documentScopeName = process.env.S3_DOCUMENT_SCOPE_NAME || "documents";
const resultsScopeName = process.env.S3_RESULTS_SCOPE_NAME || "results";
const publishedResultsScopeName =
  process.env.S3_PUBLISHED_RESULTS_SCOPE_NAME || "published";
const avatarUploadName = process.env.S3_AVATAR_UPLOAD_NAME || "avatar";
const logoUploadName = process.env.S3_LOGO_UPLOAD_NAME || "logo";
const signedUrlTtlSeconds = Number(
  process.env.S3_SIGNED_URL_TTL_SECONDS || 3600,
);

function requireBucket() {
  if (!bucket) {
    const error: any = new Error("S3 bucket is not configured");
    error.code = "S3_BUCKET_MISSING";
    throw error;
  }
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function sanitizePathSegment(segment: string) {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function buildMediaKey(input: {
  tenantId: string;
  campusId?: string | null;
  userId: string;
  scope: "profile" | "branding";
  kind: "avatar" | "logo";
  filename: string;
}) {
  const timestamp = Date.now();
  const safeName = sanitizeFilename(input.filename);
  const scopeName =
    input.scope === "profile" ? profileScopeName : brandingScopeName;
  const kindName = input.kind === "avatar" ? avatarUploadName : logoUploadName;
  return `${uploadRoot}/${input.tenantId}/${campusSegment}/${input.campusId || tenantCampusFallback}/${userSegment}/${input.userId}/${scopeName}/${kindName}-${timestamp}-${safeName}`;
}

export function buildAdmissionDocumentKey(input: {
  tenantId: string;
  campusId?: string | null;
  userId: string;
  stage: "enquiry" | "application";
  fieldKey: string;
  filename: string;
}) {
  const timestamp = Date.now();
  const safeName = sanitizeFilename(input.filename);
  const safeFieldKey = sanitizePathSegment(input.fieldKey);
  const stageName =
    input.stage === "enquiry" ? enquiryScopeName : applicationScopeName;

  return `${uploadRoot}/${input.tenantId}/${campusSegment}/${input.campusId || tenantCampusFallback}/${userSegment}/${input.userId}/${admissionScopeName}/${stageName}/${documentScopeName}/${safeFieldKey}-${timestamp}-${safeName}`;
}

export function buildPublishedResultKey(input: {
  tenantId: string;
  campusId?: string | null;
  userId: string;
  academicYear: string;
  className: string;
  sectionName: string;
  examName: string;
  filename: string;
}) {
  const timestamp = Date.now();
  const safeName = sanitizeFilename(input.filename);
  const safeAcademicYear = sanitizePathSegment(input.academicYear);
  const safeClass = sanitizePathSegment(input.className);
  const safeSection = sanitizePathSegment(input.sectionName);
  const safeExam = sanitizePathSegment(input.examName);

  return `${uploadRoot}/${input.tenantId}/${campusSegment}/${input.campusId || tenantCampusFallback}/${userSegment}/${input.userId}/${resultsScopeName}/${publishedResultsScopeName}/${safeAcademicYear}/${safeClass}/${safeSection}/${safeExam}-${timestamp}-${safeName}`;
}

export function getStoredMediaUrl(key: string) {
  requireBucket();
  return `${publicBaseUrl}/${key}`;
}

export async function getSignedMediaUrl(key?: string | null) {
  if (!key) return null;
  requireBucket();
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: signedUrlTtlSeconds },
  );
}

export async function resolveMediaUrl(
  key?: string | null,
  fallbackUrl?: string | null,
) {
  if (key) {
    return getSignedMediaUrl(key);
  }
  return fallbackUrl || null;
}

export async function uploadMediaObject(input: {
  key: string;
  body: Buffer;
  contentType: string;
}) {
  requireBucket();
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
    }),
  );

  return {
    key: input.key,
    storageUrl: getStoredMediaUrl(input.key),
    signedUrl: await getSignedMediaUrl(input.key),
  };
}

export async function deleteMediaObject(key?: string | null) {
  if (!key || !bucket) return;
  await s3.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
  );
}
