export type ResolveTenantId = () => string;

export type RoleCatalogEntry = {
  id: string;
  roleName: string;
  permissions: string[];
  description: string;
};

export const ROLE_CATALOG: RoleCatalogEntry[] = [
  { id: 'TENANT_ADMIN', roleName: 'Tenant Admin', permissions: ['*'], description: 'Full access to all tenant features' },
  { id: 'PRINCIPAL', roleName: 'Principal', permissions: ['academics.*', 'admissions.*', 'finance.read'], description: 'School principal' },
  { id: 'TEACHER', roleName: 'Teacher', permissions: ['academics.classes.read', 'academics.attendance.mark', 'academics.exams.update'], description: 'Class teacher / subject teacher' },
  { id: 'ACCOUNTANT', roleName: 'Accountant', permissions: ['finance.*'], description: 'Finance and fee management' },
  { id: 'ADMISSIONS_OFFICER', roleName: 'Admissions Officer', permissions: ['admissions.*'], description: 'Manages enquiries and applications' },
  { id: 'RECEPTIONIST', roleName: 'Receptionist', permissions: ['admissions.enquiry.*', 'admissions.application.read'], description: 'Front-desk reception' },
  { id: 'STAFF', roleName: 'Staff', permissions: ['academics.read'], description: 'General staff with read-only access' },
];

const ROLE_LABELS = Object.fromEntries(
  ROLE_CATALOG.map((entry) => [entry.id, entry.roleName]),
) as Record<string, string>;

function normalizeRoleKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function canonicalRoleName(value: string) {
  const normalized = normalizeRoleKey(value);
  return ROLE_LABELS[normalized] ?? value.trim();
}

export function canonicalRolePermissions(value: string) {
  const normalized = normalizeRoleKey(value);
  return ROLE_CATALOG.find((entry) => entry.id === normalized)?.permissions ?? [];
}

export function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export function toGqlProfile(profile: unknown, fallback: { id?: string; email?: string } = {}): Record<string, unknown> {
  if (!profile) return { id: fallback.id ?? '', email: fallback.email ?? '' };
  const doc = (profile as { toObject?: () => Record<string, unknown> }).toObject?.()
    ?? (profile as Record<string, unknown>);
  const { _id, ...rest } = doc;
  const roleAssignments = Array.isArray(doc.roles)
    ? (doc.roles as Array<Record<string, unknown>>).map((role) => ({
        roleId:      role.roleId?.toString?.() ?? role.roleId ?? null,
        roleName:    String(role.roleName ?? role.role ?? ''),
        permissions: Array.isArray(role.permissions) ? role.permissions : [],
      })).filter((role) => role.roleName)
    : [];
  return {
    ...rest,
    id:    String(doc.id ?? _id ?? fallback.id ?? ''),
    email: String(doc.email ?? fallback.email ?? ''),
    roles: roleAssignments.map((role) => role.roleName),
    roleAssignments,
  };
}

export function getAvatarUploadKey(tenantId: string | undefined, userId: string) {
  const scope = tenantId ?? 'platform';
  return `${scope}/avatars/${userId}-${Date.now()}.jpg`;
}

export function getTenantLogoUploadKey(tenantId: string) {
  return `${tenantId}/logos/tenant-logo-${Date.now()}.png`;
}

export function buildRoleAssignments(roleIds?: string[]) {
  return (roleIds ?? [])
    .map((role) => {
      const raw = String(role ?? '').trim();
      if (!raw) return null;
      const roleName = canonicalRoleName(raw);
      const permissions = canonicalRolePermissions(raw);
      return {
        roleId: null as never,
        roleName,
        permissions,
      };
    })
    .filter((role): role is { roleId: never; roleName: string; permissions: string[] } => role !== null);
}
