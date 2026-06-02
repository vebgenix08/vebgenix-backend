import { AdmissionsRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { toGql } from '../admissions-utils';

export async function handleDocuments(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'verifyDocument':
    case 'POST:/api/admissions/applications/:id/documents/:docKey/verify': {
      authorize(ctx, 'admissions.application.review');
      const appId  = (args.applicationId ?? args.id) as string;
      const docKey = (args.documentId ?? args.docKey ?? args.docType) as string;
      const app = await AdmissionsRepo.findApplicationById(tenantId, appId);
      if (!app) throw new AppError('NOT_FOUND', 'Application not found');
      const docs     = (app.documents ?? []) as unknown as Array<Record<string, unknown>>;
      const docIndex = docs.findIndex((d) => d.id?.toString() === docKey || d.key === docKey || d.type === docKey);
      if (docIndex === -1) throw new AppError('NOT_FOUND', `Document "${docKey}" not found on this application`);
      docs[docIndex] = { ...docs[docIndex], verified: true, verifiedAt: new Date(), verifiedBy: ctx.membership!.profileId };
      return toGql(await AdmissionsRepo.updateApplication(tenantId, appId, { documents: docs as never }));
    }
    case 'getUploadUrl':
    case 'POST:/api/admissions/applications/:id/upload-url': {
      authorize(ctx, 'admissions.application.update');
      const key = `${tenantId}/admissions/applications/${args.id}/${args.fileName}`;
      return {
        storageOperation: 'getUploadUrl',
        key,
        contentType: args.contentType ?? 'application/octet-stream',
      };
    }
    default:
      return undefined;
  }
}
