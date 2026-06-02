import { Enquiry, Application, Student } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { toObjectId } from '../cleanup-utils';

export async function handleMergeRecords(operation: string, args: Record<string, unknown>, ctx: AuthContext, tenantId: string): Promise<unknown> {
  switch (operation) {
    case 'runDeduplication':
    case 'mergeEnquiries':
    case 'POST:/api/admin/cleanup/merge-enquiries': {
      authorize(ctx, 'admin.cleanup.write');
      const { keepId, mergeIds } = args as { keepId: string; mergeIds: string[] };
      if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) throw new AppError('BAD_REQUEST', 'keepId and mergeIds[] are required');
      const keeper = await Enquiry.findOne({ tenantId, _id: toObjectId(keepId) });
      if (!keeper) throw new AppError('NOT_FOUND', 'Target enquiry not found');
      const deleted = await Enquiry.deleteMany({ tenantId, _id: { $in: mergeIds.map(id => toObjectId(id)) } });
      await Application.updateMany({ tenantId, enquiryId: { $in: mergeIds } }, { $set: { enquiryId: keepId } });
      return { success: true, keptId: keepId, deletedCount: deleted.deletedCount };
    }
    case 'mergeStudents':
    case 'POST:/api/admin/cleanup/merge-students': {
      authorize(ctx, 'admin.cleanup.write');
      const { keepId, mergeIds } = args as { keepId: string; mergeIds: string[] };
      if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) throw new AppError('BAD_REQUEST', 'keepId and mergeIds[] are required');
      const keeper = await Student.findOne({ tenantId, _id: toObjectId(keepId) });
      if (!keeper) throw new AppError('NOT_FOUND', 'Target student not found');
      const result = await Student.updateMany({ tenantId, _id: { $in: mergeIds.map(id => toObjectId(id)) } }, { $set: { status: 'INACTIVE', mergedInto: keepId } });
      return { success: true, keptId: keepId, deactivatedCount: result.modifiedCount };
    }
    default:
      return undefined;
  }
}
