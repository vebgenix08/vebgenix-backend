import { FinanceRepo, IFeeAssignment, IFeeSchedule, IFeeStructure, IFeeStructureClassMapping } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';
import { buildAmountsByRatio, roundMoney, safeOid, validatePercentTotal } from '../finance-utils';
import { generateFeeOrderId } from '../numbering';

interface GenerateOrdersInput {
  assignment: IFeeAssignment;
  structure: IFeeStructure;
  schedule: IFeeSchedule;
  mapping: IFeeStructureClassMapping;
  studentId: string;
  campusId: string;
  academicYearId: string;
  classId: string;
  sectionId?: string;
}

type OrderDoc = {
  tenant_id: Types.ObjectId;
  campus_id: Types.ObjectId;
  academic_year_id: Types.ObjectId;
  student_id: Types.ObjectId;
  class_id: Types.ObjectId;
  section_id?: Types.ObjectId;
  fee_schedule_id: Types.ObjectId;
  fee_structure_id: Types.ObjectId;
  fee_structure_class_mapping_id: Types.ObjectId;
  order_no: string;
  installment_no: number;
  installment_title: string;
  due_date: Date;
  fee_heads: Array<{
    fee_head_id: Types.ObjectId;
    fee_head_name: string;
    original_amount: number;
    concession_amount: number;
    late_fee_amount: number;
    paid_amount: number;
    balance_amount: number;
    final_amount: number;
    status: 'PENDING' | 'PARTIAL' | 'PAID';
  }>;
  gross_amount: number;
  concession_amount: number;
  late_fee_amount: number;
  payable_amount: number;
  paid_amount: number;
  balance_amount: number;
  payment_completion_percentage: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';
  payment_status: 'UNPAID' | 'PARTIAL' | 'PAID';
  generated_at: Date;
  remarks: string | null;
  metadata: Record<string, unknown>;
  created_by: Types.ObjectId;
  updated_by?: Types.ObjectId;
};

// Exported so feeStructure.ts can import it for assignFeeStructureToStudent
export class StudentFeeOrderService {
  static async list(tenantId: string, studentId: string) {
    return FinanceRepo.getStudentOrders(tenantId, studentId);
  }

  static async getById(tenantId: string, id: string) {
    return FinanceRepo.getStudentOrderById(tenantId, id);
  }

  static async createManual(_tenantId: string, doc: Record<string, unknown>) {
    return FinanceRepo.createStudentOrder(doc);
  }

  static async update(tenantId: string, id: string, payload: Record<string, unknown>) {
    return FinanceRepo.updateStudentOrder(tenantId, id, payload);
  }

  static async cancel(tenantId: string, id: string) {
    return FinanceRepo.cancelStudentOrder(tenantId, id);
  }

  static async markPaid(tenantId: string, orderId: string, paidAmount: number) {
    return FinanceRepo.updateOrderPayment(tenantId, orderId, paidAmount);
  }

  static async markOverdue(tenantId: string, orderId: string) {
    return FinanceRepo.updateStudentOrder(tenantId, orderId, { status: 'OVERDUE' });
  }

