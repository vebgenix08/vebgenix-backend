import { Enquiry } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function handleCleanupRecords(operation: string, args: Record<string, unknown>, ctx: AuthContext, tenantId: string): Promise<unknown> {
  switch (operation) {
    case 'bulkDeleteInactiveEnquiries':
    case 'DELETE:/api/admin/cleanup/enquiries/inactive': {
      authorize(ctx, 'admin.cleanup.write');
      const daysOld = (args.daysOld as number) ?? 90;
      const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      const result = await Enquiry.deleteMany({ tenantId, status: 'CLOSED', createdAt: { $lt: cutoff } });
      return { deletedCount: result.deletedCount };
    }
    default:
      return undefined;
  }
}
