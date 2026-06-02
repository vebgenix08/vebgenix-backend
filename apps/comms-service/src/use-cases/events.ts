import { Event as EventModel } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { toGql } from '../comms-utils';

export async function handleEvents(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listEvents':
    case 'GET:/api/admin/events': {
      authorize(ctx, 'comms.events.read');
      const filter: Record<string, unknown> = { tenantId };
      if (args.upcoming === 'true' || args.upcoming === true) filter.startDate = { $gte: new Date() };
      if (args.campusId) filter.campusId = args.campusId;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.from || args.to) {
        filter.startDate = {
          ...((filter.startDate as Record<string, unknown>) ?? {}),
          ...(args.from ? { $gte: new Date(args.from as string) } : {}),
          ...(args.to ? { $lte: new Date(args.to as string) } : {}),
        };
      }
      const docs = await EventModel.find(filter).sort({ startDate: 1 }).lean();
      return docs.map(d => toGql(d));
    }
    case 'getEvent':
    case 'GET:/api/admin/events/:id':
      authorize(ctx, 'comms.events.read');
      return toGql(await EventModel.findOne({ tenantId, _id: args.id as string }).lean());
    case 'createEvent':
    case 'POST:/api/admin/events': {
      authorize(ctx, 'comms.events.create');
      const input = args.input as Record<string, unknown> ?? args;
      const doc = await EventModel.create({ ...input, tenantId, createdBy: ctx.membership!.profileId });
      return toGql(doc.toObject());
    }
    case 'updateEvent':
    case 'PATCH:/api/admin/events/:id': {
      authorize(ctx, 'comms.events.update');
      const { id, input: evtInput, ...restEvt } = args as Record<string, unknown>;
      const update = (evtInput as Record<string, unknown>) ?? restEvt;
      const existing = await EventModel.findOne({ tenantId, _id: id as string });
      if (!existing) throw new AppError('NOT_FOUND', 'Event not found');
      return toGql(await EventModel.findOneAndUpdate({ tenantId, _id: id as string }, { $set: update }, { new: true }).lean());
    }
    case 'deleteEvent':
    case 'DELETE:/api/admin/events/:id':
      authorize(ctx, 'comms.events.delete');
      return toGql(await EventModel.findOneAndDelete({ tenantId, _id: args.id as string }).lean());
    default:
      return undefined;
  }
}
