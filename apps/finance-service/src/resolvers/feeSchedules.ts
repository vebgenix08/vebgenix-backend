import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

export async function resolveFeeSchedules(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listFeeSchedules':
    case 'GET:/api/admin/finance/fee-schedules': {
      authorize(ctx, 'finance.fee_schedule.read');
      const filter: Record<string, unknown> = {};
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.feeStructureId) filter.feeStructureId = args.feeStructureId;
      return FinanceRepo.listFeeSchedules(tenantId, filter);
    }

    case 'createFeeSchedule':
    case 'POST:/api/admin/finance/fee-schedules': {
      authorize(ctx, 'finance.fee_schedule.create');
      return FinanceRepo.createFeeSchedule(tenantId, { ...args as object, createdBy: ctx.membership!.profileId });
    }

    case 'updateFeeSchedule':
    case 'PATCH:/api/admin/finance/fee-schedules/:id': {
      authorize(ctx, 'finance.fee_schedule.update');
      const { id, ...update } = args as Record<string, unknown>;
      return FinanceRepo.updateFeeSchedule(tenantId, id as string, update);
    }

    case 'deleteFeeSchedule':
    case 'DELETE:/api/admin/finance/fee-schedules/:id':
      authorize(ctx, 'finance.fee_schedule.delete');
      return FinanceRepo.deleteFeeSchedule(tenantId, args.id as string);

    case 'addScheduleSlot':
    case 'POST:/api/admin/finance/fee-schedules/:id/slots': {
      authorize(ctx, 'finance.fee_schedule.update');
      const schedule = await FinanceRepo.listFeeSchedules(tenantId, { _id: args.id });
      if (!schedule.length) throw new AppError('NOT_FOUND', 'Fee schedule not found');
      const slots = (schedule[0].slots ?? []) as object[];
      slots.push(args.slot as object ?? { dueDate: args.dueDate, amount: args.amount, label: args.label });
      return FinanceRepo.updateFeeSchedule(tenantId, args.id as string, { slots: slots as never });
    }

    case 'deleteScheduleSlot':
    case 'DELETE:/api/admin/finance/fee-schedules/:id/slots/:slotIndex': {
      authorize(ctx, 'finance.fee_schedule.update');
      const schedule = await FinanceRepo.listFeeSchedules(tenantId, { _id: args.id });
      if (!schedule.length) throw new AppError('NOT_FOUND', 'Fee schedule not found');
      const slots   = (schedule[0].slots ?? []) as object[];
      const idx     = parseInt(args.slotIndex as string, 10);
      if (idx < 0 || idx >= slots.length) throw new AppError('BAD_REQUEST', 'Invalid slot index');
      slots.splice(idx, 1);
      return FinanceRepo.updateFeeSchedule(tenantId, args.id as string, { slots: slots as never });
    }

    default:
      return undefined;
  }
}
