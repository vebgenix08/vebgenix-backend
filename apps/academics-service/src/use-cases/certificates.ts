import { Certificate } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { toGql } from '../academics-utils';

export async function handleCertificates(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listCertificates':
    case 'GET:/api/admin/students/:studentId/certificates': {
      const docs = await Certificate.find({ tenantId, studentId: args.studentId })
        .sort({ createdAt: -1 })
        .lean();
      return docs.map(d => toGql(d));
    }

    case 'issueCertificate':
    case 'POST:/api/admin/students/:studentId/certificates': {
      authorize(ctx, 'students.certificates.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      const doc = await Certificate.create({
        ...input,
        tenantId,
        studentId: args.studentId,
        status:    'PENDING',
      });
      return toGql(doc.toObject());
    }

    case 'approveCertificate':
    case 'PATCH:/api/admin/students/:studentId/certificates/:certificateId/approve': {
      authorize(ctx, 'students.certificates.approve');
      return toGql(await Certificate.findOneAndUpdate(
        { tenantId, _id: args.certificateId, studentId: args.studentId },
        { $set: { status: 'ISSUED', issuedAt: new Date(), issuedBy: ctx.membership!.profileId } },
        { new: true },
      ).lean());
    }

    default:
      return undefined;
  }
}
