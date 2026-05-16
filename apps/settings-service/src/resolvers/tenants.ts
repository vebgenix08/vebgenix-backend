import {
  AuthUser,
  Campus,
  Profile,
  Tenant,
  TenantFeature,
  generateTenantId,
} from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import mongoose, { Types } from 'mongoose';

type FeatureFlags = Record<string, boolean>;
type PlainDoc = Record<string, unknown>;

type ProvisionCampusInput = {
  name?: string;
  code?: string;
  type?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
};

type ProvisionPrimaryAdminInput = {
  fullName?: string;
  email?: string;
  phone?: string;
};

const VALID_CAMPUS_TYPES = new Set(['SCHOOL', 'PU', 'DEGREE', 'POLYTECHNIC', 'OTHER']);

const TENANT_ADMIN_ROLE_NAME = 'TENANT_ADMIN';

const TENANT_ADMIN_PERMISSIONS = [
  'academics.allocations.create',
  'academics.allocations.delete',
  'academics.allocations.update',
  'academics.attendance.mark',
  'academics.classes.create',
  'academics.classes.delete',
  'academics.classes.update',
  'academics.enrollment.create',
  'academics.enrollment.read',
  'academics.enrollment.transfer',
  'academics.exams.delete',
  'academics.exams.read',
  'academics.exams.update',
  'academics.promotion.create',
  'academics.promotion.read',
  'academics.registration.freeze',
  'academics.registration.generate',
  'academics.registration.read',
  'academics.results.create',
  'academics.results.delete',
  'academics.results.publish',
  'academics.results.read',
  'academics.results.update',
  'academics.rollno.freeze',
  'academics.rollno.generate',
  'academics.rollno.read',
  'academics.sections.create',
  'academics.sections.delete',
  'academics.sections.update',
  'academics.students.assign',
  'academics.subjects.create',
  'academics.subjects.delete',
  'academics.subjects.update',
  'academics.timetable.manage',
  'academics.timetable.read',
  'admin.cleanup.read',
  'admin.cleanup.write',
  'admissions.application.approve',
  'admissions.application.create',
  'admissions.application.read',
  'admissions.application.review',
  'admissions.application.update',
  'admissions.enquiry.create',
  'admissions.enquiry.delete',
  'admissions.enquiry.read',
  'admissions.enquiry.update',
  'comms.announcements.create',
  'comms.announcements.delete',
  'comms.announcements.read',
  'comms.announcements.update',
  'comms.events.create',
  'comms.events.delete',
  'comms.events.read',
  'comms.events.update',
  'comms.leave.approve',
  'comms.leave.read',
  'finance.fee_assignment.create',
  'finance.fee_assignment.read',
  'finance.fee_category.create',
  'finance.fee_category.delete',
  'finance.fee_category.read',
  'finance.fee_category.update',
  'finance.fee_head.delete',
  'finance.fee_head.read',
  'finance.fee_head.update',
  'finance.fee_pattern.copy',
  'finance.fee_schedule.create',
  'finance.fee_schedule.delete',
  'finance.fee_schedule.read',
  'finance.fee_schedule.update',
  'finance.fee_structure.delete',
  'finance.fee_structure.read',
  'finance.fee_structure.update',
  'finance.installment_plan.create',
  'finance.installment_plan.delete',
  'finance.installment_plan.read',
  'finance.installment_plan.update',
  'finance.invoice.create',
  'finance.invoice.read',
  'finance.invoice.update',
  'finance.invoices.create',
  'finance.manage',
  'finance.payment.create',
  'finance.payment.read',
  'finance.payments.record',
  'finance.reports.read',
  'identity.roles.assign',
  'identity.staff.read',
  'identity.staff.update',
  'identity.users.delete',
  'identity.users.update',
  'settings.academic_year.create',
  'settings.academic_year.update',
  'settings.programs.create',
  'settings.programs.delete',
  'settings.programs.update',
  'settings.templates.create',
  'settings.templates.delete',
  'settings.templates.publish',
  'settings.templates.update',
  'staff.invite',
  'students.certificates.approve',
  'students.certificates.create',
  'students.enroll',
  'students.portal.manage',
  'students.status.update',
  'tenant.campuses.create',
  'tenant.campuses.delete',
  'tenant.campuses.update',
  'tenant.settings.update',
  'users.create',
  'users.delete',
  'users.update',
];

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  const [domainName, ...tldParts] = (domain ?? '').split('.');
  return `${local[0] ?? ''}***@${domainName?.[0] ?? ''}*****.${tldParts.join('.')}`;
}

