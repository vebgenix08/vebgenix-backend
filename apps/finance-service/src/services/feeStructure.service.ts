import { Types } from 'mongoose';
import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { roundMoney } from '../helpers/finance';
import { StudentFeeOrderService } from './studentFeeOrder.service';

export interface FeeComponentInput {
  feeHeadId: string;
  feeHeadName: string;
  amount: number;
  isOptional?: boolean;
  priorityOrder?: number;
}

export interface CreateFeeStructureInput {
  campusId: string;
  academicYearId: string;
  programId?: string;
  classId?: string;
  classFrom?: number;
  classTo?: number;
  name: string;
  components: FeeComponentInput[];
  feeCategoryId: string;
  feeScheduleId?: string;
  allocationMethod?: 'PRO_RATA' | 'PRIORITY_WISE' | 'MANUAL';
  studentCategoryId?: string;
}

export interface UpdateFeeStructureInput extends Partial<CreateFeeStructureInput> {
  isActive?: boolean;
}

export interface CreateFeeStructureClassMappingInput {
  campusId: string;
  academicYearId: string;
  classId: string;
  feeScheduleId: string;
  feeStructureId: string;
  priority?: number;
  effectiveFrom?: string;
  effectiveTo?: string;
}

export class FeeStructureService {
  static async list(tenantId: string, filters: Record<string, unknown> = {}) {
    return FinanceRepo.listFeeStructures(tenantId, filters);
  }

  static async getById(tenantId: string, id: string) {
    return FinanceRepo.findFeeStructureById(tenantId, id);
  }

  static async listMappings(tenantId: string, filters: Record<string, unknown> = {}) {
    return FinanceRepo.listFeeStructureClassMappings(tenantId, filters);
  }

  static async getMappingById(tenantId: string, id: string) {
    return FinanceRepo.findFeeStructureClassMappingById(tenantId, id);
  }

  static async create(ctx: AuthContext, tenantId: string, input: CreateFeeStructureInput) {
    if (!input.components?.length) {
      throw new AppError('BAD_REQUEST', 'At least one fee component is required');
    }

    const feeHeads = await FinanceRepo.listFeeHeadsFiltered(tenantId, { feeCategoryId: input.feeCategoryId });
    const validFeeHeadIds = new Set(feeHeads.map((head: { _id: { toString(): string } }) => head._id.toString()));

    for (const component of input.components) {
      if (!validFeeHeadIds.has(component.feeHeadId)) {
        throw new AppError('BAD_REQUEST', `Fee head ${component.feeHeadId} does not belong to fee category ${input.feeCategoryId}`);
      }
    }

    const components = input.components.map(component => ({
      feeHeadId: new Types.ObjectId(component.feeHeadId),
      feeHeadName: component.feeHeadName,
      amount: roundMoney(component.amount),
      isOptional: component.isOptional ?? false,
      priorityOrder: component.priorityOrder ?? 0,
    }));

    const totalAmount = roundMoney(components.reduce((sum, component) => sum + component.amount, 0));

    return FinanceRepo.createFeeStructure(tenantId, {
      campusId: new Types.ObjectId(input.campusId),
      academicYearId: new Types.ObjectId(input.academicYearId),
      programId: input.programId ? new Types.ObjectId(input.programId) : undefined,
      classId: input.classId ? new Types.ObjectId(input.classId) : undefined,
      classFrom: input.classFrom,
      classTo: input.classTo,
      name: input.name,
      components,
      totalAmount,
      feeCategoryId: new Types.ObjectId(input.feeCategoryId),
      feeScheduleId: input.feeScheduleId ? new Types.ObjectId(input.feeScheduleId) : undefined,
      allocationMethod: input.allocationMethod ?? 'PRO_RATA',
      studentCategoryId: input.studentCategoryId ? new Types.ObjectId(input.studentCategoryId) : undefined,
      isActive: true,
      createdBy: new Types.ObjectId(ctx.membership!.profileId),
    });
  }

  static async update(tenantId: string, id: string, input: UpdateFeeStructureInput) {
    const components = input.components?.map(component => ({
      feeHeadId: new Types.ObjectId(component.feeHeadId),
      feeHeadName: component.feeHeadName,
      amount: roundMoney(component.amount),
      isOptional: component.isOptional ?? false,
      priorityOrder: component.priorityOrder ?? 0,
    }));

    return FinanceRepo.updateFeeStructure(tenantId, id, {
      ...input,
      campusId: input.campusId ? new Types.ObjectId(input.campusId) : undefined,
      academicYearId: input.academicYearId ? new Types.ObjectId(input.academicYearId) : undefined,
      programId: input.programId ? new Types.ObjectId(input.programId) : undefined,
      classId: input.classId ? new Types.ObjectId(input.classId) : undefined,
      feeCategoryId: input.feeCategoryId ? new Types.ObjectId(input.feeCategoryId) : undefined,
      feeScheduleId: input.feeScheduleId ? new Types.ObjectId(input.feeScheduleId) : undefined,
      studentCategoryId: input.studentCategoryId ? new Types.ObjectId(input.studentCategoryId) : undefined,
      components,
      totalAmount: components ? roundMoney(components.reduce((sum, component) => sum + component.amount, 0)) : undefined,
    });
  }

  static async remove(tenantId: string, id: string) {
    return FinanceRepo.deleteFeeStructure(tenantId, id);
  }