  static async generateFromAssignment(
    ctx: AuthContext,
    tenantId: string,
    input: GenerateOrdersInput,
  ) {
    if (!input.schedule.slots?.length) {
      throw new AppError('BAD_REQUEST', 'Fee schedule has no installments');
    }

    validatePercentTotal(input.schedule.slots);

    const existingOrders = await FinanceRepo.listStudentOrders({
      tenant_id: tenantId,
      'metadata.assignmentId': input.assignment._id.toString(),
    });
    if ((existingOrders as unknown[]).length > 0) {
      return existingOrders;
    }

    const orderDocs: OrderDoc[] = [];
    const totalNet = roundMoney(input.assignment.netAmount);
    const installmentAmounts = input.schedule.slots.map((slot: { percentOfTotal?: number; fixedAmount?: number }) => {
      if (slot.percentOfTotal != null) {
        return roundMoney(totalNet * (slot.percentOfTotal / 100));
      }
      if (slot.fixedAmount != null) {
        return roundMoney(slot.fixedAmount);
      }
      return roundMoney(totalNet / input.schedule.slots.length);
    });

    const assignedBy = safeOid(ctx.membership?.profileId ?? ctx.userId);
    const feeHeadSnapshots = input.structure.components.map((component: { feeHeadId: Types.ObjectId; feeHeadName: string; amount: number; priorityOrder?: number }) => ({
      feeHeadId:     component.feeHeadId,
      feeHeadName:   component.feeHeadName,
      amount:        roundMoney(component.amount),
      concession:    0,
      netAmount:     roundMoney(component.amount),
      priorityOrder: component.priorityOrder ?? 0,
    }));

    for (let index = 0; index < input.schedule.slots.length; index++) {
      const slot           = input.schedule.slots[index];
      const payableAmount  = roundMoney(installmentAmounts[index]);
      const ratios         = input.structure.components.map((component: { amount: number }) => component.amount);
      const componentAmounts = buildAmountsByRatio(payableAmount, ratios);

      const feeHeads = input.structure.components.map((component: { feeHeadId: Types.ObjectId; feeHeadName: string; amount: number }, componentIndex: number) => {
        const originalAmount = roundMoney(component.amount);
        const finalAmount    = roundMoney(componentAmounts[componentIndex]);
        return {
          fee_head_id:       component.feeHeadId,
          fee_head_name:     component.feeHeadName,
          original_amount:   originalAmount,
          concession_amount: roundMoney(originalAmount - finalAmount),
          late_fee_amount:   0,
          paid_amount:       0,
          balance_amount:    finalAmount,
          final_amount:      finalAmount,
          status:            'PENDING' as const,
        };
      });

      const orderNo         = await generateFeeOrderId(tenantId, 'FEE', input.academicYearId);
      const grossAmount     = roundMoney(feeHeads.reduce((sum: number, item: { original_amount: number }) => sum + item.original_amount, 0));
      const concessionAmount = roundMoney(feeHeads.reduce((sum: number, item: { concession_amount: number }) => sum + item.concession_amount, 0));
      const payable         = roundMoney(feeHeads.reduce((sum: number, item: { final_amount: number }) => sum + item.final_amount, 0));

      orderDocs.push({
        tenant_id:                      tenantId as unknown as import('mongoose').Types.ObjectId,
        campus_id:                      new Types.ObjectId(input.campusId),
        academic_year_id:               new Types.ObjectId(input.academicYearId),
        student_id:                     new Types.ObjectId(input.studentId),
        class_id:                       new Types.ObjectId(input.classId),
        section_id:                     input.sectionId ? new Types.ObjectId(input.sectionId) : undefined,
        fee_schedule_id:                input.schedule._id,
        fee_structure_id:               input.structure._id,
        fee_structure_class_mapping_id: input.mapping._id,
        order_no:                       orderNo,
        installment_no:                 index + 1,
        installment_title:              slot.name,
        due_date:                       new Date(slot.dueDate),
        fee_heads:                      feeHeads,
        gross_amount:                   grossAmount,
        concession_amount:              concessionAmount,
        late_fee_amount:                0,
        payable_amount:                 payable,
        paid_amount:                    0,
        balance_amount:                 payable,
        payment_completion_percentage:  0,
        status:                         'PENDING',
        payment_status:                 'UNPAID',
        generated_at:                   new Date(),
        remarks:                        null,
        metadata: {
          assignmentId:    input.assignment._id.toString(),
          feeHeadSnapshot: feeHeadSnapshots,
        },
        created_by: assignedBy,
        updated_by: assignedBy,
      });
    }

    const created = await FinanceRepo.bulkCreateStudentOrders(orderDocs);
    return created;
  }

