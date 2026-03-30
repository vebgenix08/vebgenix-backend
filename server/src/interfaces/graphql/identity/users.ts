import { resolveContext } from '../context';
import { StaffService } from '../../../domain/identity/staff-service';
import { InviteStaff } from '../../../application/identity/InviteStaff';
import { runWithTenantContext } from '../../../infrastructure/prisma/client';

export const handler = async (event: any) => {
  const { fieldName, arguments: args, identity } = event;
  
  // 1. Resolve Domain Context (User + Tenant + Permissions)
  const ctx = await resolveContext(identity, event.request?.headers);

  console.log(`[UsersResolver] ${fieldName} for user ${ctx.user.id}`);

  // 2. Route to Domain Logic
  switch (fieldName) {
    case 'me':
      return {
        id: ctx.user.id,
        email: ctx.user.email,
        fullName: ctx.user.fullName,
        // Map Set -> Array for GraphQL
        permissions: Array.from(ctx.permissions),
        roles: ctx.membership?.roles.map(r => r.name) ?? [],
        tenantId: ctx.membership?.tenantId,
        isPrimaryOwner: ctx.membership?.isPrimaryOwner
      };

    case 'listUsers':
      // Map GraphQL args to Service args
      if (!ctx.membership?.tenantId) {
        throw new Error('Tenant context is required to list users');
      }
      const result = await runWithTenantContext(ctx.membership.tenantId, ctx.user.id, (db) =>
        StaffService.listStaff(db, ctx, {
          limit: args.limit,
          cursor: args.cursor,
          search: args.filter?.search,
        }),
      );
      
      return {
        items: result, // We might need to map this to match UserConnection edge/node structure
        // But for now let's assume direct array or fix mapper
      };

    case 'inviteStaff':
      const output = await InviteStaff.execute(ctx, args.input);
      return {
        success: true,
        membershipId: output.membershipId
      };

    default:
      throw new Error(`Unknown field: ${fieldName}`);
  }
};
