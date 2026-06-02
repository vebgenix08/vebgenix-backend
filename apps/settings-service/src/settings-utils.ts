import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';

export type FeatureFlags = Record<string, boolean>;
export type PlainDoc = Record<string, unknown>;

export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const [domainName, ...tldParts] = (domain ?? '').split('.');
  return `${local[0] ?? ''}***@${domainName?.[0] ?? ''}*****.${tldParts.join('.')}`;
}

export function generateOtp(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeSubdomain(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

const VALID_CAMPUS_TYPES = new Set(['SCHOOL', 'PU', 'DEGREE', 'POLYTECHNIC', 'OTHER']);

export function normalizeCampusCode(value: unknown): string {
  const code = String(value ?? 'MAIN')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return code || 'MAIN';
}

export function normalizeCampusType(value: unknown): string {
  const type = String(value ?? 'SCHOOL').trim().toUpperCase();
  return VALID_CAMPUS_TYPES.has(type) ? type : 'OTHER';
}

export function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

export function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

export function toFeatureItems(features: FeatureFlags | string[] | undefined) {
  if (Array.isArray(features)) {
    return features.map(key => ({ key, enabled: true }));
  }
  if (!features) return [];
  return Object.entries(features).map(([key, enabled]) => ({ key, enabled: Boolean(enabled) }));
}

export function featureFlagsFromList(features: unknown): FeatureFlags {
  if (!Array.isArray(features)) return {};
  return features.reduce<FeatureFlags>((acc, key) => {
    const featureKey = String(key ?? '').trim();
    if (featureKey) acc[featureKey] = true;
    return acc;
  }, {});
}

export function toTenantGql(doc: PlainDoc | null, features?: FeatureFlags | string[]) {
  if (!doc) return null;
  const { _id, ...rest } = doc;
  const slug = rest.slug as string | undefined;
  return {
    ...rest,
    id: rest.tenantId ?? String(_id),
    fullDomain: rest.fullDomain ?? (slug ? `${slug}.vebgenix.com` : rest.domain),
    isActive: rest.isActive ?? true,
    onboardingComplete: rest.onboardingComplete ?? false,
    features: toFeatureItems(features ?? (rest.features as FeatureFlags | undefined)),
    createdAt: toDateString(rest.createdAt),
  };
}

export function toCampusGql(doc: PlainDoc | null) {
  if (!doc) return null;
  return {
    ...doc,
    id: String(doc._id ?? doc.id),
    isActive: doc.isActive ?? true,
  };
}

export function toAdminGql(
  profile: PlainDoc | null,
  fallbackPermissions: string[],
  fallbackRoleName = 'TENANT_ADMIN',
) {
  if (!profile) return null;
  const roles = Array.isArray(profile.roles) ? profile.roles as PlainDoc[] : [];
  const tenantAdminRole = roles.find(role => role.roleName === fallbackRoleName) ?? roles[0];
  return {
    id: String(profile._id ?? profile.id),
    email: profile.email,
    fullName: profile.fullName,
    roleName: tenantAdminRole?.roleName ?? fallbackRoleName,
    permissions: Array.isArray(tenantAdminRole?.permissions)
      ? tenantAdminRole.permissions
      : fallbackPermissions,
  };
}

export function toSimpleGql(doc: PlainDoc | null) {
  if (!doc) return null;
  const { _id, __v, ...rest } = doc;
  return { ...rest, id: String(_id) };
}

export function toTemplateGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as PlainDoc;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export function isMongoDuplicateError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && (err as { code?: number }).code === 11000;
}

export function toProvisioningError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isMongoDuplicateError(err)) {
    return new AppError('CONFLICT', 'Tenant setup already exists for one of the provided values');
  }
  const name = typeof err === 'object' && err !== null && 'name' in err
    ? String((err as { name?: unknown }).name)
    : '';
  if (name === 'UsernameExistsException') {
    return new AppError('CONFLICT', 'Primary admin email already exists in Cognito');
  }
  console.error('[settings/provisionTenant] provisioning failed:', err);
  return new AppError('BAD_REQUEST', 'Tenant provisioning failed');
}

