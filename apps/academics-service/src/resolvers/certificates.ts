import { Certificate } from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveCertificates(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listCertificates':
    case 'GET:/api/admin/students/:studentId/certificates':
      return Certificate.find({ tenantId, studentId: args.studentId })
        .sort({ createdAt: -1 })
        .lean();

    case 'issueCertificate':
    case 'POST:/api/admin/students/:studentId/certificates': {
      authorize(ctx, 'students.certificates.create');
      const input = (args.input as Record<string, unknown>) ?? args;
      return Certificate.create({
        ...input,
        tenantId,
        studentId: args.studentId,
        status:    'PENDING',
      });
    }

    case 'approveCertificate':
    case 'PATCH:/api/admin/students/:studentId/certificates/:certificateId/approve': {
      authorize(ctx, 'students.certificates.approve');
      return Certificate.findOneAndUpdate(
        { tenantId, _id: args.certificateId, studentId: args.studentId },
        { $set: { status: 'ISSUED', issuedAt: new Date(), issuedBy: ctx.membership!.profileId } },
        { new: true },
      ).lean();
    }

    default:
      return undefined;
  }
}