  static async generateFromMapping(
    ctx: AuthContext,
    tenantId: string,
    input: {
      feeStructureId: string;
      feeScheduleId: string;
      classId: string;
      academicYearId: string;
      campusId: string;
      mappingId: string;
    },
  ): Promise<{ generatedCount: number; skippedCount: number }> {
    const structure = await FinanceRepo.findFeeStructureById(tenantId, input.feeStructureId);
    if (!structure) throw new AppError('NOT_FOUND', 'Fee structure not found');

    const schedule = await FinanceRepo.findFeeScheduleById(tenantId, input.feeScheduleId);
    if (!schedule) throw new AppError('NOT_FOUND', 'Fee schedule not found');

    const slots: Array<{ name: string; dueDate: Date; percentOfTotal?: number; fixedAmount?: number }> =
      (schedule.slots ?? []).length > 0
        ? schedule.slots
        : [{ name: 'Full Payment', dueDate: new Date(), percentOfTotal: 100 }];

    const { Student } = await import('@vebgenix/db');
    const students = await Student.find({ tenantId, classId: new Types.ObjectId(input.classId), status: 'ACTIVE' }).lean();

    const assignedBy = safeOid(ctx.membership?.profileId ?? ctx.userId);
    const orderDocs: OrderDoc[] = [];
    let skippedCount = 0;

    for (const student of students) {
      // Skip student only if they already have orders for this exact schedule+structure combo
      const existing = await FinanceRepo.listStudentOrders({
        tenant_id:        tenantId,
        student_id:       new Types.ObjectId(student._id.toString()),
        fee_schedule_id:  new Types.ObjectId(input.feeScheduleId),
        fee_structure_id: new Types.ObjectId(input.feeStructureId),
      });
      if ((existing as unknown[]).length > 0) { skippedCount++; continue; }

      const totalNet = roundMoney((structure as IFeeStructure).totalAmount);
      const installmentAmounts = slots.map(slot => {
        if (slot.percentOfTotal != null) return roundMoney(totalNet * (slot.percentOfTotal / 100));
        if (slot.fixedAmount != null)    return roundMoney(slot.fixedAmount);
        return roundMoney(totalNet / slots.length);
      });

      for (let i = 0; i < slots.length; i++) {
        const slot           = slots[i];
        const payableAmount  = installmentAmounts[i];
        const ratios         = (structure as IFeeStructure).components.map((c: { amount: number }) => c.amount);
        const componentAmts  = buildAmountsByRatio(payableAmount, ratios);

        const feeHeads = (structure as IFeeStructure).components.map((c, ci) => {
          const originalAmount = roundMoney(c.amount);
          const finalAmount    = roundMoney(componentAmts[ci]);
          return {
            fee_head_id:       c.feeHeadId,
            fee_head_name:     c.feeHeadName,
            original_amount:   originalAmount,
            concession_amount: roundMoney(originalAmount - finalAmount),
            late_fee_amount:   0,
            paid_amount:       0,
            balance_amount:    finalAmount,
            final_amount:      finalAmount,
            status:            'PENDING' as const,
          };
        });

        const grossAmount      = roundMoney(feeHeads.reduce((s, h) => s + h.original_amount, 0));
        const concessionAmount = roundMoney(feeHeads.reduce((s, h) => s + h.concession_amount, 0));
        const payable          = roundMoney(feeHeads.reduce((s, h) => s + h.final_amount, 0));
        const orderNo          = await generateFeeOrderId(tenantId, 'FEE', input.academicYearId);

        orderDocs.push({
          tenant_id:                      tenantId as unknown as Types.ObjectId,
          campus_id:                      new Types.ObjectId(input.campusId),
          academic_year_id:               new Types.ObjectId(input.academicYearId),
          student_id:                     new Types.ObjectId(student._id.toString()),
          class_id:                       new Types.ObjectId(input.classId),
          section_id:                     student.sectionId ? new Types.ObjectId(student.sectionId.toString()) : undefined,
          fee_schedule_id:                new Types.ObjectId(input.feeScheduleId),
          fee_structure_id:               new Types.ObjectId(input.feeStructureId),
          fee_structure_class_mapping_id: new Types.ObjectId(input.mappingId),
          order_no:                       orderNo,
          installment_no:                 i + 1,
          installment_title:              slot.name,
          due_date:                       new Date(slot.dueDate),
          fee_heads:                      feeHeads,
          gross_amount:                   grossAmount,
          concession_amount:              concessionAmount,
          late_fee_amount:                0,
          payable_amount:                 payable,
          paid_amount:                    0,
          balance_amount:                 payable,
          payment_completion_percentage:  0,
          status:                         'PENDING',
          payment_status:                 'UNPAID',
          generated_at:                   new Date(),
          remarks:                        null,
          metadata:                       { source: 'class_mapping', scheduleSlotIndex: i },
          created_by:                     assignedBy,
          updated_by:                     assignedBy,
        });
      }
    }

    if (orderDocs.length === 0) return { generatedCount: 0, skippedCount };
    const created = await FinanceRepo.bulkCreateStudentOrders(orderDocs);
    return { generatedCount: (created as unknown[]).length, skippedCount };
  }

  static async listOutstanding(tenantId: string, filters: { studentId?: string; classId?: string; academicYearId?: string } = {}) {
    const query: Record<string, unknown> = {
      tenant_id: tenantId,
      status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
    };
    if (filters.studentId)    query.student_id       = new Types.ObjectId(filters.studentId);
    if (filters.classId)      query.class_id         = new Types.ObjectId(filters.classId);
    if (filters.academicYearId) query.academic_year_id = new Types.ObjectId(filters.academicYearId);
    return FinanceRepo.listStudentOrders(query);
  }
}

function feeOrderToGql(doc: unknown): Record<string, unknown> | null {
  if (!doc) return null;
  const d = JSON.parse(JSON.stringify(doc)) as Record<string, unknown>;
  return {
    id:                           String(d._id ?? d.id),
    tenantId:                     d.tenant_id,
    campusId:                     String(d.campus_id ?? ''),
    academicYearId:               String(d.academic_year_id ?? ''),
    studentId:                    String(d.student_id ?? ''),
    classId:                      String(d.class_id ?? ''),
    sectionId:                    d.section_id ? String(d.section_id) : null,
    feeScheduleId:                String(d.fee_schedule_id ?? ''),
    feeStructureId:               String(d.fee_structure_id ?? ''),
    feeStructureClassMappingId:   String(d.fee_structure_class_mapping_id ?? ''),
    orderNo:                      d.order_no ?? '',
    installmentNo:                d.installment_no ?? 0,
    installmentTitle:             d.installment_title ?? '',
    dueDate:                      d.due_date,
    feeHeads:                     (d.fee_heads as unknown[] | undefined)?.map((h: unknown) => {
      const fh = h as Record<string, unknown>;
      return {
        feeHeadId:         String(fh.fee_head_id ?? ''),
        feeHeadName:       fh.fee_head_name,
        originalAmount:    fh.original_amount,
        concessionAmount:  fh.concession_amount,
        lateFeeAmount:     fh.late_fee_amount,
        paidAmount:        fh.paid_amount,
        balanceAmount:     fh.balance_amount,
        finalAmount:       fh.final_amount,
        status:            fh.status,
      };
    }) ?? [],
    grossAmount:                  d.gross_amount ?? 0,
    concessionAmount:             d.concession_amount ?? 0,
    lateFeeAmount:                d.late_fee_amount ?? 0,
    payableAmount:                d.payable_amount ?? 0,
    paidAmount:                   d.paid_amount ?? 0,
    balanceAmount:                d.balance_amount ?? 0,
    paymentCompletionPercentage:  d.payment_completion_percentage ?? 0,
    status:                       d.status ?? 'PENDING',
    paymentStatus:                d.payment_status ?? 'UNPAID',
    generatedAt:                  d.generated_at,
    remarks:                      d.remarks ?? null,
    createdAt:                    d.createdAt,
    updatedAt:                    d.updatedAt,
  };
}

