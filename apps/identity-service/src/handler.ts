/**
 * Identity Service Lambda
 *
 * Handles: user profiles, staff management, roles, campus access,
 *          employee records, impersonation (platform admin only).
 *
 * Does NOT handle: login / logout / token refresh — those are owned by Cognito.
 *
 * Invoked by:
 *   - AppSync (Cognito User Pool authorizer) — event.identity.claims is pre-verified
 *   - EC2 REST proxy — Authorization: Bearer <Cognito Access Token>
 */
import { bootstrapDB, ensureDB, IdentityRepo, Profile, Employee } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { authorize } from '@vebgenix/permissions';
import { CreateUser } from './use-cases/CreateUser';
import { UpdateUser } from './use-cases/UpdateUser';
import { DeactivateUser } from './use-cases/DeactivateUser';
import { InviteStaff } from './use-cases/InviteStaff';
import { Types } from 'mongoose';

function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}


function parseEvent(event: Record<string, unknown>) {
  // AppSync: event.info.fieldName = 'listUsers', 'createUser', etc.
  if (event.info) {
    const info = event.info as Record<string, string>;
    return { operation: info.fieldName, args: (event.arguments ?? {}) as Record<string, unknown> };
  }
  // API Gateway (REST)
  const method = event.httpMethod as string;
  const path   = event.path as string;
  const body   = typeof event.body === 'string'
    ? JSON.parse(event.body || '{}')
    : (event.body ?? {}) as Record<string, unknown>;
  const params = (event.pathParameters ?? {}) as Record<string, string>;
  const qs     = (event.queryStringParameters ?? {}) as Record<string, string>;
  return { operation: `${method}:${path}`, args: { ...body, ...params, ...qs } };
}

