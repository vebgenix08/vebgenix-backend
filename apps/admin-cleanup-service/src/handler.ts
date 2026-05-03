/**
 * Admin Cleanup Service Lambda
 *
 * Handles: duplicate detection and deduplication for enquiries, students.
 * Platform admin + tenant admin operations for data hygiene.
 *
 * Invoked by:
 *   - AppSync (Cognito User Pool authorizer)
 *   - API Gateway REST
 */
import { bootstrapDB, ensureDB, Enquiry, Application, Student } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { authorize } from '@vebgenix/permissions';
import { Types } from 'mongoose';

function parseEvent(event: Record<string, unknown>) {
  if (event.info) {
    const info = event.info as Record<string, string>;
    return { operation: info.fieldName, args: (event.arguments ?? {}) as Record<string, unknown> };
  }
  const method = event.httpMethod as string;
  const path   = event.path as string;
  const body   = typeof event.body === 'string' ? JSON.parse(event.body || '{}') : (event.body ?? {}) as Record<string, unknown>;
  const params  = (event.pathParameters ?? {}) as Record<string, string>;
  const qs      = (event.queryStringParameters ?? {}) as Record<string, string>;
  return { operation: `${method}:${path}`, args: { ...body, ...params, ...qs } };
}

export const handler = async (event: Record<string, unknown>, context: Record<string, unknown>) => {
  bootstrapDB(context);
  try {
    await ensureDB();
    const ctx      = await resolveContext(event);
    const { operation, args } = parseEvent(event);
    const tenantId = getTenantId(ctx);

    switch (operation) {

      // ── Duplicate enquiry report ─────────────────────────────────────────────
      case 'getDuplicateEnquiryReport':
      case 'GET:/api/admin/cleanup/duplicate-enquiries': {
        authorize(ctx, 'admin.cleanup.read');
        // Group enquiries by phone — find groups with count > 1
        const duplicates = await Enquiry.aggregate([
          { $match: { tenantId } },
          { $group: {
            _id:   '$phone',
            count: { $sum: 1 },
            ids:   { $push: '$_id' },
            names: { $push: '$studentName' },
            statuses: { $push: '$status' },
          }},
          { $match: { count: { $gt: 1 } } },
          { $sort:  { count: -1 } },
        ]);
        const byEmail = await Enquiry.aggregate([
          { $match: { tenantId, email: { $ne: null, $exists: true } } },
          { $group: {
            _id:   '$email',
            count: { $sum: 1 },
            ids:   { $push: '$_id' },
            names: { $push: '$studentName' },
          }},
          { $match: { count: { $gt: 1 } } },
          { $sort:  { count: -1 } },
        ]);
        return { byPhone: duplicates, byEmail, totalPhoneDuplicates: duplicates.length, totalEmailDuplicates: byEmail.length };
      }

      // ── Duplicate student report ─────────────────────────────────────────────
      case 'getDuplicateStudentReport':
      case 'GET:/api/admin/cleanup/duplicate-students': {
        authorize(ctx, 'admin.cleanup.read');
        const byName = await Student.aggregate([
          { $match: { tenantId } },
          { $group: {
            _id:   { firstName: '$firstName', lastName: '$lastName', dateOfBirth: '$dateOfBirth' },
            count: { $sum: 1 },
            ids:   { $push: '$_id' },
            registrationNumbers: { $push: '$registrationNumber' },
          }},
          { $match: { count: { $gt: 1 } } },
          { $sort:  { count: -1 } },
        ]);
        const byPhone = await Student.aggregate([
          { $match: { tenantId, phone: { $ne: null, $exists: true } } },
          { $group: {
            _id:   '$phone',
            count: { $sum: 1 },
            ids:   { $push: '$_id' },
            names: { $push: { $concat: ['$firstName', ' ', '$lastName'] } },
          }},
          { $match: { count: { $gt: 1 } } },
          { $sort:  { count: -1 } },
        ]);
        return { byNameAndDob: byName, byPhone, totalNameDuplicates: byName.length, totalPhoneDuplicates: byPhone.length };
      }

      // ── Full duplicate report (enquiries + students + applications) ──────────
      case 'getDuplicateReport':
      case 'GET:/api/admin/cleanup/duplicates': {
        authorize(ctx, 'admin.cleanup.read');
        const [enquiryByPhone, studentByPhone, appByPhone] = await Promise.all([
          Enquiry.aggregate([
            { $match: { tenantId } },
            { $group: { _id: '$phone', count: { $sum: 1 }, ids: { $push: '$_id' } } },
            { $match: { count: { $gt: 1 } } },
          ]),
          Student.aggregate([
            { $match: { tenantId } },
            { $group: { _id: '$phone', count: { $sum: 1 }, ids: { $push: '$_id' } } },
            { $match: { count: { $gt: 1 } } },
          ]),
          Application.aggregate([
            { $match: { tenantId } },
            { $group: { _id: '$phone', count: { $sum: 1 }, ids: { $push: '$_id' } } },
            { $match: { count: { $gt: 1 } } },
          ]),
        ]);
        return {
          enquiries:    { duplicateGroups: enquiryByPhone.length,    records: enquiryByPhone    },
          students:     { duplicateGroups: studentByPhone.length,    records: studentByPhone    },
          applications: { duplicateGroups: appByPhone.length,        records: appByPhone        },
          total:        enquiryByPhone.length + studentByPhone.length + appByPhone.length,
        };
      }

      // ── Merge / dedup enquiries ──────────────────────────────────────────────
      case 'runDeduplication':
      case 'mergeEnquiries':
      case 'POST:/api/admin/cleanup/merge-enquiries': {
        authorize(ctx, 'admin.cleanup.write');
        const { keepId, mergeIds } = args as { keepId: string; mergeIds: string[] };
        if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
          throw new AppError('BAD_REQUEST', 'keepId and mergeIds[] are required');
        }
        const keeper = await Enquiry.findOne({ tenantId, _id: new Types.ObjectId(keepId) });
        if (!keeper) throw new AppError('NOT_FOUND', 'Target enquiry not found');
        // Delete duplicates — applications linked to them stay with the keeper's ID
        const deleted = await Enquiry.deleteMany({
          tenantId,
          _id: { $in: mergeIds.map((id) => new Types.ObjectId(id)) },
        });
        // Move any applications linked to mergeIds → keepId
        await Application.updateMany(
          { tenantId, enquiryId: { $in: mergeIds } },
          { $set: { enquiryId: keepId } }
        );
        return { success: true, keptId: keepId, deletedCount: deleted.deletedCount };
      }

      // ── Merge students ───────────────────────────────────────────────────────
      case 'mergeStudents':
      case 'POST:/api/admin/cleanup/merge-students': {
        authorize(ctx, 'admin.cleanup.write');
        const { keepId, mergeIds } = args as { keepId: string; mergeIds: string[] };
        if (!keepId || !Array.isArray(mergeIds) || mergeIds.length === 0) {
          throw new AppError('BAD_REQUEST', 'keepId and mergeIds[] are required');
        }
        const keeper = await Student.findOne({ tenantId, _id: new Types.ObjectId(keepId) });
        if (!keeper) throw new AppError('NOT_FOUND', 'Target student not found');
        // Deactivate duplicates
        const result = await Student.updateMany(
          { tenantId, _id: { $in: mergeIds.map((id) => new Types.ObjectId(id)) } },
          { $set: { status: 'INACTIVE', mergedInto: keepId } }
        );
        return { success: true, keptId: keepId, deactivatedCount: result.modifiedCount };
      }

      // ── Bulk delete inactive / test records ──────────────────────────────────
      case 'bulkDeleteInactiveEnquiries':
      case 'DELETE:/api/admin/cleanup/enquiries/inactive': {
        authorize(ctx, 'admin.cleanup.write');
        const daysOld = (args.daysOld as number) ?? 90;
        const cutoff  = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
        const result  = await Enquiry.deleteMany({
          tenantId,
          status:   'CLOSED',
          createdAt: { $lt: cutoff },
        });
        return { deletedCount: result.deletedCount };
      }

      default:
        throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
    }
  } catch (err) {
    if (isAppError(err)) {
      return { __error: true, code: err.code, message: err.message, statusCode: err.statusCode };
    }
    console.error('[admin-cleanup-service] unhandled error:', err);
    return { __error: true, code: 'INTERNAL', message: 'Internal server error', statusCode: 500 };
  }
};
