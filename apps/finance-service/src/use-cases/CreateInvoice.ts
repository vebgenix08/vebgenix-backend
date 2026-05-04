import { AuthContext } from '@vebgenix/auth';
import { FinanceRepo, AcademicsRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import { generateFeeOrderId, normalizeFeePrefix } from '../numbering';

export interface InvoiceItemInput {
  feeHeadId:   string;
  feeHeadName: string;
  amount:      number;
  concession?: number;
}

export interface CreateInvoiceInput {
  studentId:       string;
  campusId:        string;
  academicYearId:  string;
  items:           InvoiceItemInput[];
  dueDate?:        string;
  /**
   * Optional: if provided, generate one invoice per schedule slot instead of
   * a single invoice.  Each slot's percentOfTotal (or fixedAmount) drives the
   * per-invoice amount; items are scaled proportionally.
   */
  feeScheduleId?:  string;
  /** Internal flag — set to true by createOneOffCharge / bulkCreateCharge routes */
  isOneOff?:       boolean;
  /** Override invoice/receipt prefix for one-off charges */
  invoicePrefix?:  string;
}

/**
 * Scale a list of invoice items so their total equals `targetNetAmount`.
 * Concession on each item is preserved; only the base amount is scaled.
 */
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
      amount:    scaledAmount,
      concession: scaledConcession,
      netAmount: scaledAmount - scaledConcession,
    };
  });
}

export class CreateInvoice {
  static async execute(ctx: AuthContext, input: CreateInvoiceInput) {
    authorize(ctx, 'finance.invoices.create');
    const tenantId = getTenantId(ctx);

    // ── Student validation ────────────────────────────────────────────────────
    const student = await AcademicsRepo.findStudentById(tenantId, input.studentId);
    if (!student) throw new AppError('NOT_FOUND', 'Student not found');

    // ── Build canonical item list ─────────────────────────────────────────────
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

    // ── Determine prefix ──────────────────────────────────────────────────────
    const prefix      = input.invoicePrefix ?? normalizeFeePrefix(input.items[0]?.feeHeadName ?? 'CHG');
    const receiptPfx  = prefix;
    const feeHeadPfx  = prefix.replace(/\//g, '_');

    // ── Installment plan expansion via FeeSchedule ───────────────────────────
    if (input.feeScheduleId) {
      const schedules = await FinanceRepo.listFeeSchedules(tenantId, { _id: input.feeScheduleId });
      const schedule  = schedules[0];
      if (!schedule) throw new AppError('NOT_FOUND', 'Fee schedule not found');
      if (!schedule.slots || schedule.slots.length === 0) {
        throw new AppError('BAD_REQUEST', 'Fee schedule has no slots; cannot expand into installments');
      }

      // Validate: slots must sum to 100 % (if using percentOfTotal)
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

        const slotBaseItems = scaleItems(baseItems, netAmount, slotNetAmount);
        const slotTotal      = slotBaseItems.reduce((s, i) => s + i.amount,    0);
        const slotConcession = slotBaseItems.reduce((s, i) => s + i.concession, 0);

        const feeOrderId = await generateFeeOrderId(tenantId, prefix, input.academicYearId);

        const invoice = await FinanceRepo.createInvoice(tenantId, {
          campusId:        new Types.ObjectId(input.campusId),
          studentId:       new Types.ObjectId(input.studentId),
          academicYearId:  new Types.ObjectId(input.academicYearId),
          classId:         student.classId,
          feeOrderId,
          feeHeadPrefix:   feeHeadPfx,
          invoiceNumber:   feeOrderId,
          status:          'ISSUED',
          items:           slotBaseItems,
          totalAmount:     slotTotal,
          concessionAmount: slotConcession,
          netAmount:       slotNetAmount,
          paidAmount:      0,
          dueAmount:       slotNetAmount,
          dueDate:         slot.dueDate,
          issuedAt:        new Date(),
          issuedBy:        new Types.ObjectId(ctx.membership!.profileId),
          installmentLabel: slot.name,
          feeScheduleId:   new Types.ObjectId(input.feeScheduleId!),
          invoicePrefix:   prefix,
          receiptPrefix:   receiptPfx,
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

    // ── Single invoice (no schedule) ─────────────────────────────────────────
    const feeOrderId = await generateFeeOrderId(tenantId, prefix, input.academicYearId);

    const invoice = await FinanceRepo.createInvoice(tenantId, {
      campusId:        new Types.ObjectId(input.campusId),
      studentId:       new Types.ObjectId(input.studentId),
      academicYearId:  new Types.ObjectId(input.academicYearId),
      classId:         student.classId,
      feeOrderId,
      feeHeadPrefix:   feeHeadPfx,
      invoiceNumber:   feeOrderId,
      status:          'ISSUED',
      items:           baseItems,
      totalAmount,
      concessionAmount,
      netAmount,
      paidAmount:      0,
      dueAmount:       netAmount,
      dueDate:         input.dueDate ? new Date(input.dueDate) : undefined,
      issuedAt:        new Date(),
      issuedBy:        new Types.ObjectId(ctx.membership!.profileId),
      invoicePrefix:   prefix,
      receiptPrefix:   receiptPfx,
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'INVOICE_CREATED',
      entityType: 'Invoice', entityId: invoice._id.toString(),
      after: { studentId: input.studentId, netAmount },
    });

    return invoice;
  }
}
