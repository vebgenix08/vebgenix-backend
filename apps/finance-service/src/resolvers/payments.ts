import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { RecordPayment } from '../use-cases/RecordPayment';
import { createRazorpayOrder, verifyRazorpaySignature } from '../razorpay';

export async function resolvePayments(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'recordPayment':
    case 'POST:/api/admin/finance/payments':
      return RecordPayment.execute(ctx, args as unknown as Parameters<typeof RecordPayment.execute>[1]);

    case 'listPayments':
    case 'GET:/api/admin/finance/payments': {
      authorize(ctx, 'finance.payment.read');
      const filter: Record<string, unknown> = {};
      if (args.invoiceId) filter.invoiceId = args.invoiceId;
      if (args.studentId) filter.studentId = args.studentId;
      if (args.status)    filter.status    = args.status;
      return FinanceRepo.listPayments(tenantId, filter);
    }

    case 'getPayment':
    case 'GET:/api/admin/finance/payments/:id':
      authorize(ctx, 'finance.payment.read');
      return FinanceRepo.findPaymentById(tenantId, args.id as string);

    case 'createPaymentOrder':
    case 'POST:/api/finance/payments/create-order': {
      authorize(ctx, 'finance.payment.create');
      const invoice = await FinanceRepo.findInvoiceById(tenantId, args.invoiceId as string);
      if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
      const amountToPay = args.amount ? Number(args.amount) : invoice.dueAmount;
      if (amountToPay <= 0) throw new AppError('BAD_REQUEST', 'Amount must be greater than 0');
      const order = await createRazorpayOrder({
        amount:   Math.round(amountToPay * 100), // paise
        currency: 'INR',
        receipt:  `inv_${invoice._id.toString().slice(-8)}`,
        notes:    { invoiceId: invoice._id.toString(), tenantId, studentId: invoice.studentId.toString() },
      });
      // Pre-create payment record in PENDING state
      const payment = await FinanceRepo.createPayment(tenantId, {
        invoiceId:       invoice._id.toString() as never,
        studentId:       invoice.studentId.toString() as never,
        amount:          amountToPay,
        method:          'ONLINE',
        status:          'PENDING',
        razorpayOrderId: order.id,
        collectedBy:     ctx.membership!.profileId as never,
      });
      return { orderId: order.id, amount: order.amount, currency: order.currency, paymentId: payment._id };
    }

    case 'verifyPaymentSignature':
    case 'POST:/api/finance/payments/verify': {
      authorize(ctx, 'finance.payment.create');
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = args as Record<string, string>;
      const valid = verifyRazorpaySignature(
        `${razorpayOrderId}|${razorpayPaymentId}`,
        razorpaySignature,
        process.env.RAZORPAY_KEY_SECRET ?? '',
      );
      if (!valid) throw new AppError('BAD_REQUEST', 'Invalid payment signature');
      const payment = await FinanceRepo.findPaymentByRazorpayOrderId(razorpayOrderId);
      if (!payment) throw new AppError('NOT_FOUND', 'Payment record not found');
      await FinanceRepo.updatePaymentStatus(payment._id.toString(), {
        status:            'SUCCESS',
        razorpayPaymentId,
        razorpaySignature,
      });
      await FinanceRepo.updateInvoicePaid(tenantId, payment.invoiceId.toString(), payment.amount);
      return { success: true, paymentId: payment._id };
    }

    case 'listReceipts':
    case 'GET:/api/admin/finance/receipts': {
      authorize(ctx, 'finance.payment.read');
      const filter: Record<string, unknown> = {};
      if (args.studentId) filter.studentId = args.studentId;
      if (args.invoiceId) filter.invoiceId = args.invoiceId;
      // Receipts = successful payments with a receipt number
      return FinanceRepo.listPayments(tenantId, { ...filter, status: 'SUCCESS', receiptNumber: { $exists: true, $ne: null } });
    }

    case 'getReceipt':
    case 'GET:/api/admin/finance/receipts/:id': {
      authorize(ctx, 'finance.payment.read');
      return FinanceRepo.findPaymentById(tenantId, args.id as string);
    }

    case 'collectPaymentByStudent':
    case 'POST:/api/admin/finance/students/:studentId/collect': {
      // Collect payment across ALL outstanding invoices for a student (oldest first)
      authorize(ctx, 'finance.payment.create');
      const studentId = (args.studentId ?? args.id) as string;
      let remaining   = args.amount as number;
      const method    = (args.method as string) ?? 'CASH';
      if (!remaining || remaining <= 0) throw new AppError('BAD_REQUEST', 'amount must be > 0');
      const invoices = await FinanceRepo.listInvoices(tenantId, {
        studentId,
        status: { $in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      });
      // Sort oldest first
      invoices.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const payments = [];
      for (const inv of invoices) {
        if (remaining <= 0) break;
        const toPay = Math.min(remaining, inv.dueAmount);
        const payment = await FinanceRepo.createPayment(tenantId, {
          invoiceId:   inv._id.toString() as never,
          studentId:   studentId as never,
          amount:      toPay,
          method:      method as never,
          status:      'SUCCESS',
          collectedBy: ctx.membership!.profileId as never,
        });
        await FinanceRepo.updateInvoicePaid(tenantId, inv._id.toString(), toPay);
        payments.push(payment);
        remaining -= toPay;
      }
      return { payments, totalCollected: (args.amount as number) - remaining, remainingAmount: remaining };
    }

    case 'getStudentDues':
    case 'GET:/api/admin/finance/students/:studentId/dues': {
      authorize(ctx, 'finance.invoice.read');
      const studentId = (args.studentId ?? args.id) as string;
      const overdueInvoices = await FinanceRepo.listInvoices(tenantId, {
        studentId,
        status: { $in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
      });
      const totalDue = overdueInvoices.reduce((s, i) => s + i.dueAmount, 0);
      return { studentId, invoices: overdueInvoices, totalDue };
    }

    default:
      return undefined;
  }
}