function generateOtp(): string {
  return String(Math.floor(100_000 + Math.random() * 900_000));
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSubdomain(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function normalizeCampusCode(value: unknown): string {
  const code = String(value ?? 'MAIN')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return code || 'MAIN';
}

function normalizeCampusType(value: unknown): string {
  const type = String(value ?? 'SCHOOL').trim().toUpperCase();
  return VALID_CAMPUS_TYPES.has(type) ? type : 'OTHER';
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function toFeatureItems(features: FeatureFlags | string[] | undefined) {
  if (Array.isArray(features)) {
    return features.map(key => ({ key, enabled: true }));
  }
  if (!features) return [];
  return Object.entries(features).map(([key, enabled]) => ({ key, enabled: Boolean(enabled) }));
}

function toDateString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function toGql(doc: PlainDoc | null, features?: FeatureFlags | string[]) {
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

function toCampusGql(doc: PlainDoc | null) {
  if (!doc) return null;
  return {
    ...doc,
    id: String(doc._id ?? doc.id),
    isActive: doc.isActive ?? true,
  };
}

function toAdminGql(profile: PlainDoc | null) {
  if (!profile) return null;
  const roles = Array.isArray(profile.roles) ? profile.roles as PlainDoc[] : [];
  const tenantAdminRole = roles.find(role => role.roleName === TENANT_ADMIN_ROLE_NAME) ?? roles[0];
  return {
    id: String(profile._id ?? profile.id),
    email: profile.email,
    fullName: profile.fullName,
    roleName: tenantAdminRole?.roleName ?? TENANT_ADMIN_ROLE_NAME,
    permissions: Array.isArray(tenantAdminRole?.permissions)
      ? tenantAdminRole.permissions
      : TENANT_ADMIN_PERMISSIONS,
  };
}

function featureFlagsFromList(features: unknown): FeatureFlags {
  if (!Array.isArray(features)) return {};
  return features.reduce<FeatureFlags>((acc, key) => {
    const featureKey = String(key ?? '').trim();
    if (featureKey) acc[featureKey] = true;
    return acc;
  }, {});
}

function isMongoDuplicateError(err: unknown): boolean {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && (err as { code?: number }).code === 11000;
}

function toProvisioningError(err: unknown): AppError {
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

async function assertTenantNameAvailable(name: string): Promise<void> {
  const existing = await Tenant.findOne({
    name: new RegExp(`^${escapeRegex(name)}$`, 'i'),
  }).lean();
  if (existing) throw new AppError('CONFLICT', `Tenant with name "${name}" already exists`);
}

async function assertTenantSlugAvailable(slug: string): Promise<void> {
  const existing = await Tenant.findOne({ slug }).lean();
  if (existing) throw new AppError('CONFLICT', `Tenant with subdomain "${slug}" already exists`);
}

async function assertAdminEmailAvailable(email: string): Promise<void> {
  const existing = await AuthUser.findOne({ email }).lean();
  if (existing) throw new AppError('CONFLICT', `User with email "${email}" already exists`);
}

async function deleteCognitoUser(username: string): Promise<void> {
  if (!process.env.COGNITO_USER_POOL_ID) return;
  const { AdminDeleteUserCommand, CognitoIdentityProviderClient } =
    await import('@aws-sdk/client-cognito-identity-provider');
  const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
  await cognito.send(new AdminDeleteUserCommand({
    UserPoolId: process.env.COGNITO_USER_POOL_ID,
    Username: username,
  }));
}

export async function resolveTenants(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listTenants':
    case 'GET:/api/platform/tenants': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const filter: Record<string, unknown> = {};
      if (args.isActive !== undefined) filter.isActive = args.isActive === 'true' || args.isActive === true;
      const docs = await Tenant.find(filter).sort({ name: 1 }).lean();
      const tenantIds = docs
        .map(doc => String((doc as PlainDoc).tenantId ?? ''))
        .filter(Boolean);
      const [featureDocs, campusCounts, primaryAdmins] = await Promise.all([
        tenantIds.length ? TenantFeature.find({ tenantId: { $in: tenantIds } }).lean() : [],
        tenantIds.length
          ? Campus.aggregate([
              { $match: { tenantId: { $in: tenantIds }, isActive: { $ne: false } } },
              { $group: { _id: '$tenantId', count: { $sum: 1 } } },
            ])
          : [],
        tenantIds.length
          ? Profile.find({ tenantId: { $in: tenantIds }, isPrimaryOwner: true, isActive: { $ne: false } })
              .select('tenantId email').lean()
          : [],
      ]);
      const featureMap = new Map(
        featureDocs.map(doc => [
          String((doc as PlainDoc).tenantId),
          (doc as PlainDoc).features as FeatureFlags | undefined,
        ]),
      );
      const campusCountMap = new Map(
        (campusCounts as { _id: string; count: number }[]).map(r => [r._id, r.count]),
      );
      const adminMap = new Map(
        (primaryAdmins as PlainDoc[]).map(p => [String(p.tenantId), String(p.email ?? '')]),
      );
      return {
        items: docs.map(doc => {
          const plain = doc as PlainDoc;
          const tid = String(plain.tenantId);
          const base = toGql(plain, featureMap.get(tid));
          return {
            ...base,
            campusCount: campusCountMap.get(tid) ?? 0,
            primaryAdminEmail: adminMap.get(tid) ?? null,
          };
        }),
        nextToken: null,
      };
    }

    case 'getTenant':
    case 'GET:/api/platform/tenants/:id': {
      const id = (args.tenantId ?? args.id) as string;
      if (!ctx.isPlatformAdmin && id !== tenantId) {
        throw new AppError('FORBIDDEN', 'Cannot view another tenant');
      }
      const tenant = await Tenant.findOne({ tenantId: id }).lean() as PlainDoc | null;
      const features = await TenantFeature.findOne({ tenantId: id }).lean() as PlainDoc | null;
      return toGql(tenant, features?.features as FeatureFlags | undefined);
    }

    case 'validateSubdomain':
    case 'GET:/api/platform/validate-subdomain': {
      const normalized = normalizeSubdomain((args.subdomain as string) ?? '');
      const fullDomain = `${normalized}.vebgenix.com`;
      const existing = await Tenant.findOne({ slug: normalized }).lean();
      const available = !existing;
      let suggestion: string | undefined;
      if (!available) {
        for (let i = 2; i <= 9; i++) {
          const candidate = `${normalized}${i}`;
          const taken = await Tenant.findOne({ slug: candidate }).lean();
          if (!taken) {
            suggestion = `${candidate}.vebgenix.com`;
            break;
          }
        }
      }
      return { available, normalized, fullDomain, suggestion };
    }

    case 'createTenant':
    case 'POST:/api/platform/tenants': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const input = (args.input as Record<string, unknown>) ?? args;
      const name = String(input.name ?? '').trim();
      const slug = normalizeSubdomain(String(input.slug ?? name));
      if (!name) throw new AppError('BAD_REQUEST', 'Tenant name is required');
      if (!slug) throw new AppError('BAD_REQUEST', 'Tenant subdomain is required');
      await assertTenantNameAvailable(name);
      await assertTenantSlugAvailable(slug);
      const newTenantId = generateTenantId(input.type as string | undefined);
      const tenant = await Tenant.create({ ...input, name, slug, tenantId: newTenantId, isActive: true });
      await TenantFeature.create({ tenantId: newTenantId });
      return toGql(tenant.toObject() as unknown as PlainDoc);
    }

    case 'provisionTenant':
    case 'POST:/api/platform/tenants/provision': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const input = (args.input as Record<string, unknown>) ?? args;
      const primaryCampus = (input.primaryCampus ?? {}) as ProvisionCampusInput;
      const primaryAdmin = (input.primaryAdmin ?? {}) as ProvisionPrimaryAdminInput;
      const organizationName = String(input.organizationName ?? '').trim();
      const subdomain = normalizeSubdomain(String(input.subdomain ?? ''));
      const featureFlags = featureFlagsFromList(input.features);
      const adminName = String(primaryAdmin.fullName ?? input.adminName ?? '').trim();
      const adminEmail = normalizeEmail(primaryAdmin.email ?? input.adminEmail);
      const adminPhone = String(primaryAdmin.phone ?? '').trim() || undefined;
      const campusName = String(primaryCampus.name ?? organizationName).trim();
      const campusCode = normalizeCampusCode(primaryCampus.code);
      const campusType = normalizeCampusType(primaryCampus.type);

      if (!organizationName) throw new AppError('BAD_REQUEST', 'Tenant name is required');
      if (!subdomain) throw new AppError('BAD_REQUEST', 'Tenant subdomain is required');
      if (!campusName) throw new AppError('BAD_REQUEST', 'Primary campus name is required');
      if (!adminName) throw new AppError('BAD_REQUEST', 'Primary admin full name is required');
      if (!adminEmail || !adminEmail.includes('@')) {
        throw new AppError('BAD_REQUEST', 'Valid primary admin email is required');
      }

      await assertTenantNameAvailable(organizationName);
      await assertTenantSlugAvailable(subdomain);
      await assertAdminEmailAvailable(adminEmail);

      if (!process.env.COGNITO_USER_POOL_ID) {
        throw new AppError('BAD_REQUEST', 'Cognito user pool is not configured');
      }

      const newTenantId = generateTenantId('org');
      let cognitoUsername: string | undefined;
      let mongoCommitted = false;

      try {
        const {
          AdminAddUserToGroupCommand,
          AdminCreateUserCommand,
          CognitoIdentityProviderClient,
        } = await import('@aws-sdk/client-cognito-identity-provider');
        const cognito = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
        const createResp = await cognito.send(new AdminCreateUserCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: adminEmail,
          DesiredDeliveryMediums: ['EMAIL'],
          UserAttributes: [
            { Name: 'email', Value: adminEmail },
            { Name: 'name', Value: adminName },
            { Name: 'custom:tenantId', Value: newTenantId },
            { Name: 'custom:role', Value: 'SCHOOL_ADMIN' },
            { Name: 'email_verified', Value: 'true' },
            ...(adminPhone ? [{ Name: 'phone_number', Value: adminPhone }] : []),
          ],
        }));
        cognitoUsername = adminEmail;
        const cognitoSub = createResp.User?.Attributes?.find(attr => attr.Name === 'sub')?.Value;
        if (!cognitoSub) {
          throw new AppError('BAD_REQUEST', 'Cognito did not return a user id');
        }
        await cognito.send(new AdminAddUserToGroupCommand({
          UserPoolId: process.env.COGNITO_USER_POOL_ID,
          Username: adminEmail,
          GroupName: 'SCHOOL_ADMIN',
        }));

        let tenantDoc: PlainDoc | null = null;
        let campusDoc: PlainDoc | null = null;
        let profileDoc: PlainDoc | null = null;
        const adminRoleId = new Types.ObjectId();
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            const [tenant] = await Tenant.create([{
              tenantId: newTenantId,
              name: organizationName,
              slug: subdomain,
              isActive: true,
              onboardingComplete: false,
            }], { session });
            const [featureDoc] = await TenantFeature.create([{
              tenantId: newTenantId,
              features: featureFlags,
              updatedBy: ctx.userId,
            }], { session });
            const [campus] = await Campus.create([{
              tenantId: newTenantId,
              name: campusName,
              code: campusCode,
              type: campusType,
              address: primaryCampus.address,
              city: primaryCampus.city,
              state: primaryCampus.state,
              country: primaryCampus.country,
              phone: primaryCampus.phone,
              email: primaryCampus.email,
              isActive: true,
            }], { session });
            const [authUser] = await AuthUser.create([{
              cognitoSub,
              email: adminEmail,
              phone: adminPhone,
              isActive: true,
              isPlatformAdmin: false,
            }], { session });
            const [profile] = await Profile.create([{
              tenantId: newTenantId,
              authUserId: authUser._id,
              email: adminEmail,
              fullName: adminName,
              phone: adminPhone,
              personaRole: TENANT_ADMIN_ROLE_NAME,
              isActive: true,
              isAllCampuses: true,
              isPrimaryOwner: true,
              campusAccess: [{
                campusId: campus._id,
                campusName: campus.name,
              }],
              roles: [{
                roleId: adminRoleId,
                roleName: TENANT_ADMIN_ROLE_NAME,
                permissions: TENANT_ADMIN_PERMISSIONS,
              }],
            }], { session });

            tenantDoc = tenant.toObject() as unknown as PlainDoc;
            campusDoc = campus.toObject() as unknown as PlainDoc;
            profileDoc = profile.toObject() as unknown as PlainDoc;
            (tenantDoc as PlainDoc).features = (featureDoc.toObject() as unknown as PlainDoc).features;
          });
          mongoCommitted = true;
        } finally {
          await session.endSession();
        }

        return {
          tenant: toGql(tenantDoc, featureFlags),
          campus: toCampusGql(campusDoc),
          primaryAdmin: toAdminGql(profileDoc),
          adminRole: {
            roleName: TENANT_ADMIN_ROLE_NAME,
            permissions: TENANT_ADMIN_PERMISSIONS,
          },
          adminEmail,
          inviteSent: true,
        };
      } catch (err) {
        if (cognitoUsername && !mongoCommitted) {
          try {
            await deleteCognitoUser(cognitoUsername);
          } catch (deleteErr) {
            console.warn('[settings/provisionTenant] failed to clean up Cognito user:', deleteErr);
          }
        }
        throw toProvisioningError(err);
      }
    }

    case 'updateTenant':
    case 'PATCH:/api/platform/tenants/:id':
    case 'PATCH:/api/admin/settings/tenant': {
      const input = (args.input as Record<string, unknown>) ?? args;
      const id = (args.tenantId ?? args.id ?? input.id) as string | undefined;
      const resolvedTenantId = id ?? tenantId;
      if (!ctx.isPlatformAdmin) authorize(ctx, 'tenant.settings.update');
      const { isActive: _isActive, slug: _slug, tenantId: _inputTenantId, id: _id, ...safeInput } = input;
      return toGql(await Tenant.findOneAndUpdate(
        { tenantId: resolvedTenantId },
        { $set: safeInput },
        { new: true },
      ).lean() as PlainDoc | null);
    }

    case 'deactivateTenant':
    case 'DELETE:/api/platform/tenants/:id': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const id = (args.tenantId ?? args.id) as string;
      await Tenant.findOneAndUpdate(
        { tenantId: id },
        { $set: { isActive: false } },
        { new: true },
      ).lean();
      return true;
    }

    case 'reactivateTenant': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const id = (args.tenantId ?? args.id) as string;
      return toGql(await Tenant.findOneAndUpdate(
        { tenantId: id },
        { $set: { isActive: true } },
        { new: true },
      ).lean() as PlainDoc | null);
    }

    case 'requestTenantDeletion':
    case 'POST:/api/platform/tenants/:id/request-deletion': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const id = (args.tenantId ?? args.id) as string;
      const tenant = await Tenant.findOne({ tenantId: id }).lean();
      if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found');

      const adminProfile = await Profile.findOne({
        tenantId: id,
        isPrimaryOwner: true,
        isActive: true,
      }).lean();
      const adminEmail = (adminProfile as PlainDoc | null)?.email as string ?? ctx.email;
      if (!adminEmail) throw new AppError('BAD_REQUEST', 'No admin email found for this tenant');

      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      await Tenant.findOneAndUpdate(
        { tenantId: id },
        { $set: { deletionOtp: otp, deletionOtpExpiresAt: expiresAt } },
      );

      console.info(`[settings/requestTenantDeletion] OTP for tenant ${id}: ${otp} (expires ${expiresAt.toISOString()})`);

      return {
        sent: true,
        expiresIn: 15 * 60,
        maskedEmail: maskEmail(adminEmail),
      };
    }

    case 'confirmTenantDeletion':
    case 'POST:/api/platform/tenants/:id/confirm-deletion': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const id = (args.tenantId ?? args.id) as string;
      const otp = args.otp as string;

      const tenant = await Tenant.findOne({ tenantId: id })
        .select('+deletionOtp +deletionOtpExpiresAt') as unknown as PlainDoc | null;
      if (!tenant) throw new AppError('NOT_FOUND', 'Tenant not found');

      const storedOtp = tenant.deletionOtp as string | undefined;
      const expiresAt = tenant.deletionOtpExpiresAt as Date | undefined;

      if (!storedOtp || storedOtp !== otp) {
        throw new AppError('BAD_REQUEST', 'Invalid OTP');
      }
      if (!expiresAt || new Date() > new Date(expiresAt)) {
        throw new AppError('BAD_REQUEST', 'OTP has expired; request a new one');
      }

      await Tenant.findOneAndUpdate(
        { tenantId: id },
        {
          $set: { isActive: false, deletedAt: new Date(), deletedBy: ctx.userId },
          $unset: { deletionOtp: '', deletionOtpExpiresAt: '' },
        },
      );

      return true;
    }

    case 'syncTenantAdminPermissions':
    case 'POST:/api/admin/settings/sync-permissions': {
      // Re-stamps the current TENANT_ADMIN_PERMISSIONS onto every TENANT_ADMIN role
      // within this tenant — fixes profiles provisioned before new permissions were added.
      const result = await Profile.updateMany(
        {
          tenantId,
          'roles.roleName': TENANT_ADMIN_ROLE_NAME,
        },
        {
          $set: { 'roles.$[role].permissions': TENANT_ADMIN_PERMISSIONS },
        },
        {
          arrayFilters: [{ 'role.roleName': TENANT_ADMIN_ROLE_NAME }],
        },
      );
      return { updated: result.modifiedCount, message: `Synced ${result.modifiedCount} profile(s) to current permission set` };
    }

    default:
      return undefined;
  }
}
