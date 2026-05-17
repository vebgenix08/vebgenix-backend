import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';

/** Convert a Mongoose document or lean POJO to a plain GQL-safe object with `id`. */
function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

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
      const docs = await FinanceRepo.listFeeSchedules(tenantId, filter);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'createFeeSchedule':
    case 'POST:/api/admin/finance/fee-schedules': {
      authorize(ctx, 'finance.fee_schedule.create');
      const payload = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      const { name, academicYearId, collectionType, minimumAmount, minimumPercentage } = payload;
      if (!name || !academicYearId) {
        throw new AppError('BAD_REQUEST', 'name and academicYearId are required');
      }
      if (collectionType === 'PARTIAL_WITH_MINIMUM_AMOUNT') {
        if (minimumAmount == null || (minimumAmount as number) <= 0) {
          throw new AppError('BAD_REQUEST', 'minimumAmount is required and must be > 0 when collectionType is PARTIAL_WITH_MINIMUM_AMOUNT');
        }
      }
      if (collectionType === 'PARTIAL_WITH_MINIMUM_PERCENTAGE') {
        const pct = minimumPercentage as number;
        if (pct == null || pct <= 0 || pct > 100) {
          throw new AppError('BAD_REQUEST', 'minimumPercentage must be between 1 and 100 when collectionType is PARTIAL_WITH_MINIMUM_PERCENTAGE');
        }
      }
      return toGql(await FinanceRepo.createFeeSchedule(tenantId, { ...payload, createdBy: ctx.membership?.profileId ?? ctx.userId }));
    }

    case 'updateFeeSchedule':
    case 'PATCH:/api/admin/finance/fee-schedules/:id': {
      authorize(ctx, 'finance.fee_schedule.update');
      const id = args.id as string;
      const { id: _ignored, input: _input, ...restArgs } = args as Record<string, unknown>;
      const update = (_input as Record<string, unknown>) ?? restArgs;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');
      const existing = await FinanceRepo.listFeeSchedules(tenantId, { _id: id });
      if (!existing.length) throw new AppError('NOT_FOUND', 'Fee schedule not found');
      const ct = (update.collectionType ?? (existing[0] as { collectionType?: string }).collectionType) as string | undefined;
      if (ct === 'PARTIAL_WITH_MINIMUM_AMOUNT') {
        const amt = update.minimumAmount ?? (existing[0] as { minimumAmount?: number }).minimumAmount;
        if (amt == null || (amt as number) <= 0) {
          throw new AppError('BAD_REQUEST', 'minimumAmount is required and must be > 0 when collectionType is PARTIAL_WITH_MINIMUM_AMOUNT');
        }
      }
      if (ct === 'PARTIAL_WITH_MINIMUM_PERCENTAGE') {
        const pct = update.minimumPercentage ?? (existing[0] as { minimumPercentage?: number }).minimumPercentage;
        if (pct == null || (pct as number) <= 0 || (pct as number) > 100) {
          throw new AppError('BAD_REQUEST', 'minimumPercentage must be between 1 and 100 when collectionType is PARTIAL_WITH_MINIMUM_PERCENTAGE');
        }
      }
      return toGql(await FinanceRepo.updateFeeSchedule(tenantId, id, update));
    }

    case 'deleteFeeSchedule':
    case 'DELETE:/api/admin/finance/fee-schedules/:id': {
      authorize(ctx, 'finance.fee_schedule.delete');
      const { id } = args as Record<string, string>;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');
      const existing = await FinanceRepo.listFeeSchedules(tenantId, { _id: id });
      if (!existing.length) throw new AppError('NOT_FOUND', 'Fee schedule not found');
      return toGql(await FinanceRepo.deleteFeeSchedule(tenantId, id));
    }

    case 'addScheduleSlot':
    case 'POST:/api/admin/finance/fee-schedules/:id/slots': {
      authorize(ctx, 'finance.fee_schedule.update');
      const schedule = await FinanceRepo.listFeeSchedules(tenantId, { _id: args.id });
      if (!schedule.length) throw new AppError('NOT_FOUND', 'Fee schedule not found');
      const slots = (schedule[0].slots ?? []) as object[];
      slots.push(args.slot as object ?? { dueDate: args.dueDate, amount: args.amount, label: args.label });
      return toGql(await FinanceRepo.updateFeeSchedule(tenantId, args.id as string, { slots: slots as never }));
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
      return toGql(await FinanceRepo.updateFeeSchedule(tenantId, args.id as string, { slots: slots as never }));
    }

    default:
      return undefined;
  }
}
