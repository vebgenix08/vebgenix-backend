import { AuthContext } from '@vebgenix/auth';
import { FinanceRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';

export interface RecordPaymentInput {
  invoiceId: string;
  studentId: string;
  campusId: string;
  amount: number;
  method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'ONLINE';
  referenceNumber?: string;
  remarks?: string;
}

function generateReceiptNumber(): string {
  return `RCP-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
}

export class RecordPayment {
  static async execute(ctx: AuthContext, input: RecordPaymentInput) {
    authorize(ctx, 'finance.payments.record');
    const tenantId = getTenantId(ctx);

    const invoice = await FinanceRepo.findInvoiceById(tenantId, input.invoiceId);
    if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
    if (invoice.status === 'PAID') throw new AppError('CONFLICT', 'Invoice is already fully paid');
    if (invoice.status === 'CANCELLED') throw new AppError('CONFLICT', 'Invoice is cancelled');
    if (input.amount > invoice.dueAmount) {
      throw new AppError('BAD_REQUEST', `Payment amount exceeds due amount (${invoice.dueAmount})`);
    }

    const payment = await FinanceRepo.createPayment(tenantId, {
      campusId:        new Types.ObjectId(input.campusId),
      studentId:       new Types.ObjectId(input.studentId),
      invoiceId:       new Types.ObjectId(input.invoiceId),
      receiptNumber:   generateReceiptNumber(),
      amount:          input.amount,
      method:          input.method,
      status:          'SUCCESS',
      referenceNumber: input.referenceNumber,
      remarks:         input.remarks,
      paidAt:          new Date(),
      collectedBy:     new Types.ObjectId(ctx.membership!.profileId),
    });

    await FinanceRepo.updateInvoicePaid(tenantId, input.invoiceId, input.amount);

    await AuditLogger.logTenantAction({
      ctx, action: 'PAYMENT_RECORDED',
      entityType: 'Payment', entityId: payment._id.toString(),
      after: { invoiceId: input.invoiceId, amount: input.amount, method: input.method },
    });

    return payment;
  }
}
