import { LeaveRequest } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { toGql } from '../comms-utils';

export async function handleLeaveRequests(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listLeaveRequests':
    case 'GET:/api/admin/leave': {
      authorize(ctx, 'comms.leave.read');
      const filter: Record<string, unknown> = { tenantId };
      if (args.status) filter.status = args.status;
      if (args.profileId) filter.profileId = args.profileId;
      if (args.leaveType) filter.leaveType = args.leaveType;
      if (!ctx.membership?.roles?.some(r => r.roleName === 'ADMIN') && !ctx.isPlatformAdmin) {
        filter.profileId = ctx.membership!.profileId;
      }
      const docs = await LeaveRequest.find(filter).sort({ createdAt: -1 }).lean();
      return docs.map(d => toGql(d));
    }
    case 'getLeaveRequest':
    case 'GET:/api/admin/leave/:id': {
      authorize(ctx, 'comms.leave.read');
      const req = await LeaveRequest.findOne({ tenantId, _id: args.id as string }).lean();
      if (!req) throw new AppError('NOT_FOUND', 'Leave request not found');
      const isAdmin = ctx.isPlatformAdmin || ctx.membership?.roles?.some(r => r.roleName === 'ADMIN');
      if (!isAdmin && (req as unknown as Record<string, unknown>).profileId?.toString() !== ctx.membership!.profileId) {
        throw new AppError('FORBIDDEN', 'Cannot view another staff member\'s leave request');
      }
      return toGql(req);
    }
    case 'createLeaveRequest':
    case 'POST:/api/admin/leave': {
      const input = args.input as Record<string, unknown> ?? args;
      const doc = await LeaveRequest.create({
        ...input,
        tenantId,
        profileId: input.profileId ?? ctx.membership?.profileId,
        status: 'PENDING',
        appliedAt: new Date(),
      });
      return toGql(doc.toObject());
    }
    case 'updateLeaveRequest':
    case 'PATCH:/api/admin/leave/:id': {
      const { id, input: leaveInput, ...restLeave } = args as Record<string, unknown>;
      const update = (leaveInput as Record<string, unknown>) ?? restLeave;
      const req = await LeaveRequest.findOne({ tenantId, _id: id as string });
      if (!req) throw new AppError('NOT_FOUND', 'Leave request not found');
      if ((req as unknown as Record<string, unknown>).profileId?.toString() !== ctx.membership!.profileId) {
        throw new AppError('FORBIDDEN', 'Cannot edit another staff member\'s leave request');
      }
      if ((req as unknown as Record<string, unknown>).status !== 'PENDING') {
        throw new AppError('BAD_REQUEST', 'Can only edit PENDING requests');
      }
      return toGql(await LeaveRequest.findOneAndUpdate({ tenantId, _id: id as string }, { $set: update }, { new: true }).lean());
    }
    case 'approveLeave':
    case 'POST:/api/admin/leave/:id/approve': {
      authorize(ctx, 'comms.leave.approve');
      const req = await LeaveRequest.findOne({ tenantId, _id: args.id as string });
      if (!req) throw new AppError('NOT_FOUND', 'Leave request not found');
      if ((req as unknown as Record<string, unknown>).status !== 'PENDING') {
        throw new AppError('BAD_REQUEST', 'Can only approve PENDING requests');
      }
      return toGql(await LeaveRequest.findOneAndUpdate({ tenantId, _id: args.id as string }, { $set: { status: 'APPROVED', approvedBy: ctx.membership!.profileId, approvedAt: new Date(), remarks: args.remarks as string | undefined } }, { new: true }).lean());
    }
    case 'rejectLeave':
    case 'POST:/api/admin/leave/:id/reject': {
      authorize(ctx, 'comms.leave.approve');
      const req = await LeaveRequest.findOne({ tenantId, _id: args.id as string });
      if (!req) throw new AppError('NOT_FOUND', 'Leave request not found');
      if ((req as unknown as Record<string, unknown>).status !== 'PENDING') {
        throw new AppError('BAD_REQUEST', 'Can only reject PENDING requests');
      }
      return toGql(await LeaveRequest.findOneAndUpdate({ tenantId, _id: args.id as string }, { $set: { status: 'REJECTED', approvedBy: ctx.membership!.profileId, approvedAt: new Date(), remarks: args.remarks as string | undefined } }, { new: true }).lean());
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
      return toGql(await LeaveRequest.findOneAndUpdate({ tenantId, _id: args.id as string }, { $set: { status: 'CANCELLED' } }, { new: true }).lean());
    }
    case 'deleteLeaveRequest':
    case 'DELETE:/api/admin/leave/:id': {
      authorize(ctx, 'comms.leave.approve');
      return toGql(await LeaveRequest.findOneAndDelete({ tenantId, _id: args.id as string }).lean());
    }
    default:
      return undefined;
  }
}