export async function handleStudentOrder(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listStudentFeeOrders': {
      authorize(ctx, 'finance.read');
      const { Types: MongoTypes } = require('mongoose');
      const safeOidLocal = (id: string) => { try { return new MongoTypes.ObjectId(id); } catch { return null; } };
      const filter: Record<string, unknown> = { tenant_id: tenantId };
      if (args.studentId)      { const oid = safeOidLocal(args.studentId as string);      if (oid) filter.student_id       = oid; }
      if (args.academicYearId) { const oid = safeOidLocal(args.academicYearId as string); if (oid) filter.academic_year_id = oid; }
      if (args.campusId)       { const oid = safeOidLocal(args.campusId as string);       if (oid) filter.campus_id        = oid; }
      if (args.classId)        { const oid = safeOidLocal(args.classId as string);        if (oid) filter.class_id         = oid; }
      if (args.status) filter.status = args.status;
      const docs = await FinanceRepo.listStudentOrders(filter);
      return (docs as unknown[]).map(d => feeOrderToGql(d));
    }

    case 'getStudentFeeOrder':
      authorize(ctx, 'finance.read');
      return feeOrderToGql(await StudentFeeOrderService.getById(tenantId, args.id as string));

    case 'generateStudentFeeOrders': {
      authorize(ctx, 'finance.manage_setup');
      const assignment = await FinanceRepo.findFeeAssignmentById(tenantId, args.assignmentId as string);
      if (!assignment) throw new AppError('NOT_FOUND', 'Fee assignment not found');
      const structure = await FinanceRepo.findFeeStructureById(tenantId, String(assignment.feeStructureId));
      if (!structure) throw new AppError('NOT_FOUND', 'Fee structure not found');
      const classId = String(assignment.classId ?? '');
      if (!classId) throw new AppError('BAD_REQUEST', 'Fee assignment is missing classId');
      const mapping = await FinanceRepo.findApplicableFeeStructure(
        tenantId,
        classId,
        String(assignment.academicYearId),
      );
      if (!mapping) throw new AppError('NOT_FOUND', 'Fee structure mapping not found');
      const schedule = await FinanceRepo.findFeeScheduleById(tenantId, String(mapping.feeScheduleId));
      if (!schedule) throw new AppError('NOT_FOUND', 'Fee schedule not found');
      const created = await StudentFeeOrderService.generateFromAssignment(ctx, tenantId, {
        assignment: assignment as never,
        structure:  structure  as never,
        schedule:   schedule   as never,
        mapping:    mapping    as never,
        studentId:      String(assignment.studentId),
        campusId:       String(mapping.campusId),
        academicYearId: String(assignment.academicYearId),
        classId:        String(assignment.classId ?? mapping.classId),
      });
      return (created as unknown[]).map(d => feeOrderToGql(d));
    }

    case 'bulkMapAndGenerateOrders': {
      authorize(ctx, 'finance.manage_setup');
      const input = ((args.input as Record<string, unknown>) ?? args) as {
        feeStructureId: string;
        feeScheduleId:  string;
        academicYearId: string;
        campusId:       string;
        classIds:       string[];
      };
      const { feeStructureId, feeScheduleId, academicYearId, campusId, classIds } = input;
      if (!Array.isArray(classIds) || classIds.length === 0) throw new AppError('BAD_REQUEST', 'classIds required');

      // ── Validation (TC-002, TC-004, TC-006, TC-007, TC-008, TC-013) ──────────
      const structure = await FinanceRepo.findFeeStructureById(tenantId, feeStructureId);
      if (!structure) throw new AppError('NOT_FOUND', 'Fee structure not found');
      if (!structure.isActive) throw new AppError('BAD_REQUEST', 'Cannot map because the fee structure is inactive');
      if (!structure.components?.length) throw new AppError('BAD_REQUEST', 'Please add at least one fee head before class mapping');
      if (!(structure.totalAmount > 0)) throw new AppError('BAD_REQUEST', 'Fee structure amount should be greater than 0');
      if (structure.campusId?.toString() !== campusId) throw new AppError('BAD_REQUEST', 'Fee structure does not belong to the selected campus');

      const schedule = await FinanceRepo.findFeeScheduleById(tenantId, feeScheduleId);
      if (!schedule) throw new AppError('NOT_FOUND', 'Fee schedule not found');
      if (!schedule.isActive) throw new AppError('BAD_REQUEST', 'Cannot map because the fee schedule is inactive');

      const { AcademicYear } = await import('@vebgenix/db');
      const ay = await AcademicYear.findOne({ tenantId, _id: new Types.ObjectId(academicYearId) }).lean();
      if (!ay) throw new AppError('NOT_FOUND', 'Academic year not found');
      if (!ay.isActive) throw new AppError('BAD_REQUEST', 'Cannot map fee structure because the academic year is inactive');

      // ── TC-015: Check each class is not already mapped to this schedule under a different structure ──
      const conflicting: string[] = [];
      for (const classId of classIds) {
        const existingMappings = await FinanceRepo.listFeeStructureClassMappings(tenantId, {
          classId:        new Types.ObjectId(classId),
          academicYearId: new Types.ObjectId(academicYearId),
          feeScheduleId:  new Types.ObjectId(feeScheduleId),
          status:         'ACTIVE',
        });
        const conflict = (existingMappings as Array<{ feeStructureId: { toString(): string } }>)
          .find(m => m.feeStructureId.toString() !== feeStructureId);
        if (conflict) conflicting.push(classId);
      }
      if (conflicting.length > 0) {
        throw new AppError('CONFLICT', `${conflicting.length} class(es) already mapped to this fee schedule under a different fee structure. Remove the existing mapping before re-assigning.`);
      }
      // ─────────────────────────────────────────────────────────────────────────

      const mappingDocs = classIds.map(classId => ({
        campusId:        new Types.ObjectId(campusId),
        academicYearId:  new Types.ObjectId(academicYearId),
        classId:         new Types.ObjectId(classId),
        feeScheduleId:   new Types.ObjectId(feeScheduleId),
        feeStructureId:  new Types.ObjectId(feeStructureId),
        priority:        0,
        status:          'ACTIVE' as const,
        createdBy:       safeOid(ctx.membership?.profileId ?? ctx.userId),
      }));

      const mappings = await FinanceRepo.bulkCreateFeeStructureClassMappings(tenantId, mappingDocs as never[]);
      const mappingArr = mappings as Array<{ _id: { toString(): string } }>;

      let totalGenerated = 0;
      let totalSkipped = 0;
      for (let i = 0; i < classIds.length; i++) {
        const mappingId = mappingArr[i]?._id?.toString() ?? '';
        if (!mappingId) continue;
        const result = await StudentFeeOrderService.generateFromMapping(ctx, tenantId, {
          feeStructureId, feeScheduleId, classId: classIds[i], academicYearId, campusId, mappingId,
        });
        totalGenerated += result.generatedCount;
        totalSkipped   += result.skippedCount;
      }
      return { mappingCount: mappingArr.length, generatedCount: totalGenerated, skippedCount: totalSkipped };
    }

    case 'updateStudentFeeOrder':
      authorize(ctx, 'finance.admin');
      return feeOrderToGql(await StudentFeeOrderService.update(tenantId, args.id as string, ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>));

    case 'cancelStudentFeeOrder':
      authorize(ctx, 'finance.admin');
      return !!(await StudentFeeOrderService.cancel(tenantId, args.id as string));

    // ── TC-036/TC-037/TC-038: Assign misc fee to student or class ─────────────
    case 'assignMiscFee': {
      authorize(ctx, 'finance.admin');
      const input = ((args.input as Record<string, unknown>) ?? args) as {
        feeHeadId:    string;
        feeHeadName:  string;
        amount:       number;
        academicYearId: string;
        campusId:     string;
        dueDate?:     string;
        description?: string;
        studentId?:   string;
        classId?:     string;
      };
      if (!input.studentId && !input.classId) throw new AppError('BAD_REQUEST', 'Either studentId or classId is required');
      if (!(input.amount > 0)) throw new AppError('BAD_REQUEST', 'Misc fee amount must be greater than 0');

      const { Student } = await import('@vebgenix/db');
      const students = input.studentId
        ? await Student.find({ tenantId, _id: new Types.ObjectId(input.studentId) }).lean()
        : await Student.find({ tenantId, classId: new Types.ObjectId(input.classId!), status: 'ACTIVE' }).lean();

      let generated = 0;
      let skipped   = 0;
      const createdOrderIds: string[] = [];
      const dueDate = input.dueDate ? new Date(input.dueDate) : new Date();

      for (const student of students) {
        // TC-038: skip if same misc fee already assigned to student in same academic year
        const existing = await FinanceRepo.listStudentOrders({
          tenant_id:        tenantId,
          student_id:       new Types.ObjectId(student._id.toString()),
          academic_year_id: new Types.ObjectId(input.academicYearId),
          'metadata.source':       'misc',
          'metadata.feeHeadId':    input.feeHeadId,
        }) as Array<{ _id: { toString(): string }; payment_status?: string; status?: string }>;
        if (existing.length > 0) {
          const payableExisting = existing.filter(order =>
            order.status !== 'CANCELLED' && order.payment_status !== 'PAID',
          );
          for (const order of payableExisting) {
            createdOrderIds.push(order._id.toString());
          }
          skipped++;
          continue;
        }

        const orderNo = await generateFeeOrderId(tenantId, input.feeHeadName, input.academicYearId);
        const amount  = roundMoney(input.amount);
        const createdOrder = await FinanceRepo.createStudentOrder({
          tenant_id:                      tenantId,
          campus_id:                      new Types.ObjectId(input.campusId),
          academic_year_id:               new Types.ObjectId(input.academicYearId),
          student_id:                     new Types.ObjectId(student._id.toString()),
          class_id:                       student.classId,
          section_id:                     student.sectionId ?? undefined,
          fee_schedule_id:                new Types.ObjectId('000000000000000000000000'), // placeholder for misc
          fee_structure_id:               new Types.ObjectId('000000000000000000000000'),
          fee_structure_class_mapping_id: new Types.ObjectId('000000000000000000000000'),
          order_no:         orderNo,
          installment_no:   1,
          installment_title: input.description ?? input.feeHeadName,
          due_date:         dueDate,
          fee_heads: [{
            fee_head_id:       new Types.ObjectId(input.feeHeadId),
            fee_head_name:     input.feeHeadName,
            original_amount:   amount,
            concession_amount: 0,
            late_fee_amount:   0,
            paid_amount:       0,
            balance_amount:    amount,
            final_amount:      amount,
            status:            'PENDING',
          }],
          gross_amount:                   amount,
          concession_amount:              0,
          late_fee_amount:                0,
          payable_amount:                 amount,
          paid_amount:                    0,
          balance_amount:                 amount,
          payment_completion_percentage:  0,
          status:                         'PENDING',
          payment_status:                 'UNPAID',
          generated_at:                   new Date(),
          remarks:                        input.description ?? null,
          metadata: { source: 'misc', feeHeadId: input.feeHeadId },
          created_by:                     safeOid(ctx.membership?.profileId ?? ctx.userId),
        });
        createdOrderIds.push(createdOrder._id.toString());
        generated++;
      }
      return { generatedCount: generated, skippedCount: skipped, createdOrderIds };
    }

    // ── TC-025/TC-026/TC-027: Deactivate fee structure class mapping ──────────
    case 'deactivateFeeStructureClassMapping': {
      authorize(ctx, 'finance.admin');
      const { mappingId, cancelUnpaidOrders } = args as { mappingId: string; cancelUnpaidOrders?: boolean };
      if (!mappingId) throw new AppError('BAD_REQUEST', 'mappingId is required');

      const { FeeStructureClassMapping } = await import('@vebgenix/db');
      const mapping = await FeeStructureClassMapping.findOne({ tenantId, _id: new Types.ObjectId(mappingId) });
      if (!mapping) throw new AppError('NOT_FOUND', 'Mapping not found');

      // Count existing orders for this mapping
      const allOrders = await FinanceRepo.listStudentOrders({
        tenant_id:                      tenantId,
        fee_structure_class_mapping_id: new Types.ObjectId(mappingId),
      }) as Array<{ _id: { toString(): string }; payment_status: string; status: string }>;

      const unpaidOrders  = allOrders.filter(o => o.payment_status === 'UNPAID' && o.status !== 'CANCELLED');
      const paidOrPartial = allOrders.filter(o => o.payment_status !== 'UNPAID' && o.status !== 'CANCELLED');

      // TC-027: if paid/partial orders exist → only deactivate, don't delete
      // TC-026: if only unpaid → can cancel them optionally
      let cancelledCount = 0;
      if (cancelUnpaidOrders && paidOrPartial.length === 0) {
        // TC-025/TC-026: only cancel if no paid/partial orders exist
        for (const order of unpaidOrders) {
          await FinanceRepo.cancelStudentOrder(tenantId, order._id.toString());
          cancelledCount++;
        }
      }

      // Deactivate the mapping
      await FeeStructureClassMapping.findOneAndUpdate(
        { tenantId, _id: new Types.ObjectId(mappingId) },
        { $set: { status: 'INACTIVE' } },
      );

      return {
        success:         true,
        cancelledOrders: cancelledCount,
        keptOrders:      allOrders.length - cancelledCount,
      };
    }

    // ── TC-028/TC-029/TC-030: Apply fee structure revision to existing orders ─
    case 'applyFeeStructureRevision': {
      authorize(ctx, 'finance.admin');
      const feeStructureId = args.feeStructureId as string;
      if (!feeStructureId) throw new AppError('BAD_REQUEST', 'feeStructureId is required');

      const structure = await FinanceRepo.findFeeStructureById(tenantId, feeStructureId);
      if (!structure) throw new AppError('NOT_FOUND', 'Fee structure not found');

      const newTotal = roundMoney((structure as { totalAmount: number }).totalAmount);
      if (!(newTotal > 0)) throw new AppError('BAD_REQUEST', 'Fee structure total must be greater than 0');

      // Find all orders for this structure
      const allOrders = await FinanceRepo.listStudentOrders({
        tenant_id:        tenantId,
        fee_structure_id: new Types.ObjectId(feeStructureId),
      }) as Array<{
        _id: { toString(): string }; student_id: { toString(): string };
        academic_year_id: { toString(): string }; campus_id: { toString(): string };
        class_id?: { toString(): string }; section_id?: { toString(): string };
        fee_structure_class_mapping_id: { toString(): string };
        payment_status: string; status: string;
        payable_amount: number; paid_amount: number; installment_no: number;
        installment_title: string; due_date: Date;
      }>;

      const unpaid  = allOrders.filter(o => o.payment_status === 'UNPAID' && o.status !== 'CANCELLED');
      const nonUnpaid = allOrders.filter(o => o.payment_status !== 'UNPAID' && o.status !== 'CANCELLED');

      const struc = structure as { components: Array<{ feeHeadId: Types.ObjectId; feeHeadName: string; amount: number }>; totalAmount: number };
      let updatedOrders    = 0;
      let adjustmentOrders = 0;

      // TC-029: Update unpaid orders with new amounts
      for (const order of unpaid) {
        const ratio   = struc.totalAmount > 0 ? order.payable_amount / struc.totalAmount : 1;
        const newPayable = roundMoney(newTotal * ratio);
        const newFeeHeads = struc.components.map(c => {
          const compRatio = struc.totalAmount > 0 ? c.amount / struc.totalAmount : 1 / struc.components.length;
          const final     = roundMoney(newPayable * compRatio);
          return {
            fee_head_id:       c.feeHeadId,
            fee_head_name:     c.feeHeadName,
            original_amount:   roundMoney(c.amount * ratio),
            concession_amount: 0,
            late_fee_amount:   0,
            paid_amount:       0,
            balance_amount:    final,
            final_amount:      final,
            status:            'PENDING',
          };
        });
        await FinanceRepo.updateStudentOrder(tenantId, order._id.toString(), {
          gross_amount:   roundMoney(newFeeHeads.reduce((s, h) => s + h.original_amount, 0)),
          payable_amount: newPayable,
          balance_amount: newPayable,
          fee_heads:      newFeeHeads,
        });
        updatedOrders++;
      }

      // TC-030: For paid/partial orders, create adjustment order for difference
      const processedStudents = new Set<string>();
      for (const order of nonUnpaid) {
        const studentKey = order.student_id.toString();
        if (processedStudents.has(studentKey)) continue;
        processedStudents.add(studentKey);

        const oldTotal = order.payable_amount;
        const diff     = roundMoney(newTotal - oldTotal);
        if (Math.abs(diff) < 0.01) continue; // no meaningful change

        const adjustNo  = await generateFeeOrderId(tenantId, 'ADJ', order.academic_year_id.toString());
        const adjAmount = Math.abs(diff);
        await FinanceRepo.createStudentOrder({
          tenant_id:                      tenantId,
          campus_id:                      order.campus_id,
          academic_year_id:               order.academic_year_id,
          student_id:                     order.student_id,
          class_id:                       order.class_id,
          section_id:                     order.section_id,
          fee_structure_id:               new Types.ObjectId(feeStructureId),
          fee_structure_class_mapping_id: order.fee_structure_class_mapping_id,
          fee_schedule_id:                new Types.ObjectId('000000000000000000000000'),
          order_no:         adjustNo,
          installment_no:   99,
          installment_title: diff > 0 ? 'Fee Revision (Additional)' : 'Fee Revision (Credit)',
          due_date:         new Date(),
          fee_heads: struc.components.map(c => {
            const compRatio = struc.totalAmount > 0 ? c.amount / struc.totalAmount : 1 / struc.components.length;
            const amt = roundMoney(adjAmount * compRatio);
            return { fee_head_id: c.feeHeadId, fee_head_name: c.feeHeadName, original_amount: amt, concession_amount: 0, late_fee_amount: 0, paid_amount: 0, balance_amount: amt, final_amount: amt, status: 'PENDING' };
          }),
          gross_amount:                   adjAmount,
          concession_amount:              0,
          late_fee_amount:                0,
          payable_amount:                 adjAmount,
          paid_amount:                    0,
          balance_amount:                 adjAmount,
          payment_completion_percentage:  0,
          status:                         diff > 0 ? 'PENDING' : 'PENDING',
          payment_status:                 'UNPAID',
          generated_at:                   new Date(),
          remarks:                        `Fee revision adjustment: ${diff > 0 ? '+' : ''}${diff}`,
          metadata:                       { source: 'revision', feeStructureId, diff },
          created_by:                     safeOid(ctx.membership?.profileId ?? ctx.userId),
        });
        adjustmentOrders++;
      }

      return { updatedOrders, adjustmentOrders };
    }

    // ── TC-031/TC-032/TC-033: Transfer student to new class ───────────────────
    case 'transferStudentClass': {
      authorize(ctx, 'finance.admin');
      const studentId = args.studentId as string;
      const input = ((args.input as Record<string, unknown>) ?? args) as {
        newClassId:    string;
        newSectionId?: string;
        academicYearId: string;
        campusId:      string;
        reason?:       string;
      };
      if (!studentId || !input.newClassId) throw new AppError('BAD_REQUEST', 'studentId and newClassId are required');

      const { Student } = await import('@vebgenix/db');
      const student = await Student.findOne({ tenantId, _id: new Types.ObjectId(studentId) }).lean();
      if (!student) throw new AppError('NOT_FOUND', 'Student not found');

      const oldClassId = student.classId?.toString() ?? '';

      // Get student's current fee orders for this academic year
      const currentOrders = await FinanceRepo.listStudentOrders({
        tenant_id:        tenantId,
        student_id:       new Types.ObjectId(studentId),
        academic_year_id: new Types.ObjectId(input.academicYearId),
      }) as Array<{
        _id: { toString(): string }; payment_status: string; status: string;
        payable_amount: number; paid_amount: number; fee_schedule_id: { toString(): string };
        fee_structure_id: { toString(): string };
        metadata?: Record<string, unknown>;
      }>;

      const ordersForOldClass = currentOrders.filter(o => o.status !== 'CANCELLED' && (!o.metadata?.source || o.metadata.source !== 'misc'));

      let cancelledOrders   = 0;
      let adjustmentOrders  = 0;

      for (const order of ordersForOldClass) {
        if (order.payment_status === 'UNPAID') {
          // TC-031: cancel unpaid orders from old class
          await FinanceRepo.cancelStudentOrder(tenantId, order._id.toString());
          cancelledOrders++;
        } else if (order.payment_status === 'PAID') {
          // TC-033: if new class fee is higher, create difference order
          const newClassMappings = await FinanceRepo.listFeeStructureClassMappings(tenantId, {
            classId:        new Types.ObjectId(input.newClassId),
            academicYearId: new Types.ObjectId(input.academicYearId),
            feeScheduleId:  new Types.ObjectId(order.fee_schedule_id.toString()),
            status:         'ACTIVE',
          }) as Array<{ feeStructureId: { toString(): string } }>;

          for (const newMapping of newClassMappings) {
            const newStructure = await FinanceRepo.findFeeStructureById(tenantId, newMapping.feeStructureId.toString()) as { totalAmount: number; components: Array<{ feeHeadId: Types.ObjectId; feeHeadName: string; amount: number }> } | null;
            if (!newStructure) continue;
            const diff = roundMoney(newStructure.totalAmount - order.payable_amount);
            if (diff <= 0) continue;

            const adjNo = await generateFeeOrderId(tenantId, 'ADJ', input.academicYearId);
            await FinanceRepo.createStudentOrder({
              tenant_id:                      tenantId,
              campus_id:                      new Types.ObjectId(input.campusId),
              academic_year_id:               new Types.ObjectId(input.academicYearId),
              student_id:                     new Types.ObjectId(studentId),
              class_id:                       new Types.ObjectId(input.newClassId),
              section_id:                     input.newSectionId ? new Types.ObjectId(input.newSectionId) : undefined,
              fee_schedule_id:                new Types.ObjectId(order.fee_schedule_id.toString()),
              fee_structure_id:               new Types.ObjectId(newMapping.feeStructureId.toString()),
              fee_structure_class_mapping_id: new Types.ObjectId('000000000000000000000000'),
              order_no:         adjNo,
              installment_no:   1,
              installment_title: 'Class Transfer Difference',
              due_date:         new Date(),
              fee_heads: newStructure.components.map(c => {
                const ratio = newStructure.totalAmount > 0 ? c.amount / newStructure.totalAmount : 1;
                const amt   = roundMoney(diff * ratio);
                return { fee_head_id: c.feeHeadId, fee_head_name: c.feeHeadName, original_amount: amt, concession_amount: 0, late_fee_amount: 0, paid_amount: 0, balance_amount: amt, final_amount: amt, status: 'PENDING' };
              }),
              gross_amount: diff, concession_amount: 0, late_fee_amount: 0,
              payable_amount: diff, paid_amount: 0, balance_amount: diff,
              payment_completion_percentage: 0, status: 'PENDING', payment_status: 'UNPAID',
              generated_at: new Date(),
              remarks: `Class transfer from ${oldClassId} to ${input.newClassId}: fee difference`,
              metadata: { source: 'class_transfer', oldClassId, reason: input.reason ?? '' },
              created_by: safeOid(ctx.membership?.profileId ?? ctx.userId),
            });
            adjustmentOrders++;
          }
        }
        // TC-032: partial — keep existing, don't cancel. New orders created below.
      }

      // Update student's classId and sectionId
      await Student.findOneAndUpdate(
        { tenantId, _id: new Types.ObjectId(studentId) },
        { $set: { classId: new Types.ObjectId(input.newClassId), ...(input.newSectionId ? { sectionId: new Types.ObjectId(input.newSectionId) } : {}) } },
      );

      // Generate new class fee orders for the student
      const newOrdersResult = await FinanceRepo.autoGenerateFeeOrdersForStudent({
        tenantId,
        studentId,
        classId:       input.newClassId,
        sectionId:     input.newSectionId,
        academicYearId: input.academicYearId,
        campusId:      input.campusId,
      });

      return { cancelledOrders, generatedOrders: newOrdersResult, adjustmentOrders };
    }

    case 'outstandingReport': {
      authorize(ctx, 'finance.read');
      const docs = await StudentFeeOrderService.listOutstanding(tenantId, {
        studentId:      args.studentId      as string | undefined,
        classId:        args.classId        as string | undefined,
        academicYearId: args.academicYearId as string | undefined,
      });
      return (docs as unknown[]).map(d => feeOrderToGql(d));
    }

    default:
      return undefined;
  }
}
