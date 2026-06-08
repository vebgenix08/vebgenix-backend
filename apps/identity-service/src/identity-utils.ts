export type ResolveTenantId = () => string;

const ROLE_LABELS: Record<string, string> = {
  TENANT_ADMIN: 'Tenant Admin',
  PRINCIPAL: 'Principal',
  TEACHER: 'Teacher',
  ACCOUNTANT: 'Accountant',
  ADMISSIONS_OFFICER: 'Admissions Officer',
  RECEPTIONIST: 'Receptionist',
  STAFF: 'Staff',
};

function normalizeRoleKey(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function canonicalRoleName(value: string) {
  const normalized = normalizeRoleKey(value);
  return ROLE_LABELS[normalized] ?? value.trim();
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
      return {
        roleId: null as never,
        roleName,
        permissions: [] as string[],
      };
    })
    .filter((role): role is { roleId: never; roleName: string; permissions: string[] } => role !== null);
}
