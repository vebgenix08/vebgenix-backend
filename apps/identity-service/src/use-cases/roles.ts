import { IdentityRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import type { ResolveTenantId } from '../identity-utils';
import { toGql } from '../identity-utils';

export async function handleRoles(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  resolveTenantId: ResolveTenantId,
): Promise<unknown> {
  switch (operation) {
    case 'listRoles':
      return [
        { id: 'TENANT_ADMIN', roleName: 'Tenant Admin', permissions: ['*'], description: 'Full access to all tenant features' },
        { id: 'PRINCIPAL',    roleName: 'Principal',    permissions: ['academics.*', 'admissions.*', 'finance.read'], description: 'School principal' },
        { id: 'TEACHER',      roleName: 'Teacher',      permissions: ['academics.classes.read', 'academics.attendance.mark', 'academics.exams.update'], description: 'Class teacher / subject teacher' },
        { id: 'ACCOUNTANT',   roleName: 'Accountant',   permissions: ['finance.*'], description: 'Finance and fee management' },
        { id: 'ADMISSIONS_OFFICER', roleName: 'Admissions Officer', permissions: ['admissions.*'], description: 'Manages enquiries and applications' },
        { id: 'RECEPTIONIST', roleName: 'Receptionist', permissions: ['admissions.enquiry.*', 'admissions.application.read'], description: 'Front-desk reception' },
        { id: 'STAFF',        roleName: 'Staff',        permissions: ['academics.read'], description: 'General staff with read-only access' },
      ];
    case 'assignRole':
    case 'POST:/api/admin/users/:id/roles': {
      authorize(ctx, 'identity.roles.assign');
      const tenantId = resolveTenantId();
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
      const tenantId = resolveTenantId();
      const profile  = await IdentityRepo.findProfileById(tenantId, args.id as string);
      if (!profile) throw new AppError('NOT_FOUND', 'User not found');
      const filtered = (profile.roles ?? []).filter(
        (r) => (r as unknown as Record<string, unknown>).role !== args.role
      );
      await IdentityRepo.updateProfile(tenantId, args.id as string, {
        roles: filtered as never,
      });
      return true;
    }
    default:
      return undefined;
  }
}
