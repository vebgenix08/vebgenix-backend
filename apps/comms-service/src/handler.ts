/**
 * Comms Service Lambda
 *
 * Handles: announcements, events, leave requests.
 *
 * Invoked by:
 *   - AppSync (Cognito User Pool authorizer)
 *   - API Gateway REST
 */
import { bootstrapDB, ensureDB, Announcement, Event as EventModel, LeaveRequest } from '@vebgenix/db';
import { resolveContext } from '@vebgenix/auth';
import { AppError, isAppError } from '@vebgenix/errors';
import { getTenantId } from '@vebgenix/tenant';
import { authorize } from '@vebgenix/permissions';
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
    const ctx = await resolveContext(event);
    const { operation, args } = parseEvent(event);
    const tenantId = getTenantId(ctx);

    switch (operation) {

      // ── Announcements ─────────────────────────────────────────────────────────

      case 'listAnnouncements':
      case 'GET:/api/admin/communication/announcements': {
        authorize(ctx, 'comms.announcements.read');
        const filter: Record<string, unknown> = { tenantId };
        if (args.status)      filter.status      = args.status;
        if (args.targetGroup) filter.targetGroups = args.targetGroup;
        return Announcement.find(filter).sort({ createdAt: -1 }).lean();
      }

      case 'getAnnouncement':
      case 'GET:/api/admin/communication/announcements/:id':
        authorize(ctx, 'comms.announcements.read');
        return Announcement.findOne({ tenantId, _id: args.id as string }).lean();

      case 'createAnnouncement':
      case 'POST:/api/admin/communication/announcements': {
        authorize(ctx, 'comms.announcements.create');
        const input = args.input as Record<string, unknown> ?? args;
        return Announcement.create({
          ...input,
          tenantId,
          createdBy: ctx.membership!.profileId,
          status:    input.publishNow ? 'PUBLISHED' : 'DRAFT',
          publishedAt: input.publishNow ? new Date() : undefined,
        });
      }

      case 'updateAnnouncement':
      case 'PATCH:/api/admin/communication/announcements/:id': {
        authorize(ctx, 'comms.announcements.update');
        const { id, ...update } = args as Record<string, unknown>;
        const existing = await Announcement.findOne({ tenantId, _id: id as string });
        if (!existing) throw new AppError('NOT_FOUND', 'Announcement not found');
        return Announcement.findOneAndUpdate(
          { tenantId, _id: id as string },
          { $set: update },
          { new: true }
        ).lean();
      }

      case 'publishAnnouncement':
      case 'POST:/api/admin/communication/announcements/:id/publish': {
        authorize(ctx, 'comms.announcements.update');
        const ann = await Announcement.findOne({ tenantId, _id: args.id as string });
        if (!ann) throw new AppError('NOT_FOUND', 'Announcement not found');
        return Announcement.findOneAndUpdate(
          { tenantId, _id: args.id as string },
          { $set: { status: 'PUBLISHED', publishedAt: new Date(), publishedBy: ctx.membership!.profileId } },
          { new: true }
        ).lean();
      }

      case 'archiveAnnouncement':
      case 'POST:/api/admin/communication/announcements/:id/archive': {
        authorize(ctx, 'comms.announcements.update');
        return Announcement.findOneAndUpdate(
          { tenantId, _id: args.id as string },
          { $set: { status: 'ARCHIVED' } },
          { new: true }
        ).lean();
      }

      case 'deleteAnnouncement':
      case 'DELETE:/api/admin/communication/announcements/:id':
        authorize(ctx, 'comms.announcements.delete');
        return Announcement.findOneAndDelete({ tenantId, _id: args.id as string }).lean();

      // ── Events ─────────────────────────────────────────────────────────────────

      case 'listEvents':
      case 'GET:/api/admin/events': {
        authorize(ctx, 'comms.events.read');
        const filter: Record<string, unknown> = { tenantId };
        if (args.upcoming === 'true' || args.upcoming === true) {
          filter.startDate = { $gte: new Date() };
        }
        if (args.campusId) filter.campusId = args.campusId;
        return EventModel.find(filter).sort({ startDate: 1 }).lean();
      }

      case 'getEvent':
      case 'GET:/api/admin/events/:id':
        authorize(ctx, 'comms.events.read');
        return EventModel.findOne({ tenantId, _id: args.id as string }).lean();

      case 'createEvent':
      case 'POST:/api/admin/events': {
        authorize(ctx, 'comms.events.create');
        const input = args.input as Record<string, unknown> ?? args;
        return EventModel.create({
          ...input,
          tenantId,
          createdBy: ctx.membership!.profileId,
        });
      }

      case 'updateEvent':
      case 'PATCH:/api/admin/events/:id': {
        authorize(ctx, 'comms.events.update');
        const { id, ...update } = args as Record<string, unknown>;
        const existing = await EventModel.findOne({ tenantId, _id: id as string });
        if (!existing) throw new AppError('NOT_FOUND', 'Event not found');
        return EventModel.findOneAndUpdate(
          { tenantId, _id: id as string },
          { $set: update },
          { new: true }
        ).lean();
      }

      case 'deleteEvent':
      case 'DELETE:/api/admin/events/:id':
        authorize(ctx, 'comms.events.delete');
        return EventModel.findOneAndDelete({ tenantId, _id: args.id as string }).lean();

      // ── Leave Requests ──────────────────────────────────────────────────────────

      case 'listLeaveRequests':
      case 'GET:/api/admin/leave': {
        authorize(ctx, 'comms.leave.read');
        const filter: Record<string, unknown> = { tenantId };
        if (args.status)    filter.status    = args.status;
        if (args.profileId) filter.profileId = args.profileId;
        if (args.leaveType) filter.leaveType = args.leaveType;
        // Non-admin users see only their own requests
        if (!ctx.membership?.roles?.some(r => r.roleName === 'ADMIN') && !ctx.isPlatformAdmin) {
          filter.profileId = ctx.membership!.profileId;
        }
        return LeaveRequest.find(filter).sort({ createdAt: -1 }).lean();
      }

      case 'getLeaveRequest':
      case 'GET:/api/admin/leave/:id': {
        authorize(ctx, 'comms.leave.read');
        const req = await LeaveRequest.findOne({ tenantId, _id: args.id as string }).lean();
        if (!req) throw new AppError('NOT_FOUND', 'Leave request not found');
        // Staff can only view their own leave unless they are admin
        const isAdmin = ctx.isPlatformAdmin || ctx.membership?.roles?.some(r => r.roleName === 'ADMIN');
        if (!isAdmin && (req as unknown as Record<string, unknown>).profileId?.toString() !== ctx.membership!.profileId) {
          throw new AppError('FORBIDDEN', 'Cannot view another staff member\'s leave request');
        }
        return req;
      }

      case 'createLeaveRequest':
      case 'POST:/api/admin/leave': {
        const input = args.input as Record<string, unknown> ?? args;
        return LeaveRequest.create({
          ...input,
          tenantId,
          profileId: input.profileId ?? ctx.membership!.profileId,
          status:    'PENDING',
          appliedAt: new Date(),
        });
      }

      case 'updateLeaveRequest':
      case 'PATCH:/api/admin/leave/:id': {
        const { id, ...update } = args as Record<string, unknown>;
        const req = await LeaveRequest.findOne({ tenantId, _id: id as string });
        if (!req) throw new AppError('NOT_FOUND', 'Leave request not found');
        // Only the owner can update their own pending request
        if ((req as unknown as Record<string, unknown>).profileId?.toString() !== ctx.membership!.profileId) {
          throw new AppError('FORBIDDEN', 'Cannot edit another staff member\'s leave request');
        }
        if ((req as unknown as Record<string, unknown>).status !== 'PENDING') {
          throw new AppError('BAD_REQUEST', 'Can only edit PENDING requests');
        }
        return LeaveRequest.findOneAndUpdate(
          { tenantId, _id: id as string },
          { $set: update },
          { new: true }
        ).lean();
      }

      case 'approveLeave':
      case 'POST:/api/admin/leave/:id/approve': {
        authorize(ctx, 'comms.leave.approve');
        const req = await LeaveRequest.findOne({ tenantId, _id: args.id as string });
        if (!req) throw new AppError('NOT_FOUND', 'Leave request not found');
        if ((req as unknown as Record<string, unknown>).status !== 'PENDING') {
          throw new AppError('BAD_REQUEST', 'Can only approve PENDING requests');
        }
        return LeaveRequest.findOneAndUpdate(
          { tenantId, _id: args.id as string },
          { $set: {
            status:     'APPROVED',
            approvedBy: ctx.membership!.profileId,
            approvedAt: new Date(),
            remarks:    args.remarks as string | undefined,
          }},
          { new: true }
        ).lean();
      }

      case 'rejectLeave':
      case 'POST:/api/admin/leave/:id/reject': {
        authorize(ctx, 'comms.leave.approve');
        const req = await LeaveRequest.findOne({ tenantId, _id: args.id as string });
        if (!req) throw new AppError('NOT_FOUND', 'Leave request not found');
        if ((req as unknown as Record<string, unknown>).status !== 'PENDING') {
          throw new AppError('BAD_REQUEST', 'Can only reject PENDING requests');
        }
        return LeaveRequest.findOneAndUpdate(
          { tenantId, _id: args.id as string },
          { $set: {
            status:     'REJECTED',
            approvedBy: ctx.membership!.profileId,
            approvedAt: new Date(),
            remarks:    args.remarks as string | undefined,
          }},
          { new: true }
        ).lean();
      }

      case 'cancelLeave':
      case 'POST:/api/admin/leave/:id/cancel': {
        const req = await LeaveRequest.findOne({ tenantId, _id: args.id as string });
        if (!req) throw new AppError('NOT_FOUND', 'Leave request not found');
        if ((req as unknown as Record<string, unknown>).profileId?.toString() !== ctx.membership!.profileId) {
          throw new AppError('FORBIDDEN', 'Can only cancel your own leave');
        }
        if (!['PENDING', 'APPROVED'].includes((req as unknown as Record<string, unknown>).status as string)) {
          throw new AppError('BAD_REQUEST', 'Cannot cancel this leave request');
        }
        return LeaveRequest.findOneAndUpdate(
          { tenantId, _id: args.id as string },
          { $set: { status: 'CANCELLED' } },
          { new: true }
        ).lean();
      }

      case 'deleteLeaveRequest':
      case 'DELETE:/api/admin/leave/:id': {
        authorize(ctx, 'comms.leave.approve');
        return LeaveRequest.findOneAndDelete({ tenantId, _id: args.id as string }).lean();
      }

      default:
        throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
    }
  } catch (err) {
    if (isAppError(err)) {
      throw err;
    }
    console.error('[comms-service] unhandled error:', err);
    throw new Error('Internal server error');
  }
};
