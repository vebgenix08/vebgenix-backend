import { Types } from 'mongoose';
import { FinanceRepo, IFeeAssignment, IFeeSchedule, IFeeStructure, IFeeStructureClassMapping } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { generateFeeOrderId } from '../numbering';
import { roundMoney, buildAmountsByRatio, validatePercentTotal } from '../helpers/finance';

export interface GenerateOrdersInput {
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

    const assignedBy = new Types.ObjectId(ctx.membership!.profileId);
    const feeHeadSnapshots = input.structure.components.map((component: { feeHeadId: Types.ObjectId; feeHeadName: string; amount: number; priorityOrder?: number }) => ({
      feeHeadId: component.feeHeadId,
      feeHeadName: component.feeHeadName,
      amount: roundMoney(component.amount),
      concession: 0,
      netAmount: roundMoney(component.amount),
      priorityOrder: component.priorityOrder ?? 0,
    }));

    for (let index = 0; index < input.schedule.slots.length; index++) {
      const slot = input.schedule.slots[index];
      const payableAmount = roundMoney(installmentAmounts[index]);
      const ratios = input.structure.components.map((component: { amount: number }) => component.amount);
      const componentAmounts = buildAmountsByRatio(payableAmount, ratios);

      const feeHeads = input.structure.components.map((component: { feeHeadId: Types.ObjectId; feeHeadName: string; amount: number }, componentIndex: number) => {
        const originalAmount = roundMoney(component.amount);
        const finalAmount = roundMoney(componentAmounts[componentIndex]);
        return {
          fee_head_id: component.feeHeadId,
          fee_head_name: component.feeHeadName,
          original_amount: originalAmount,
          concession_amount: roundMoney(originalAmount - finalAmount),
          late_fee_amount: 0,
          paid_amount: 0,
          balance_amount: finalAmount,
          final_amount: finalAmount,
          status: 'PENDING' as const,
        };
      });

      const orderNo = await generateFeeOrderId(tenantId, input.structure.feeCategoryId?.toString() ?? 'FEE', input.academicYearId);
      const grossAmount = roundMoney(feeHeads.reduce((sum: number, item: { original_amount: number }) => sum + item.original_amount, 0));
      const concessionAmount = roundMoney(feeHeads.reduce((sum: number, item: { concession_amount: number }) => sum + item.concession_amount, 0));
      const payable = roundMoney(feeHeads.reduce((sum: number, item: { final_amount: number }) => sum + item.final_amount, 0));

      orderDocs.push({
        tenant_id: new Types.ObjectId(tenantId),
        campus_id: new Types.ObjectId(input.campusId),
        academic_year_id: new Types.ObjectId(input.academicYearId),
        student_id: new Types.ObjectId(input.studentId),
        class_id: new Types.ObjectId(input.classId),
        section_id: input.sectionId ? new Types.ObjectId(input.sectionId) : undefined,
        fee_schedule_id: input.schedule._id,
        fee_structure_id: input.structure._id,
        fee_structure_class_mapping_id: input.mapping._id,
        order_no: orderNo,
        installment_no: index + 1,
        installment_title: slot.name,
        due_date: new Date(slot.dueDate),
        fee_heads: feeHeads,
        gross_amount: grossAmount,
        concession_amount: concessionAmount,
        late_fee_amount: 0,
        payable_amount: payable,
        paid_amount: 0,
        balance_amount: payable,
        payment_completion_percentage: 0,
        status: 'PENDING',
        payment_status: 'UNPAID',
        generated_at: new Date(),
        remarks: null,
        metadata: {
          assignmentId: input.assignment._id.toString(),
          feeHeadSnapshot: feeHeadSnapshots,
        },
        created_by: assignedBy,
        updated_by: assignedBy,
      });
    }

    const created = await FinanceRepo.bulkCreateStudentOrders(orderDocs);
    return created;
  }

  static async listOutstanding(tenantId: string, filters: { studentId?: string; classId?: string; academicYearId?: string } = {}) {
    const query: Record<string, unknown> = {
      tenant_id: tenantId,
      status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] },
    };
    if (filters.studentId) query.student_id = new Types.ObjectId(filters.studentId);
    if (filters.classId) query.class_id = new Types.ObjectId(filters.classId);
    if (filters.academicYearId) query.academic_year_id = new Types.ObjectId(filters.academicYearId);
    return FinanceRepo.listStudentOrders(query);
  }
}
