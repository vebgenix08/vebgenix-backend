import { FinanceRepo, AcademicsRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { getTenantId } from '@vebgenix/tenant';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';
import { safeOid, toGql } from '../shared';
import { generateFeeOrderId, normalizeFeePrefix } from '../numbering';

interface InvoiceItemInput {
  feeHeadId:   string;
  feeHeadName: string;
  amount:      number;
  concession?: number;
}

interface CreateInvoiceInput {
  studentId:       string;
  campusId:        string;
  academicYearId:  string;
  items:           InvoiceItemInput[];
  dueDate?:        string;
  feeScheduleId?:  string;
  isOneOff?:       boolean;
  invoicePrefix?:  string;
}

function scaleItems(
  items: Array<{ feeHeadId: Types.ObjectId; feeHeadName: string; amount: number; concession: number; netAmount: number }>,
  originalNetAmount: number,
  targetNetAmount: number,
): typeof items {
  if (originalNetAmount === 0) return items;
  const ratio = targetNetAmount / originalNetAmount;
  return items.map((item) => {
    const scaledAmount     = Math.round(item.amount     * ratio * 100) / 100;
    const scaledConcession = Math.round(item.concession * ratio * 100) / 100;
    return {
      ...item,
      amount:     scaledAmount,
      concession: scaledConcession,
      netAmount:  scaledAmount - scaledConcession,
    };
  });
}

async function createInvoice(ctx: AuthContext, input: CreateInvoiceInput) {
  authorize(ctx, 'finance.invoices.create');
  const tenantId = getTenantId(ctx);

  const student = await AcademicsRepo.findStudentById(tenantId, input.studentId);
  if (!student) throw new AppError('NOT_FOUND', 'Student not found');

  const baseItems = input.items.map((item) => ({
    feeHeadId:     new Types.ObjectId(item.feeHeadId),
    feeHeadName:   item.feeHeadName,
    amount:        item.amount,
    concession:    item.concession ?? 0,
    netAmount:     item.amount - (item.concession ?? 0),
    paidAmount:    0,
    balanceAmount: item.amount - (item.concession ?? 0),
    priorityOrder: 0,
  }));

  const totalAmount      = baseItems.reduce((s, i) => s + i.amount,    0);
  const concessionAmount = baseItems.reduce((s, i) => s + i.concession, 0);
  const netAmount        = totalAmount - concessionAmount;

  const prefix     = input.invoicePrefix ?? normalizeFeePrefix(input.items[0]?.feeHeadName ?? 'CHG');
  const receiptPfx = prefix;
  const feeHeadPfx = prefix.replace(/\//g, '_');

  // ── Installment expansion via FeeSchedule ─────────────────────────────────
  if (input.feeScheduleId) {
    const schedules = await FinanceRepo.listFeeSchedules(tenantId, { _id: input.feeScheduleId });
    const schedule  = schedules[0];
    if (!schedule) throw new AppError('NOT_FOUND', 'Fee schedule not found');
    if (!schedule.slots || schedule.slots.length === 0) {
      throw new AppError('BAD_REQUEST', 'Fee schedule has no slots; cannot expand into installments');
    }

    const usesPercent = (schedule.slots as { percentOfTotal?: number }[]).some((s) => s.percentOfTotal != null);
    if (usesPercent) {
      const totalPct = (schedule.slots as { percentOfTotal?: number }[]).reduce((sum, s) => sum + (s.percentOfTotal ?? 0), 0);
      if (Math.abs(totalPct - 100) > 0.01) {
        throw new AppError(
          'BAD_REQUEST',
          `Schedule slot percentages must sum to 100 (got ${totalPct.toFixed(2)}%)`,
        );
      }
    }

    const createdInvoices = [];

    for (const slot of schedule.slots) {
      let slotNetAmount: number;
      if (slot.percentOfTotal != null) {
        slotNetAmount = Math.round(netAmount * (slot.percentOfTotal / 100) * 100) / 100;
      } else if (slot.fixedAmount != null) {
        slotNetAmount = slot.fixedAmount;
      } else {
        slotNetAmount = Math.round((netAmount / schedule.slots.length) * 100) / 100;
      }

      const slotBaseItems  = scaleItems(baseItems, netAmount, slotNetAmount);
      const slotTotal      = slotBaseItems.reduce((s, i) => s + i.amount,    0);
      const slotConcession = slotBaseItems.reduce((s, i) => s + i.concession, 0);

      const feeOrderId = await generateFeeOrderId(tenantId, prefix, input.academicYearId);

      const invoice = await FinanceRepo.createInvoice(tenantId, {
        campusId:         new Types.ObjectId(input.campusId),
        studentId:        new Types.ObjectId(input.studentId),
        academicYearId:   new Types.ObjectId(input.academicYearId),
        classId:          student.classId,
        feeOrderId,
        feeHeadPrefix:    feeHeadPfx,
        invoiceNumber:    feeOrderId,
        status:           'ISSUED',
        items:            slotBaseItems,
        totalAmount:      slotTotal,
        concessionAmount: slotConcession,
        netAmount:        slotNetAmount,
        paidAmount:       0,
        dueAmount:        slotNetAmount,
        dueDate:          slot.dueDate,
        issuedAt:         new Date(),
        issuedBy:         safeOid(ctx.membership?.profileId ?? ctx.userId),
        installmentLabel: slot.name,
        feeScheduleId:    new Types.ObjectId(input.feeScheduleId!),
        invoicePrefix:    prefix,
        receiptPrefix:    receiptPfx,
      });

      await AuditLogger.logTenantAction({
        ctx, action: 'INVOICE_CREATED',
        entityType: 'Invoice', entityId: invoice._id.toString(),
        after: { studentId: input.studentId, netAmount: slotNetAmount, installmentLabel: slot.name },
      });

      createdInvoices.push(invoice);
    }

    return { installments: createdInvoices, count: createdInvoices.length, totalNetAmount: netAmount };
  }

  // ── Single invoice ────────────────────────────────────────────────────────
  const feeOrderId = await generateFeeOrderId(tenantId, prefix, input.academicYearId);

  const invoice = await FinanceRepo.createInvoice(tenantId, {
    campusId:         new Types.ObjectId(input.campusId),
    studentId:        new Types.ObjectId(input.studentId),
    academicYearId:   new Types.ObjectId(input.academicYearId),
    classId:          student.classId,
    feeOrderId,
    feeHeadPrefix:    feeHeadPfx,
    invoiceNumber:    feeOrderId,
    status:           'ISSUED',
    items:            baseItems,
    totalAmount,
    concessionAmount,
    netAmount,
    paidAmount:       0,
    dueAmount:        netAmount,
    dueDate:          input.dueDate ? new Date(input.dueDate) : undefined,
    issuedAt:         new Date(),
    issuedBy:         safeOid(ctx.membership?.profileId ?? ctx.userId),
    invoicePrefix:    prefix,
    receiptPrefix:    receiptPfx,
  });

  await AuditLogger.logTenantAction({
    ctx, action: 'INVOICE_CREATED',
    entityType: 'Invoice', entityId: invoice._id.toString(),
    after: { studentId: input.studentId, netAmount },
  });

  return invoice;
}

export async function handleInvoice(
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
      if (args.studentId)      filter.studentId      = args.studentId;
      if (args.status)         filter.status         = args.status;
      if (args.campusId)       filter.campusId       = args.campusId;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      const docs = await FinanceRepo.listInvoices(tenantId, filter);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getInvoice':
    case 'GET:/api/admin/finance/invoices/:id':
      authorize(ctx, 'finance.invoice.read');
      return toGql(await FinanceRepo.findInvoiceById(tenantId, args.id as string));

    case 'getStudentInvoices':
    case 'GET:/api/admin/finance/students/:studentId/invoices': {
      authorize(ctx, 'finance.invoice.read');
      const docs = await FinanceRepo.listInvoices(tenantId, { studentId: args.studentId });
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'createInvoice':
    case 'POST:/api/admin/finance/invoices':
      throw new AppError('BAD_REQUEST', 'Direct invoice creation is not allowed. Use createFeeAssignment or createOneOffCharge.');

    case 'updateInvoice':
    case 'PATCH:/api/admin/finance/invoices/:id': {
      authorize(ctx, 'finance.invoice.update');
      const update = { ...(((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>) };
      delete update.id;
      return toGql(await FinanceRepo.updateInvoice(tenantId, args.id as string, update));
    }

    case 'cancelInvoice':
    case 'POST:/api/admin/finance/invoices/:id/cancel': {
      authorize(ctx, 'finance.invoice.update');
      return toGql(await FinanceRepo.updateInvoice(tenantId, args.id as string, {
        status:       'CANCELLED',
        cancelledAt:  new Date(),
        cancelledBy:  safeOid(ctx.membership?.profileId ?? ctx.userId),
        cancelReason: args.reason as string | undefined,
      }));
    }

    case 'reviseInvoice':
    case 'POST:/api/admin/finance/invoices/:id/revise': {
      authorize(ctx, 'finance.invoice.update');
      const invoice = await FinanceRepo.findInvoiceById(tenantId, args.id as string);
      if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
      const input          = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      const previousAmount = invoice.netAmount;
      const newAmount      = input.newAmount as number;
      const difference     = newAmount - previousAmount;
      await FinanceRepo.createFeeRevision(tenantId, {
        studentId:       invoice.studentId.toString(),
        invoiceId:       invoice._id.toString(),
        revisedBy:       ctx.membership?.profileId ?? ctx.userId,
        previousAmount,
        newAmount,
        difference,
        reason: input.reason as string,
      });
      return toGql(await FinanceRepo.updateInvoice(tenantId, args.id as string, {
        netAmount: newAmount,
        dueAmount: newAmount - invoice.paidAmount,
      }));
    }

    case 'getFeeRevisions':
    case 'GET:/api/admin/finance/invoices/:id/revisions': {
      authorize(ctx, 'finance.invoice.read');
      const docs = await FinanceRepo.listFeeRevisions(tenantId, { invoiceId: args.id });
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'createOneOffCharge':
    case 'POST:/api/admin/finance/invoices/one-off': {
      authorize(ctx, 'finance.invoice.create');
      const result = await createInvoice(ctx, {
        ...(((args.input as Record<string, unknown>) ?? args) as object),
        isOneOff: true,
      } as CreateInvoiceInput);
      return toGql(result);
    }

    case 'bulkCreateCharge':
    case 'POST:/api/admin/finance/invoices/bulk': {
      authorize(ctx, 'finance.invoice.create');
      const input = ((args.input as Record<string, unknown>) ?? args) as { studentIds: string[] } & Record<string, unknown>;
      const { studentIds, ...invoiceTemplate } = input;
      if (!Array.isArray(studentIds) || studentIds.length === 0) {
        throw new AppError('BAD_REQUEST', 'studentIds array is required');
      }
      const results = await Promise.allSettled(
        studentIds.map((studentId) =>
          createInvoice(ctx, { ...invoiceTemplate, studentId } as CreateInvoiceInput)
        )
      );
      const succeeded = results.filter((r) => r.status === 'fulfilled').length;
      const failed    = results.filter((r) => r.status === 'rejected').length;
      return { succeeded, failed, total: studentIds.length };
    }

    case 'generatePaymentLink':
    case 'POST:/api/admin/finance/invoices/:id/payment-link': {
      authorize(ctx, 'finance.payment.create');
      const { createRazorpayPaymentLink } = await import('../razorpay.js');
      const invoice = await FinanceRepo.findInvoiceById(tenantId, args.id as string);
      if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
      const amountPaise = Math.round(invoice.dueAmount * 100);
      const link = await createRazorpayPaymentLink({
        amount:      amountPaise,
        currency:    'INR',
        description: `Invoice payment - ${invoice.invoiceNumber ?? invoice._id.toString()}`,
        reference_id: invoice._id.toString(),
        customer: {
          name:    args.studentName as string | undefined,
          email:   args.email       as string | undefined,
          contact: args.phone       as string | undefined,
        },
        callback_url: `${process.env.APP_BASE_URL ?? ''}/payment/callback`,
        expire_by:    Math.floor(Date.now() / 1000) + 86400,
      });
      return { paymentLink: link.short_url, linkId: link.id, expiresAt: new Date(link.expire_by * 1000) };
    }

    default:
      return undefined;
  }
}
