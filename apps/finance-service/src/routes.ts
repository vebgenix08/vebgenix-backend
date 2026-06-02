import type { AuthContext } from '@vebgenix/auth';
import { AppError } from '@vebgenix/errors';
import { handleFeeHead } from './use-cases/fee-head';
import { handleFeeSchedule } from './use-cases/fee-schedule';
import { handleFeeStructure } from './use-cases/fee-structure';
import { handleFeeStructureMapping } from './use-cases/fee-structure-mapping';
import { handleFeeAssignment } from './use-cases/fee-assignment';
import { handleInvoice } from './use-cases/invoice';
import { handlePayment } from './use-cases/payment';
import { handleStudentOrder } from './use-cases/student-order';
import { handleTransaction } from './use-cases/transaction';

export async function handleFinanceRoute(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  let result: unknown;

  result = await handleFeeHead(operation, args, ctx, tenantId);
  if (result !== undefined) return result;

  result = await handleFeeStructure(operation, args, ctx, tenantId);
  if (result !== undefined) return result;

  result = await handleFeeStructureMapping(operation, args, ctx, tenantId);
  if (result !== undefined) return result;

  result = await handleFeeAssignment(operation, args, ctx, tenantId);
  if (result !== undefined) return result;

  result = await handleFeeSchedule(operation, args, ctx, tenantId);
  if (result !== undefined) return result;

  result = await handleInvoice(operation, args, ctx, tenantId);
  if (result !== undefined) return result;

  result = await handlePayment(operation, args, ctx, tenantId);
  if (result !== undefined) return result;

  result = await handleStudentOrder(operation, args, ctx, tenantId);
  if (result !== undefined) return result;

  result = await handleTransaction(operation, args, ctx, tenantId);
  if (result !== undefined) return result;

  throw new AppError('NOT_FOUND', `Unknown operation: ${operation}`);
}