  static async createClassMapping(ctx: AuthContext, tenantId: string, input: CreateFeeStructureClassMappingInput) {
    const mapping = await FinanceRepo.createFeeStructureClassMapping(tenantId, {
      campusId: new Types.ObjectId(input.campusId),
      academicYearId: new Types.ObjectId(input.academicYearId),
      classId: new Types.ObjectId(input.classId),
      feeScheduleId: new Types.ObjectId(input.feeScheduleId),
      feeStructureId: new Types.ObjectId(input.feeStructureId),
      priority: input.priority ?? 0,
      effectiveFrom: input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
      effectiveTo: input.effectiveTo ? new Date(input.effectiveTo) : undefined,
      status: 'ACTIVE',
      createdBy: new Types.ObjectId(ctx.membership!.profileId),
    });
    return mapping;
  }

  static async updateClassMapping(tenantId: string, id: string, payload: Record<string, unknown>) {
    return FinanceRepo.updateFeeStructureClassMapping(tenantId, id, payload);
  }

  static async removeClassMapping(tenantId: string, id: string) {
    return FinanceRepo.deleteFeeStructureClassMapping(tenantId, id);
  }

  static async findApplicableMapping(tenantId: string, classId: string, academicYearId: string) {
    return FinanceRepo.findApplicableFeeStructure(tenantId, classId, academicYearId);
  }

  static async assignToStudent(
    ctx: AuthContext,
    tenantId: string,
    input: {
      studentId: string;
      classId?: string;
      campusId: string;
      academicYearId: string;
      discountAmount?: number;
      discountReason?: string;
    },
  ) {
    const { StudentAcademicEnrollment, Class } = await import('@vebgenix/db');

    const enrollment = await StudentAcademicEnrollment.findOne({
      tenantId,
      studentId: new Types.ObjectId(input.studentId),
      academicYearId: new Types.ObjectId(input.academicYearId),
      status: 'ACTIVE',
    }).lean();

    const resolvedClassId = enrollment?.gradeId?.toString?.() ?? input.classId;
    if (!resolvedClassId) {
      throw new AppError('BAD_REQUEST', 'Unable to resolve class for fee assignment');
    }

    const classExists = await Class.findOne({
      tenantId,
      _id: new Types.ObjectId(resolvedClassId),
      isActive: true,
    }).lean();
    if (!classExists) {
      throw new AppError('NOT_FOUND', 'Class not found or inactive');
    }

    const mapping = await this.findApplicableMapping(tenantId, resolvedClassId, input.academicYearId);
    if (!mapping) {
      throw new AppError('NOT_FOUND', 'No active fee structure mapping found for this class');
    }

    const structure = await FinanceRepo.findFeeStructureById(tenantId, String(mapping.feeStructureId));
    if (!structure) {
      throw new AppError('NOT_FOUND', 'Fee structure not found');
    }

    const schedule = await FinanceRepo.findFeeScheduleById(tenantId, String(mapping.feeScheduleId));
    if (!schedule) {
      throw new AppError('NOT_FOUND', 'Fee schedule not found');
    }

    const totalAmount = roundMoney(structure.totalAmount);
    const discountAmount = roundMoney(input.discountAmount ?? 0);
    const netAmount = roundMoney(totalAmount - discountAmount);

    const assignment = await FinanceRepo.createFeeAssignment(tenantId, {
      studentId: input.studentId,
      feeStructureId: structure._id.toString(),
      academicYearId: input.academicYearId,
      classId: resolvedClassId,
      totalAmount,
      discountAmount,
      netAmount,
      discountReason: input.discountReason,
      assignedBy: ctx.membership!.profileId,
      status: 'ACTIVE',
    });

    const orders = await StudentFeeOrderService.generateFromAssignment(ctx, tenantId, {
      assignment,
      structure,
      schedule,
      mapping,
      studentId: input.studentId,
      campusId: input.campusId,
      academicYearId: input.academicYearId,
      classId: resolvedClassId,
    });

    return { assignment, orders, mapping, structure, schedule };
  }

  static async copyToNextYear(
    tenantId: string,
    input: {
      fromAcademicYearId: string;
      toAcademicYearId: string;
      campusId?: string;
      feeStructureIds?: string[];
    },
  ) {
    const filters: Record<string, unknown> = {
      academicYearId: new Types.ObjectId(input.fromAcademicYearId),
    };
    if (input.campusId) filters.campusId = new Types.ObjectId(input.campusId);
    if (input.feeStructureIds?.length) {
      filters._id = { $in: input.feeStructureIds.map(id => new Types.ObjectId(id)) };
    }

    const sourceStructures = await FinanceRepo.listFeeStructures(tenantId, filters);
    let copiedCount = 0;
    let skippedCount = 0;

    for (const structure of sourceStructures) {
      const existing = await FinanceRepo.listFeeStructures(tenantId, {
        academicYearId: new Types.ObjectId(input.toAcademicYearId),
        campusId: structure.campusId,
        feeScheduleId: structure.feeScheduleId,
        name: structure.name,
      });

      if (existing.length > 0) {
        skippedCount += 1;
        continue;
      }

      await FinanceRepo.createFeeStructure(tenantId, {
        campusId: structure.campusId,
        academicYearId: new Types.ObjectId(input.toAcademicYearId),
        programId: structure.programId,
        classId: structure.classId,
        classFrom: structure.classFrom,
        classTo: structure.classTo,
        name: structure.name,
        components: structure.components,
        totalAmount: structure.totalAmount,
        feeCategoryId: structure.feeCategoryId,
        feeScheduleId: structure.feeScheduleId,
        allocationMethod: structure.allocationMethod,
        studentCategoryId: structure.studentCategoryId,
        isActive: structure.isActive,
        createdBy: structure.createdBy,
      });
      copiedCount += 1;
    }

    return { copiedCount, skippedCount };
  }
}