export function objectId(value?: string) {
  return value && Types.ObjectId.isValid(value) ? new Types.ObjectId(value) : undefined;
}

export function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function parseDashboardRange(input?: { range?: { preset?: 'TODAY' | 'LAST_7_DAYS' | 'LAST_30_DAYS' | 'CUSTOM'; fromDate?: string; toDate?: string; } }) {
  const today = startOfDay(new Date());
  const preset = input?.range?.preset ?? 'LAST_30_DAYS';

  if (preset === 'CUSTOM' && input?.range?.fromDate && input?.range?.toDate) {
    const from = startOfDay(new Date(input.range.fromDate));
    const to = addDays(startOfDay(new Date(input.range.toDate)), 1);
    return { from, to };
  }

  if (preset === 'TODAY') return { from: today, to: addDays(today, 1) };
  if (preset === 'LAST_7_DAYS') return { from: addDays(today, -6), to: addDays(today, 1) };
  return { from: addDays(today, -29), to: addDays(today, 1) };
}

export function campusFilter(campusId?: string) {
  const id = objectId(campusId);
  return id ? { campusId: id } : {};
}

export function academicYearFilter(academicYearId?: string) {
  const id = objectId(academicYearId);
  return id ? { academicYearId: id } : {};
}

export function countMap(rows: Array<{ _id: string | null; count: number }>) {
  return rows.map((row) => ({
    status: row._id ?? 'UNKNOWN',
    count: row.count,
  }));
}

export function dateCountMap(rows: Array<{ _id: string; count: number }>) {
  return rows.map((row) => ({
    date: row._id,
    count: row.count,
  }));
}

export function dateAmountMap(rows: Array<{ _id: string; amount: number }>) {
  return rows.map((row) => ({
    date: row._id,
    amount: row.amount,
  }));
}

export function toPlatformAuditListGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as PlainDoc;
  return {
    id: String(plain._id),
    at: plain.createdAt ? String(plain.createdAt) : new Date().toISOString(),
    actorId: String(plain.actorId ?? ''),
    action: plain.action ?? 'UNKNOWN',
    targetType: plain.entityType ?? 'TENANT',
    targetId: plain.entityId ?? null,
    metaSummary: plain.metaSummary ?? (plain.entityName ? String(plain.entityName) : null),
  };
}

export function toPlatformAuditDetailGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as PlainDoc;
  return {
    id: String(plain._id),
    at: plain.createdAt ? String(plain.createdAt) : new Date().toISOString(),
    actorId: String(plain.actorId ?? ''),
    action: plain.action ?? 'UNKNOWN',
    targetType: plain.entityType ?? 'TENANT',
    targetId: plain.entityId ?? null,
    meta: plain.meta ? JSON.stringify(plain.meta) : null,
  };
}

export function toAuditLogGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as PlainDoc;
  const before = plain.before as Record<string, unknown> | undefined;
  const after = plain.after as Record<string, unknown> | undefined;
  const meta = JSON.stringify({
    ...(before ? { before } : {}),
    ...(after ? { after } : {}),
    ...(plain.userAgent ? { userAgent: plain.userAgent } : {}),
  });

  return {
    id: String(plain._id ?? plain.id),
    at: plain.createdAt ?? new Date().toISOString(),
    actorId: plain.userId ? String(plain.userId) : '',
    actorEmail: plain.userEmail ?? null,
    action: plain.action,
    category: plain.entityType ?? null,
    severity: 'INFO',
    targetType: plain.entityType ?? 'Unknown',
    targetId: plain.entityId ?? null,
    targetName: plain.entityName ?? null,
    meta,
    ipAddress: plain.ipAddress ?? null,
  };
}
