import { Announcement } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { toGql } from '../comms-utils';

export async function handleAnnouncements(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listAnnouncements':
    case 'GET:/api/admin/communication/announcements': {
      authorize(ctx, 'comms.announcements.read');
      const filter: Record<string, unknown> = { tenantId };
      if (args.status) filter.status = args.status;
      if (args.campusId) filter.campusId = args.campusId;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.targetGroup) filter.targetGroups = args.targetGroup;
      const docs = await Announcement.find(filter).sort({ createdAt: -1 }).lean();
      return docs.map(d => toGql(d));
    }
    case 'getAnnouncement':
    case 'GET:/api/admin/communication/announcements/:id':
      authorize(ctx, 'comms.announcements.read');
      return toGql(await Announcement.findOne({ tenantId, _id: args.id as string }).lean());
    case 'createAnnouncement':
    case 'POST:/api/admin/communication/announcements': {
      authorize(ctx, 'comms.announcements.create');
      const input = args.input as Record<string, unknown> ?? args;
      const doc = await Announcement.create({
        ...input,
        tenantId,
        createdBy: ctx.membership!.profileId,
        status: input.publishNow ? 'PUBLISHED' : 'DRAFT',
        publishedAt: input.publishNow ? new Date() : undefined,
      });
      return toGql(doc.toObject());
    }
    case 'updateAnnouncement':
    case 'PATCH:/api/admin/communication/announcements/:id': {
      authorize(ctx, 'comms.announcements.update');
      const { id, input: annInput, ...restAnn } = args as Record<string, unknown>;
      const update = (annInput as Record<string, unknown>) ?? restAnn;
      const existing = await Announcement.findOne({ tenantId, _id: id as string });
      if (!existing) throw new AppError('NOT_FOUND', 'Announcement not found');
      return toGql(await Announcement.findOneAndUpdate({ tenantId, _id: id as string }, { $set: update }, { new: true }).lean());
    }
    case 'publishAnnouncement':
    case 'POST:/api/admin/communication/announcements/:id/publish': {
      authorize(ctx, 'comms.announcements.update');
      const ann = await Announcement.findOne({ tenantId, _id: args.id as string });
      if (!ann) throw new AppError('NOT_FOUND', 'Announcement not found');
      return toGql(await Announcement.findOneAndUpdate({ tenantId, _id: args.id as string }, { $set: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: ctx.membership!.profileId } }, { new: true }).lean());
    }
    case 'archiveAnnouncement':
    case 'POST:/api/admin/communication/announcements/:id/archive': {
      authorize(ctx, 'comms.announcements.update');
      return toGql(await Announcement.findOneAndUpdate({ tenantId, _id: args.id as string }, { $set: { status: 'ARCHIVED' } }, { new: true }).lean());
    }
    case 'deleteAnnouncement':
    case 'DELETE:/api/admin/communication/announcements/:id':
      authorize(ctx, 'comms.announcements.delete');
      return toGql(await Announcement.findOneAndDelete({ tenantId, _id: args.id as string }).lean());
    default:
      return undefined;
  }
}
