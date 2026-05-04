import { AuthContext } from '@vebgenix/auth';
import { FinanceRepo, FeeStructure, FeeCategory, FeeSchedule, Invoice } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types } from 'mongoose';
import { generateFeeOrderId } from '../numbering';

export interface AssignFeeStructureInput {
  studentId: string;
  feeStructureId: string;
  academicYearId: string;
  campusId: string;
  classId?: string;
  discountAmount?: number;
  discountReason?: string;
}

export class AssignFeeStructure {
  static async execute(ctx: AuthContext, input: AssignFeeStructureInput) {
    authorize(ctx, 'finance.fee_assignment.create');
    const tenantId = getTenantId(ctx);

    // ── Load fee structure ────────────────────────────────────────────────────
    const structure = await FeeStructure.findOne({
      tenantId,
      _id: new Types.ObjectId(input.feeStructureId),
      isActive: true,
    }).lean();
    if (!structure) throw new AppError('NOT_FOUND', 'Fee structure not found or inactive');

    // ── Load fee category (for prefix/allocation snapshots) ───────────────────
    let invoicePrefix = 'FEE/INV';
    let receiptPrefix = 'FEE/REC';
    let defaultAllocationMethod: 'PRO_RATA' | 'PRIORITY_WISE' | 'MANUAL' = 'PRO_RATA';

    if (structure.feeCategoryId) {
      const category = await FeeCategory.findOne({ tenantId, _id: structure.feeCategoryId }).lean();
      if (category) {
        invoicePrefix = category.invoicePrefix;
        receiptPrefix = category.receiptPrefix;
        defaultAllocationMethod = category.defaultAllocationMethod;
      }
    }

    // ── Load fee schedule (for collection rules) ───────────────────────────────
    let collectionType: 'FULL_ONLY' | 'PARTIAL_ALLOWED' | 'PARTIAL_WITH_MINIMUM_AMOUNT' | 'PARTIAL_WITH_MINIMUM_PERCENTAGE' = 'PARTIAL_ALLOWED';
    let minimumAmount = 0;
    let minimumPercentage = 0;
    let allowPartialPayment = true;
    let graceDays = 0;
    let dueDate: Date | undefined;

    if (structure.feeScheduleId) {
      const schedule = await FeeSchedule.findOne({ tenantId, _id: structure.feeScheduleId }).lean();
      if (schedule) {
        collectionType       = schedule.collectionType ?? 'PARTIAL_ALLOWED';
        minimumAmount        = schedule.minimumAmount ?? 0;
        minimumPercentage    = schedule.minimumPercentage ?? 0;
        allowPartialPayment  = schedule.allowPartialPayment ?? true;
        graceDays            = schedule.graceDays ?? 0;
        // Use first slot due date if available
        if (schedule.slots?.length > 0) {
          dueDate = schedule.slots[0].dueDate;
        }
      }
    }

    const allocationMethod = structure.allocationMethod ?? defaultAllocationMethod;

    // ── Compute amounts ────────────────────────────────────────────────────────
    const discountAmount = input.discountAmount ?? 0;
    const totalAmount    = structure.totalAmount;
    const netAmount      = totalAmount - discountAmount;

    // ── Duplicate check ────────────────────────────────────────────────────────
    const existingInvoice = await Invoice.findOne({
      tenantId,
      studentId:      new Types.ObjectId(input.studentId),
      feeStructureId: structure._id,
      academicYearId: new Types.ObjectId(input.academicYearId),
      status:         { $nin: ['CANCELLED'] },
    }).lean();
    if (existingInvoice) {
      throw new AppError('CONFLICT', 'Fee already assigned to this student for this academic year');
    }

    // ── Generate invoice number ────────────────────────────────────────────────
    const feeOrderId = await generateFeeOrderId(tenantId, invoicePrefix, input.academicYearId);

    // ── Build invoice items from structure components ──────────────────────────
    // Distribute discount pro-rata by component amount so sum(item.netAmount) === netAmount
    const items = structure.components.map((c) => {
      const itemConcession = totalAmount > 0
        ? Math.round((discountAmount * c.amount / totalAmount) * 100) / 100
        : 0;
      const itemNet = Math.round((c.amount - itemConcession) * 100) / 100;
      return {
        feeHeadId:     c.feeHeadId,
        feeHeadName:   c.feeHeadName,
        amount:        c.amount,
        concession:    itemConcession,
        netAmount:     itemNet,
        paidAmount:    0,
        balanceAmount: itemNet,
        priorityOrder: c.priorityOrder ?? 0,
      };
    });
    // Absorb any rounding remainder into the last item
    if (items.length > 0) {
      const concessionSum = Math.round(items.reduce((s, i) => s + i.concession, 0) * 100) / 100;
      const remainder = Math.round((discountAmount - concessionSum) * 100) / 100;
      if (remainder !== 0) {
        const last = items[items.length - 1];
        last.concession    = Math.round((last.concession + remainder) * 100) / 100;
        last.netAmount     = Math.round((last.amount - last.concession) * 100) / 100;
        last.balanceAmount = last.netAmount;
      }
    }

    // ── Create FeeAssignment record ────────────────────────────────────────────
    const assignment = await FinanceRepo.createFeeAssignment(tenantId, {
      studentId:      input.studentId,
      feeStructureId: input.feeStructureId,
      academicYearId: input.academicYearId,
      classId:        input.classId,
      totalAmount,
      discountAmount,
      netAmount,
      discountReason: input.discountReason,
      assignedBy:     ctx.membership!.profileId,
      status:         'ACTIVE',
    });

    // ── Create Invoice (Fee Order) ─────────────────────────────────────────────
    const invoice = await FinanceRepo.createInvoice(tenantId, {
      campusId:       new Types.ObjectId(input.campusId),
      studentId:      new Types.ObjectId(input.studentId),
      academicYearId: new Types.ObjectId(input.academicYearId),
      classId:        input.classId ? new Types.ObjectId(input.classId) : undefined,
      feeOrderId,
      feeHeadPrefix:  invoicePrefix.replace(/\//g, '_'),
      invoiceNumber:  feeOrderId,
      status:         'PENDING',
      items,
      totalAmount,
      concessionAmount: discountAmount,
      netAmount,
      paidAmount:     0,
      dueAmount:      netAmount,
      dueDate,
      issuedAt:       new Date(),
      issuedBy:       new Types.ObjectId(ctx.membership!.profileId),
      // snapshot fields
      feeCategoryId:  structure.feeCategoryId,
      feeStructureId: structure._id,
      feeScheduleId:  structure.feeScheduleId,
      allocationMethod,
      collectionType,
      minimumAmount,
      minimumPercentage,
      allowPartialPayment,
      graceDays,
      invoicePrefix,
      receiptPrefix,
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'FEE_ASSIGNED',
      entityType: 'Invoice', entityId: invoice._id.toString(),
      after: {
        studentId:      input.studentId,
        feeStructureId: input.feeStructureId,
        netAmount,
        invoiceNumber:  feeOrderId,
      },
    });

    return { assignment, invoice };
  }
}
