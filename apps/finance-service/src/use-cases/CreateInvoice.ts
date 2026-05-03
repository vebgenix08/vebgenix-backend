import { AuthContext } from '@vebgenix/auth';
import { FinanceRepo, AcademicsRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';

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
}

function generateInvoiceNumber(): string {
  return `INV-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
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
      feeHeadId:   new Types.ObjectId(item.feeHeadId),
      feeHeadName: item.feeHeadName,
      amount:      item.amount,
      concession:  item.concession ?? 0,
      netAmount:   item.amount - (item.concession ?? 0),
    }));

    const totalAmount     = baseItems.reduce((s, i) => s + i.amount,    0);
    const concessionAmount = baseItems.reduce((s, i) => s + i.concession, 0);
    const netAmount        = totalAmount - concessionAmount;

    // ── Installment plan expansion via FeeSchedule ───────────────────────────
    // If a feeScheduleId is provided, create one invoice per schedule slot
    // instead of a single lump-sum invoice.  Each slot contributes a portion
    // of the total net amount (percentOfTotal) or a fixed amount (fixedAmount).
    if (input.feeScheduleId) {
      const schedules = await FinanceRepo.listFeeSchedules(tenantId, { _id: input.feeScheduleId });
      const schedule  = schedules[0];
      if (!schedule) throw new AppError('NOT_FOUND', 'Fee schedule not found');
      if (!schedule.slots || schedule.slots.length === 0) {
        throw new AppError('BAD_REQUEST', 'Fee schedule has no slots; cannot expand into installments');
      }

      // Validate: slots must sum to 100 % (if using percentOfTotal) or ≤ netAmount
      const usesPercent = schedule.slots.some((s) => s.percentOfTotal != null);
      if (usesPercent) {
        const totalPct = schedule.slots.reduce((sum, s) => sum + (s.percentOfTotal ?? 0), 0);
        if (Math.abs(totalPct - 100) > 0.01) {
          throw new AppError(
            'BAD_REQUEST',
            `Schedule slot percentages must sum to 100 (got ${totalPct.toFixed(2)}%)`,
          );
        }
      }

      const createdInvoices = [];

      for (const slot of schedule.slots) {
        // Calculate this installment's net amount
        let slotNetAmount: number;
        if (slot.percentOfTotal != null) {
          slotNetAmount = Math.round(netAmount * (slot.percentOfTotal / 100) * 100) / 100;
        } else if (slot.fixedAmount != null) {
          slotNetAmount = slot.fixedAmount;
        } else {
          // Fallback: split evenly across all slots
          slotNetAmount = Math.round((netAmount / schedule.slots.length) * 100) / 100;
        }

        // Scale base items proportionally
        const slotItems = scaleItems(baseItems, netAmount, slotNetAmount);
        const slotTotal      = slotItems.reduce((s, i) => s + i.amount,    0);
        const slotConcession = slotItems.reduce((s, i) => s + i.concession, 0);

        const invoice = await FinanceRepo.createInvoice(tenantId, {
          campusId:        new Types.ObjectId(input.campusId),
          studentId:       new Types.ObjectId(input.studentId),
          academicYearId:  new Types.ObjectId(input.academicYearId),
          invoiceNumber:   generateInvoiceNumber(),
          status:          'ISSUED',
          items:           slotItems,
          totalAmount:     slotTotal,
          concessionAmount: slotConcession,
          netAmount:       slotNetAmount,
          paidAmount:      0,
          dueAmount:       slotNetAmount,
          dueDate:         slot.dueDate,
          issuedAt:        new Date(),
          issuedBy:        new Types.ObjectId(ctx.membership!.profileId),
          installmentLabel: slot.name,        // e.g. "Term 1", "Q1 Installment"
          feeScheduleId:   new Types.ObjectId(input.feeScheduleId),
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
    const invoice = await FinanceRepo.createInvoice(tenantId, {
      campusId:        new Types.ObjectId(input.campusId),
      studentId:       new Types.ObjectId(input.studentId),
      academicYearId:  new Types.ObjectId(input.academicYearId),
      invoiceNumber:   generateInvoiceNumber(),
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
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'INVOICE_CREATED',
      entityType: 'Invoice', entityId: invoice._id.toString(),
      after: { studentId: input.studentId, netAmount },
    });

    return invoice;
  }
}
