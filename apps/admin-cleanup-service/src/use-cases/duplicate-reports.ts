import { Enquiry, Student, Application } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function handleDuplicateReports(operation: string, ctx: AuthContext, tenantId: string): Promise<unknown> {
  switch (operation) {
    case 'getDuplicateEnquiryReport':
    case 'GET:/api/admin/cleanup/duplicate-enquiries': {
      authorize(ctx, 'admin.cleanup.read');
      const duplicates = await Enquiry.aggregate([
        { $match: { tenantId } },
        { $group: { _id: '$phone', count: { $sum: 1 }, ids: { $push: '$_id' }, names: { $push: '$studentName' }, statuses: { $push: '$status' } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ]);
      const byEmail = await Enquiry.aggregate([
        { $match: { tenantId, email: { $ne: null, $exists: true } } },
        { $group: { _id: '$email', count: { $sum: 1 }, ids: { $push: '$_id' }, names: { $push: '$studentName' } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ]);
      return { byPhone: duplicates, byEmail, totalPhoneDuplicates: duplicates.length, totalEmailDuplicates: byEmail.length };
    }
    case 'getDuplicateStudentReport':
    case 'GET:/api/admin/cleanup/duplicate-students': {
      authorize(ctx, 'admin.cleanup.read');
      const byName = await Student.aggregate([
        { $match: { tenantId } },
        { $group: { _id: { firstName: { $ifNull: ['$firstName', '$fullName'] }, lastName: { $ifNull: ['$lastName', ''] }, dateOfBirth: '$dateOfBirth' }, count: { $sum: 1 }, ids: { $push: '$_id' }, registrationNumbers: { $push: '$registrationNumber' } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ]);
      const byPhone = await Student.aggregate([
        { $match: { tenantId, phone: { $ne: null, $exists: true } } },
        { $group: { _id: '$phone', count: { $sum: 1 }, ids: { $push: '$_id' }, names: { $push: { $ifNull: ['$fullName', { $concat: ['$firstName', ' ', { $ifNull: ['$lastName', ''] }] }] } } } },
        { $match: { count: { $gt: 1 } } },
        { $sort: { count: -1 } },
      ]);
      return { byNameAndDob: byName, byPhone, totalNameDuplicates: byName.length, totalPhoneDuplicates: byPhone.length };
    }
    case 'getDuplicateReport':
    case 'GET:/api/admin/cleanup/duplicates': {
      authorize(ctx, 'admin.cleanup.read');
      const [enquiryByPhone, studentByPhone, appByPhone] = await Promise.all([
        Enquiry.aggregate([{ $match: { tenantId } }, { $group: { _id: '$phone', count: { $sum: 1 }, ids: { $push: '$_id' } } }, { $match: { count: { $gt: 1 } } }]),
        Student.aggregate([{ $match: { tenantId } }, { $group: { _id: '$phone', count: { $sum: 1 }, ids: { $push: '$_id' } } }, { $match: { count: { $gt: 1 } } }]),
        Application.aggregate([{ $match: { tenantId } }, { $group: { _id: '$phone', count: { $sum: 1 }, ids: { $push: '$_id' } } }, { $match: { count: { $gt: 1 } } }]),
      ]);
      return {
        enquiries: { duplicateGroups: enquiryByPhone.length, records: enquiryByPhone },
        students: { duplicateGroups: studentByPhone.length, records: studentByPhone },
        applications: { duplicateGroups: appByPhone.length, records: appByPhone },
        total: enquiryByPhone.length + studentByPhone.length + appByPhone.length,
      };
    }
    default:
      return undefined;
  }
}
