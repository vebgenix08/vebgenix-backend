import { Employee } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import type { ResolveTenantId } from '../identity-utils';
import { toGql } from '../identity-utils';

export async function handleEmployees(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  resolveTenantId: ResolveTenantId,
): Promise<unknown> {
  switch (operation) {
    case 'listEmployees':
    case 'GET:/api/admin/employees': {
      authorize(ctx, 'identity.staff.read');
      const tenantId = resolveTenantId();
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
      const tenantId = resolveTenantId();
      return toGql(await Employee.findOne({ tenantId, _id: args.id as string }).lean());
    }
    case 'updateEmployee': {
      authorize(ctx, 'identity.staff.update');
      const tenantId = resolveTenantId();
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
    case 'PATCH:/api/admin/employees/:id':
      return handleEmployees('updateEmployee', args, ctx, resolveTenantId);
    default:
      return undefined;
  }
}