function toGqlProfile(profile: unknown, fallback: { id?: string; email?: string } = {}): Record<string, unknown> {
  if (!profile) return { id: fallback.id ?? '', email: fallback.email ?? '' };
  const doc = (profile as { toObject?: () => Record<string, unknown> }).toObject?.()
    ?? (profile as Record<string, unknown>);
  const { _id, ...rest } = doc;
  return {
    ...rest,
    id:    String(doc.id ?? _id ?? fallback.id ?? ''),
    email: String(doc.email ?? fallback.email ?? ''),
  };
}

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();

    const ctx                  = await resolveContext(event);
    const { operation, args } = parseEvent(event);

    switch (operation) {

      // ── Who am I ──────────────────────────────────────────────────────────
      case 'me':
      case 'GET:/api/me': {
        const tenantId = ctx.membership?.tenantId;
        if (!tenantId) {
          return { id: ctx.userId, email: ctx.email, isPlatformAdmin: ctx.isPlatformAdmin, permissions: [], roles: [] };
        }
        const profile = await IdentityRepo.findProfileByAuthUserId(tenantId, ctx.userId);
        if (!profile) return { id: ctx.userId, email: ctx.email, permissions: [], roles: [] };
        return {
          ...toGqlProfile(profile, { id: ctx.userId, email: ctx.email }),
          permissions: Array.from(ctx.permissions),
          roles: (ctx.membership?.roles ?? []).map(r => r.roleName),
        };
      }

      // ── Users ─────────────────────────────────────────────────────────────
      case 'listUsers':
      case 'GET:/api/admin/users': {
        const tenantId = getTenantId(ctx);
        const filter: Record<string, unknown> = { personaRole: { $ne: 'STUDENT' } };
        if (args.isActive !== undefined) filter.isActive = args.isActive === 'true' || args.isActive === true;
        if (args.campusId) filter['campusAccess.campusId'] = args.campusId;
        const profiles = await IdentityRepo.listProfiles(tenantId, filter);
        return {
          edges: profiles.map(p => {
            const node = toGqlProfile(p) as Record<string, unknown>;
            return { cursor: String(node.id), node };
          }),
          pageInfo: { hasNextPage: false, nextCursor: null },
        };
      }

      case 'getUser':
      case 'GET:/api/admin/users/:id': {
        const tenantId = getTenantId(ctx);
        return toGql(await IdentityRepo.findProfileById(tenantId, args.id as string));
      }

      case 'createUser':
      case 'POST:/api/admin/users':
        return CreateUser.execute(ctx, args as Parameters<typeof CreateUser.execute>[1]);

      case 'updateUser':
      case 'PATCH:/api/admin/users/:id':
        return UpdateUser.execute(ctx, {
          profileId: args.id as string,
          ...(args.input ?? args) as object,
        } as Parameters<typeof UpdateUser.execute>[1]);

      case 'deactivateUser':
      case 'DELETE:/api/admin/users/:id':
        return DeactivateUser.execute(ctx, args.id as string);

      case 'reactivateUser':
      case 'POST:/api/admin/users/:id/reactivate': {
        authorize(ctx, 'identity.users.update');
        const tenantId = getTenantId(ctx);
        const updated  = await IdentityRepo.updateProfile(tenantId, args.id as string, { isActive: true });
        if (!updated) throw new AppError('NOT_FOUND', 'User not found');
        return toGql(updated);
      }

      // ── Staff ─────────────────────────────────────────────────────────────
      case 'inviteStaff':
      case 'POST:/api/admin/staff':
        return InviteStaff.execute(ctx, args as Parameters<typeof InviteStaff.execute>[1]);

      case 'listStaff':
      case 'GET:/api/admin/staff': {
        const tenantId = getTenantId(ctx);
        const filter: Record<string, unknown> = { personaRole: { $in: ['STAFF', 'TEACHER'] } };
        if (args.campusId) filter['campusAccess.campusId'] = args.campusId;
        const profiles = await IdentityRepo.listProfiles(tenantId, filter);
        return (profiles as unknown[]).map(p => toGql(p));
      }

      case 'getStaffMember':
      case 'GET:/api/admin/staff/:id': {
        const tenantId = getTenantId(ctx);
        return toGql(await IdentityRepo.findProfileById(tenantId, args.id as string));
      }

      // ── Employee Records ───────────────────────────────────────────────────
      case 'listEmployees':
      case 'GET:/api/admin/employees': {
        authorize(ctx, 'identity.staff.read');
        const tenantId = getTenantId(ctx);
        const filter: Record<string, unknown> = { tenantId };
        if (args.staffType)   filter.staffType   = args.staffType;
        if (args.campusId)    filter.campusId     = args.campusId;
        if (args.isActive !== undefined) filter.isActive = args.isActive === 'true' || args.isActive === true;
        const docs = await Employee.find(filter).sort({ createdAt: -1 }).lean();
        return docs.map(d => toGql(d));
      }

      case 'getEmployee':
      case 'GET:/api/admin/employees/:id': {
        authorize(ctx, 'identity.staff.read');
        const tenantId = getTenantId(ctx);
        return toGql(await Employee.findOne({ tenantId, _id: args.id as string }).lean());
      }

      case 'updateEmployee':
      case 'PATCH:/api/admin/employees/:id': {
        authorize(ctx, 'identity.staff.update');
        const tenantId = getTenantId(ctx);
        const id = args.id as string;
        const update = (args.input as Record<string, unknown>) ?? (() => {
          const { id: _id, ...rest } = args as Record<string, unknown>;
          return rest;
        })();
        return toGql(await Employee.findOneAndUpdate(
          { tenantId, _id: id },
          { $set: update },
          { new: true }
        ).lean());
      }

      // ── Campus Access ──────────────────────────────────────────────────────
      case 'addCampusAccess':
      case 'POST:/api/admin/users/:id/campus-access': {
        authorize(ctx, 'identity.users.update');
        const tenantId  = getTenantId(ctx);
        const profileId = (args.userId ?? args.id) as string;
        const campusId  = args.campusId as string;
        const roleAtCampus = args.role as string | undefined;
        const profile = await IdentityRepo.findProfileById(tenantId, profileId);
        if (!profile) throw new AppError('NOT_FOUND', 'User not found');
        const existing = (profile.campusAccess ?? []) as unknown as Array<Record<string, unknown>>;
        if (existing.some((ca) => ca.campusId?.toString() === campusId)) {
          throw new AppError('CONFLICT', 'User already has access to this campus');
        }
        return toGql(await IdentityRepo.updateProfile(tenantId, profileId, {
          campusAccess: [
            ...existing,
            { campusId, role: roleAtCampus, grantedAt: new Date() },
          ] as never,
        }));
      }

      case 'removeCampusAccess':
      case 'DELETE:/api/admin/users/:id/campus-access/:campusId': {
        authorize(ctx, 'identity.users.update');
        const tenantId  = getTenantId(ctx);
        const profileId = (args.id ?? args.profileId) as string;
        const campusId  = args.campusId as string;
        const profile = await IdentityRepo.findProfileById(tenantId, profileId);
        if (!profile) throw new AppError('NOT_FOUND', 'User not found');
        const filtered = (profile.campusAccess ?? []).filter(
          (ca) => ca.campusId?.toString() !== campusId
        );
        return IdentityRepo.updateProfile(tenantId, profileId, { campusAccess: filtered as never });
      }

      case 'listCampusAccess':
      case 'GET:/api/admin/users/:id/campus-access': {
        const tenantId = getTenantId(ctx);
        const profile  = await IdentityRepo.findProfileById(tenantId, args.id as string);
        if (!profile) throw new AppError('NOT_FOUND', 'User not found');
        return profile.campusAccess ?? [];
      }

      // ── Roles ──────────────────────────────────────────────────────────────
      case 'listRoles': {
        // Returns predefined role types available for staff invitation
        return [
          { id: 'TENANT_ADMIN', roleName: 'Tenant Admin', permissions: ['*'], description: 'Full access to all tenant features' },
          { id: 'PRINCIPAL',    roleName: 'Principal',    permissions: ['academics.*', 'admissions.*', 'finance.read'], description: 'School principal' },
          { id: 'TEACHER',      roleName: 'Teacher',      permissions: ['academics.classes.read', 'academics.attendance.mark', 'academics.exams.update'], description: 'Class teacher / subject teacher' },
          { id: 'ACCOUNTANT',   roleName: 'Accountant',   permissions: ['finance.*'], description: 'Finance and fee management' },
          { id: 'ADMISSIONS_OFFICER', roleName: 'Admissions Officer', permissions: ['admissions.*'], description: 'Manages enquiries and applications' },
          { id: 'RECEPTIONIST', roleName: 'Receptionist', permissions: ['admissions.enquiry.*', 'admissions.application.read'], description: 'Front-desk reception' },
          { id: 'STAFF',        roleName: 'Staff',        permissions: ['academics.read'], description: 'General staff with read-only access' },
        ];
      }

      case 'assignRole':
      case 'POST:/api/admin/users/:id/roles': {
        authorize(ctx, 'identity.roles.assign');
        const tenantId = getTenantId(ctx);
        const targetId = (args.userId ?? args.id) as string;
        const profile  = await IdentityRepo.findProfileById(tenantId, targetId);
        if (!profile) throw new AppError('NOT_FOUND', 'User not found');
        const roles        = (profile.roles ?? []) as unknown as Array<Record<string, unknown>>;
        const roleName     = (args.role ?? args.roleId) as string;
        const campusId     = args.campusId as string | undefined;
        if (roles.some((r) => r.role === roleName && r.campusId?.toString() === campusId)) {
          throw new AppError('CONFLICT', 'Role already assigned');
        }
        roles.push({ role: roleName, campusId, assignedAt: new Date(), assignedBy: ctx.membership!.profileId });
        return toGql(await IdentityRepo.updateProfile(tenantId, targetId, {
          roles: roles as never,
        }));
      }

      case 'removeRole':
      case 'DELETE:/api/admin/users/:id/roles/:role': {
        authorize(ctx, 'identity.roles.assign');
        const tenantId = getTenantId(ctx);
        const profile  = await IdentityRepo.findProfileById(tenantId, args.id as string);
        if (!profile) throw new AppError('NOT_FOUND', 'User not found');
        const filtered = (profile.roles ?? []).filter(
          (r) => (r as unknown as Record<string, unknown>).role !== args.role
        );
        return IdentityRepo.updateProfile(tenantId, args.id as string, {
          roles: filtered as never,
        });
      }

      // ── Impersonation (platform admin only) ────────────────────────────────
      case 'impersonateUser':
      case 'POST:/api/platform/impersonate': {
        if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
        const targetUserId = args.userId as string;
        // Return a limited context token info — actual Cognito impersonation
        // is done via AdminInitiateAuth with ALLOW_USER_PASSWORD_AUTH for super admin
        // This endpoint logs the action and returns target user profile
        const targetProfile = await Profile.findOne({ _id: targetUserId }).lean() as unknown as Record<string, unknown> | null;
        if (!targetProfile) throw new AppError('NOT_FOUND', 'Target user not found');
        console.warn(`[IMPERSONATION] Platform admin ${ctx.userId} impersonating ${targetUserId}`);
        return { targetProfile, note: 'Use Cognito Admin APIs to obtain token for this user' };
      }

      // ── Self-service profile ───────────────────────────────────────────────
      case 'updateMyProfile':
      case 'PATCH:/api/me': {
        const tenantId = ctx.membership?.tenantId;
        if (!tenantId) throw new AppError('BAD_REQUEST', 'No tenant context');
        const profileId = ctx.membership!.profileId;
        const rawInput = (args.input as Record<string, unknown>) ?? args;
        const { isActive: _ia, personaRole: _pr, roleAssignments: _ra, campusAccess: _ca, ...safeUpdate } =
          rawInput as Record<string, unknown>;
        return toGql(await IdentityRepo.updateProfile(tenantId, profileId, safeUpdate as never));
      }

      case 'uploadAvatar':
      case 'POST:/api/me/avatar': {
        const tenantId = ctx.membership?.tenantId ?? 'platform';
        const key      = `${tenantId}/avatars/${ctx.userId}-${Date.now()}.jpg`;
        return {
          key,
          contentType: (args.contentType as string) ?? 'image/jpeg',
        };
      }

      case 'uploadTenantLogo':
      case 'POST:/api/admin/settings/logo': {
        authorize(ctx, 'tenant.settings.update');
        const tenantId = getTenantId(ctx);
        const key      = `${tenantId}/logos/tenant-logo-${Date.now()}.png`;
        return {
          key,
          contentType: (args.contentType as string) ?? 'image/png',
        };
      }

      case 'resendInvite':
      case 'POST:/api/admin/staff/:id/resend-invite': {
        authorize(ctx, 'identity.users.update');
        const tenantId = getTenantId(ctx);
        const profileId = (args.staffId ?? args.id) as string;
        const profile  = await IdentityRepo.findProfileById(tenantId, profileId);
        if (!profile) throw new AppError('NOT_FOUND', 'Staff member not found');
        const { AdminCreateUserCommand, CognitoIdentityProviderClient } = await import('@aws-sdk/client-cognito-identity-provider');
        const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.COGNITO_REGION });
        await cognitoClient.send(new AdminCreateUserCommand({
          UserPoolId:    process.env.COGNITO_USER_POOL_ID,
          Username:      profile.email,
          MessageAction: 'RESEND',
        }));
        return true;
      }

      // ── Accept invite ─────────────────────────────────────────────────────
      // Called when a staff member clicks their invite link before setting
      // a password. The `token` is their email address (or a profile lookup key).
      // The actual Cognito password-set happens client-side via confirmSignIn;
      // this endpoint validates the invite is still open and returns pre-fill info.
      case 'acceptInvite':
      case 'POST:/api/auth/accept-invite': {
        const token = args.token as string;
        if (!token) throw new AppError('BAD_REQUEST', 'token is required');
        // Lookup by email (the token sent in the Cognito invitation email)
        const authUser = await IdentityRepo.findAuthUserByEmail(token);
        if (!authUser) {
          // Try treating token as a profileId
          const profileById = await Profile.findById(token).lean() as unknown as Record<string, unknown> | null;
          if (!profileById) throw new AppError('NOT_FOUND', 'Invalid or expired invite token');
          return {
            success:        true,
            email:          profileById.email as string,
            isExistingUser: !!(authUser),
          };
        }
        const isExistingUser = !!authUser.cognitoSub;
        return {
          success: true,
          email:   authUser.email,
          isExistingUser,
        };
      }

      // ── Bulk operations ────────────────────────────────────────────────────
      case 'bulkDeactivateUsers':
      case 'POST:/api/admin/users/bulk-deactivate': {
        authorize(ctx, 'identity.users.delete');
        const tenantId  = getTenantId(ctx);
        const userIds   = args.userIds as string[];
        if (!Array.isArray(userIds) || userIds.length === 0) {
          throw new AppError('BAD_REQUEST', 'userIds array is required');
        }
        const result = await Profile.updateMany(
          { tenantId, _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } },
          { $set: { isActive: false } }
        );
        return { modifiedCount: result.modifiedCount };
      }

      default:
        throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
    }
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error('[identity-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
