import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';
import { PaymentService } from '../services/payment.service';
import { verifyRazorpaySignature } from '../razorpay';

/** Convert a Mongoose document or lean POJO to a plain GQL-safe object with `id`. */
function toGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const plain = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  const { _id, __v, ...rest } = plain;
  return _id !== undefined ? { id: String(_id), ...rest } : rest;
}

export async function resolvePayments(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'recordPayment':
    case 'POST:/api/admin/finance/payments': {
      const result = await PaymentService.record(
        ctx,
        tenantId,
        ((args.input as Record<string, unknown>) ?? args) as never,
      );
      return {
        payment:       toGql(result.payment),
        receiptNumber: result.receiptNumber,
        allocations:   (result.allocations as unknown[]).map(d => toGql(d)),
      };
    }

    case 'listPayments':
    case 'GET:/api/admin/finance/payments': {
      authorize(ctx, 'finance.payment.read');
      const filter: Record<string, unknown> = {};
      if (args.invoiceId) filter.invoiceId = args.invoiceId;
      if (args.studentId) filter.studentId = args.studentId;
      if (args.status) filter.status = args.status;
      if (args.campusId) filter.campusId = args.campusId;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.from || args.to) {
        const createdAt: Record<string, Date> = {};
        if (args.from) createdAt.$gte = new Date(args.from as string);
        if (args.to) createdAt.$lte = new Date(args.to as string);
        filter.createdAt = createdAt;
      }
      const docs = await FinanceRepo.listPayments(tenantId, filter);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getPayment':
    case 'GET:/api/admin/finance/payments/:id':
      authorize(ctx, 'finance.payment.read');
      return toGql(await FinanceRepo.findPaymentById(tenantId, args.id as string));

    case 'createPaymentOrder':
    case 'POST:/api/finance/payments/create-order': {
      authorize(ctx, 'finance.payment.create');
      return PaymentService.createPaymentOrder(ctx, tenantId, args.invoiceId as string, args.amount ? Number(args.amount) : undefined);
    }

    case 'verifyPaymentSignature':
    case 'POST:/api/finance/payments/verify': {
      authorize(ctx, 'finance.payment.create');
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, string>;
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = input;
      const valid = verifyRazorpaySignature(
        `${razorpayOrderId}|${razorpayPaymentId}`,
        razorpaySignature,
        process.env.RAZORPAY_KEY_SECRET ?? '',
      );
      if (!valid) throw new AppError('BAD_REQUEST', 'Invalid payment signature');
      const payment = await FinanceRepo.findPaymentByRazorpayOrderId(razorpayOrderId);
      if (!payment) throw new AppError('NOT_FOUND', 'Payment record not found');
      await PaymentService.applyOnlineSuccess(tenantId, payment._id.toString(), razorpayPaymentId, razorpaySignature);
      return { success: true, paymentId: String(payment._id) };
    }

    case 'listReceipts':
    case 'GET:/api/admin/finance/receipts': {
      authorize(ctx, 'finance.payment.read');
      const filter: Record<string, unknown> = {};
      if (args.studentId) filter.studentId = args.studentId;
      if (args.invoiceId) filter.invoiceId = args.invoiceId;
      if (args.campusId) filter.campusId = args.campusId;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.from || args.to) {
        const createdAt: Record<string, Date> = {};
        if (args.from) createdAt.$gte = new Date(args.from as string);
        if (args.to) createdAt.$lte = new Date(args.to as string);
        filter.createdAt = createdAt;
      }
      const docs = await FinanceRepo.listPayments(tenantId, { ...filter, status: 'SUCCESS', receiptNumber: { $exists: true, $ne: null } });
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getReceipt':
    case 'GET:/api/admin/finance/receipts/:id': {
      authorize(ctx, 'finance.payment.read');
      return toGql(await FinanceRepo.findPaymentById(tenantId, args.id as string));
    }

    case 'collectPaymentByStudent':
    case 'POST:/api/admin/finance/students/:studentId/collect': {
      authorize(ctx, 'finance.payment.create');
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      const studentId = (args.studentId ?? args.id) as string;
      let remaining   = input.amount as number;
      const method    = (input.method as string) ?? 'CASH';
      if (!remaining || remaining <= 0) throw new AppError('BAD_REQUEST', 'amount must be > 0');
      const invoices = await FinanceRepo.listInvoices(tenantId, {
        studentId,
        status: { $in: ['PENDING', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      });
      (invoices as { createdAt: Date }[]).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const payments = [];
      for (const inv of invoices) {
        if (remaining <= 0) break;
        const toPay = Math.min(remaining, inv.dueAmount);
        const result = await PaymentService.record(ctx, tenantId, {
          invoiceId:   inv._id.toString(),
          studentId:   inv.studentId.toString(),
          campusId:    inv.campusId.toString(),
          academicYearId: inv.academicYearId.toString(),
          amount:      toPay,
          method:      method as 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'ONLINE',
          remarks:     input.remarks as string | undefined,
        });
        payments.push(toGql(result.payment));
        remaining -= toPay;
      }
      return { payments, totalCollected: (input.amount as number) - remaining, remainingAmount: remaining };
    }

    case 'getStudentDues':
    case 'GET:/api/admin/finance/students/:studentId/dues': {
      authorize(ctx, 'finance.invoice.read');
      const studentId = (args.studentId ?? args.id) as string;
      if (!studentId || !Types.ObjectId.isValid(studentId)) {
        return { studentId: studentId ?? null, invoices: [], totalDue: 0 };
      }
      const overdueInvoices = await FinanceRepo.listInvoices(tenantId, {
        studentId: new Types.ObjectId(studentId),
        status: { $in: ['PENDING', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      });
      const totalDue = (overdueInvoices as { dueAmount: number }[]).reduce((s, i) => s + i.dueAmount, 0);
      return { studentId, invoices: (overdueInvoices as unknown[]).map(d => toGql(d)), totalDue };
    }

    default:
      return undefined;
  }
}
