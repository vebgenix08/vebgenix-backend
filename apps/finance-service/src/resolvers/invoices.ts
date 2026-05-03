import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { Types } from 'mongoose';
import type { AuthContext } from '@vebgenix/auth';
import { CreateInvoice } from '../use-cases/CreateInvoice';

export async function resolveInvoices(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listInvoices':
    case 'GET:/api/admin/finance/invoices': {
      authorize(ctx, 'finance.invoice.read');
      const filter: Record<string, unknown> = {};
      if (args.studentId) filter.studentId = args.studentId;
      if (args.status)    filter.status    = args.status;
      if (args.campusId)  filter.campusId  = args.campusId;
      return FinanceRepo.listInvoices(tenantId, filter);
    }

    case 'getInvoice':
    case 'GET:/api/admin/finance/invoices/:id':
      authorize(ctx, 'finance.invoice.read');
      return FinanceRepo.findInvoiceById(tenantId, args.id as string);

    case 'getStudentInvoices':
    case 'GET:/api/admin/finance/students/:studentId/invoices': {
      authorize(ctx, 'finance.invoice.read');
      return FinanceRepo.listInvoices(tenantId, { studentId: args.studentId });
    }

    case 'createInvoice':
    case 'POST:/api/admin/finance/invoices':
      return CreateInvoice.execute(ctx, args as unknown as Parameters<typeof CreateInvoice.execute>[1]);

    case 'updateInvoice':
    case 'PATCH:/api/admin/finance/invoices/:id': {
      authorize(ctx, 'finance.invoice.update');
      const { id, ...update } = args as Record<string, unknown>;
      return FinanceRepo.updateInvoice(tenantId, id as string, update);
    }

    case 'cancelInvoice':
    case 'POST:/api/admin/finance/invoices/:id/cancel': {
      authorize(ctx, 'finance.invoice.update');
      return FinanceRepo.updateInvoice(tenantId, args.id as string, {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: new Types.ObjectId(ctx.membership!.profileId),
        cancelReason: args.reason as string | undefined,
      });
    }

    case 'reviseInvoice':
    case 'POST:/api/admin/finance/invoices/:id/revise': {
      authorize(ctx, 'finance.invoice.update');
      const invoice = await FinanceRepo.findInvoiceById(tenantId, args.id as string);
      if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
      const previousAmount = invoice.netAmount;
      const newAmount      = args.newAmount as number;
      const difference     = newAmount - previousAmount;
      // Record revision audit trail
      await FinanceRepo.createFeeRevision(tenantId, {
        studentId:   invoice.studentId.toString(),
        invoiceId:   invoice._id.toString(),
        revisedBy:   ctx.membership!.profileId,
        previousAmount,
        newAmount,
        difference,
        reason: args.reason as string,
      });
      return FinanceRepo.updateInvoice(tenantId, args.id as string, {
        netAmount: newAmount,
        dueAmount: newAmount - invoice.paidAmount,
      });
    }

    case 'getFeeRevisions':
    case 'GET:/api/admin/finance/invoices/:id/revisions':
      authorize(ctx, 'finance.invoice.read');
      return FinanceRepo.listFeeRevisions(tenantId, { invoiceId: args.id });

    case 'createOneOffCharge':
    case 'POST:/api/admin/finance/invoices/one-off': {
      authorize(ctx, 'finance.invoice.create');
      return CreateInvoice.execute(ctx, {
        ...(args as object),
        isOneOff: true,
      } as Parameters<typeof CreateInvoice.execute>[1]);
    }

    case 'bulkCreateCharge':
    case 'POST:/api/admin/finance/invoices/bulk': {
      authorize(ctx, 'finance.invoice.create');
      const { studentIds, ...invoiceTemplate } = args as { studentIds: string[] } & Record<string, unknown>;
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw new AppError('BAD_REQUEST', 'studentIds array is required');
      }
      const results = await Promise.allSettled(
        studentIds.map((studentId) =>
          CreateInvoice.execute(ctx, { ...invoiceTemplate, studentId } as Parameters<typeof CreateInvoice.execute>[1])
        )
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed    = results.filter((r) => r.status === 'rejected').length;
      return { succeeded, failed, total: studentIds.length };
    }

    case 'generatePaymentLink':
    case 'POST:/api/admin/finance/invoices/:id/payment-link': {
      authorize(ctx, 'finance.payment.create');
      const { createRazorpayPaymentLink } = await import('../razorpay');
      const invoice = await FinanceRepo.findInvoiceById(tenantId, args.id as string);
      if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
      const amountPaise = Math.round(invoice.dueAmount * 100);
      const link = await createRazorpayPaymentLink({
        amount:      amountPaise,
        currency:    'INR',
        description: `Invoice payment - ${invoice.invoiceNumber ?? invoice._id.toString()}`,
        reference_id: invoice._id.toString(),
        customer: {
          name:  args.studentName as string | undefined,
          email: args.email       as string | undefined,
          contact: args.phone     as string | undefined,
        },
        callback_url: `${process.env.APP_BASE_URL ?? ''}/payment/callback`,
        expire_by:    Math.floor(Date.now() / 1000) + 86400, // 24h
      });
      return { paymentLink: link.short_url, linkId: link.id, expiresAt: new Date(link.expire_by * 1000) };
    }

    default:
      return undefined;
  }
}
