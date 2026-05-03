import { AuthContext } from '@vebgenix/auth';
import { IdentityRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';

export interface CreateUserInput {
  email:        string;
  fullName:     string;
  phone?:       string;
  personaRole:  'TENANT_ADMIN' | 'STAFF' | 'STUDENT' | 'PARENT';
  campusId:     string;
  roleIds?:     string[];
}

export class CreateUser {
  static async execute(ctx: AuthContext, input: CreateUserInput) {
    authorize(ctx, 'users.create');
    const tenantId = getTenantId(ctx);

    // ── Platform user guard ──────────────────────────────────────────────────
    // Prevent tenant admins from creating/overwriting platform super-admin accounts
    const existingAuthUser = await IdentityRepo.findAuthUserByEmail(input.email);
    if (existingAuthUser) {
      const authRecord = existingAuthUser as unknown as Record<string, unknown>;
      if (authRecord.isPlatformAdmin === true) {
        throw new AppError('FORBIDDEN', 'Cannot create a tenant profile for a platform super-admin account');
      }
    }

    // ── Duplicate profile guard ──────────────────────────────────────────────
    if (existingAuthUser) {
      const existingProfile = await IdentityRepo.findProfileByAuthUserId(tenantId, existingAuthUser._id.toString());
      if (existingProfile) {
        throw new AppError('CONFLICT', 'User already exists in this tenant');
      }
    }

    // ── Upsert AuthUser (Cognito owns auth — no password stored locally) ─────
    // The AuthUser document is just a lightweight mirror of the Cognito identity.
    // Password hashing is done entirely by Cognito; never store passwords here.
    let authUser = existingAuthUser;
    if (!authUser) {
      authUser = await IdentityRepo.createAuthUser({ email: input.email });
    }

    // ── Create profile ────────────────────────────────────────────────────────
    const profile = await IdentityRepo.createProfile({
      tenantId,
      authUserId:   authUser._id as Types.ObjectId,
      email:        input.email,
      fullName:     input.fullName,
      phone:        input.phone,
      personaRole:  input.personaRole,
      isActive:     true,
      isAllCampuses: false,
      isPrimaryOwner: false,
      campusAccess: [{ campusId: new Types.ObjectId(input.campusId), campusName: '' }],
      roles:        input.roleIds?.map((id) => ({ roleId: new Types.ObjectId(id), roleName: '', permissions: [] })) ?? [],
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'USER_CREATED',
      entityType: 'Profile', entityId: profile._id.toString(), entityName: input.fullName,
      after: { email: input.email, personaRole: input.personaRole },
    });

    return {
      id:          profile._id.toString(),
      email:       profile.email,
      fullName:    profile.fullName,
      personaRole: profile.personaRole,
    };
  }
}
