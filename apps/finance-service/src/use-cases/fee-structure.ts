import { FinanceRepo } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { getTenantId } from '@vebgenix/tenant';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';
import { roundMoney, safeOid, toGql } from '../finance-utils';

function shiftDateByOneYear(d: Date): Date {
  const nd = new Date(d);
  nd.setFullYear(nd.getFullYear() + 1);
  return nd;
}

export async function handleFeeStructure(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'listFeeStructures':
    case 'GET:/api/admin/finance/fee-structures': {
      authorize(ctx, 'finance.read');
      const filter: Record<string, unknown> = {};
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.programId)      filter.programId      = args.programId;
      if (args.feeScheduleId)  filter.feeScheduleId  = new Types.ObjectId(args.feeScheduleId as string);
      const docs = await FinanceRepo.listFeeStructures(tenantId, filter);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getFeeStructure':
    case 'GET:/api/admin/finance/fee-structures/:id':
      authorize(ctx, 'finance.read');
      return toGql(await FinanceRepo.findFeeStructureById(tenantId, args.id as string));

    case 'createFeeStructure': {
      const input = ((args.input as Record<string, unknown>) ?? args) as {
        campusId: string;
        academicYearId: string;
        programId?: string;
        classId?: string;
        name: string;
        components: Array<{ feeHeadId: string; feeHeadName: string; amount: number; isOptional?: boolean; priorityOrder?: number }>;
        feeScheduleId?: string;
        allocationMethod?: 'PRO_RATA' | 'PRIORITY_WISE' | 'MANUAL';
        studentCategoryId?: string;
      };

      authorize(ctx, 'finance.manage_setup');
      const resolvedTenantId = getTenantId(ctx);

      if (!input.components?.length) {
        throw new AppError('BAD_REQUEST', 'At least one fee component is required');
      }

      const totalAmount = input.components.reduce((sum, c) => sum + c.amount, 0);

      const structure = await FinanceRepo.createFeeStructure(resolvedTenantId, {
        campusId:          new Types.ObjectId(input.campusId),
        academicYearId:    new Types.ObjectId(input.academicYearId),
        programId:         input.programId ? new Types.ObjectId(input.programId) : undefined,
        classId:           input.classId ? new Types.ObjectId(input.classId) : undefined,
        name:              input.name,
        feeScheduleId:     input.feeScheduleId ? new Types.ObjectId(input.feeScheduleId) : undefined,
        allocationMethod:  input.allocationMethod ?? 'PRO_RATA',
        studentCategoryId: input.studentCategoryId ? new Types.ObjectId(input.studentCategoryId) : undefined,
        components: input.components.map(c => ({
          feeHeadId:     new Types.ObjectId(c.feeHeadId),
          feeHeadName:   c.feeHeadName,
          amount:        c.amount,
          isOptional:    c.isOptional    ?? false,
          priorityOrder: c.priorityOrder ?? 0,
        })),
        totalAmount,
        isActive:  true,
        createdBy: safeOid(ctx.membership?.profileId ?? ctx.userId),
      });

      await AuditLogger.logTenantAction({
        ctx, action: 'FEE_STRUCTURE_CREATED',
        entityType: 'FeeStructure', entityId: structure._id.toString(), entityName: input.name,
        after: { ...input, totalAmount },
      });

      return toGql(structure);
    }

    case 'updateFeeStructure':
    case 'PATCH:/api/admin/finance/fee-structures/:id': {
      authorize(ctx, 'finance.manage_setup');
      const id = args.id as string;
      const { id: _ignored, input: _input, ...restArgs } = args as Record<string, unknown>;
      const update = (_input as Record<string, unknown>) ?? restArgs;
      if (!id) throw new AppError('BAD_REQUEST', 'id is required');
      const existing = await FinanceRepo.findFeeStructureById(tenantId, id);
      if (!existing) throw new AppError('NOT_FOUND', 'Fee structure not found');
      return toGql(await FinanceRepo.updateFeeStructure(tenantId, id, update));
    }

    case 'deleteFeeStructure':
    case 'DELETE:/api/admin/finance/fee-structures/:id':
      authorize(ctx, 'finance.manage_setup');
      return toGql(await FinanceRepo.deleteFeeStructure(tenantId, args.id as string));

    case 'copyFeePatternToNextYear': {
      const input = ((args.input as Record<string, unknown>) ?? args) as {
        fromAcademicYearId: string;
        toAcademicYearId:   string;
        campusId?:          string;
        fromGradeId?:       string;
        toGradeId?:         string;
        activateCopies?:    boolean;
      };

      authorize(ctx, 'finance.manage_setup');
      const resolvedTenantId = getTenantId(ctx);
      const profileId = ctx.membership?.profileId ?? ctx.userId;

      const scheduleFilter: Record<string, unknown> = { academicYearId: input.fromAcademicYearId };
      if (input.campusId) scheduleFilter.campusId = new Types.ObjectId(input.campusId);

      const sourceSchedules = await FinanceRepo.listFeeSchedules(resolvedTenantId, scheduleFilter);
      const scheduleIdMap = new Map<string, string>();

      for (const src of sourceSchedules) {
        const existing = await FinanceRepo.listFeeSchedules(resolvedTenantId, {
          academicYearId: input.toAcademicYearId,
          name: `${src.name} (copied)`,
        });
        if (existing.length > 0) {
          scheduleIdMap.set(src._id.toString(), existing[0]._id.toString());
          continue;
        }

        const copied = await FinanceRepo.createFeeSchedule(resolvedTenantId, {
          name:                `${src.name} (copied)`,
          academicYearId:      input.toAcademicYearId,
          campusId:            src.campusId,
          allowPartialPayment: src.allowPartialPayment,
          collectionType:      src.collectionType,
          minimumAmount:       src.minimumAmount,
          minimumPercentage:   src.minimumPercentage,
          graceDays:           src.graceDays,
          lateFeeEnabled:      src.lateFeeEnabled,
          notificationEnabled: src.notificationEnabled,
          isActive:            input.activateCopies ?? false,
          createdBy:           profileId,
          slots:               (src.slots ?? []).map((slot: { name: string; dueDate: Date; percentOfTotal?: number; fixedAmount?: number }) => ({
            name:           slot.name,
            dueDate:        shiftDateByOneYear(slot.dueDate),
            percentOfTotal: slot.percentOfTotal,
            fixedAmount:    slot.fixedAmount,
          })),
        } as never);

        scheduleIdMap.set(src._id.toString(), copied._id.toString());
      }

      const structureFilter: Record<string, unknown> = {
        academicYearId: new Types.ObjectId(input.fromAcademicYearId),
        isActive: true,
      };
      if (input.campusId)   structureFilter.campusId = new Types.ObjectId(input.campusId);
      if (input.fromGradeId) structureFilter.classId  = new Types.ObjectId(input.fromGradeId);

      const sourceStructures = await FinanceRepo.listFeeStructures(resolvedTenantId, structureFilter);
      const copiedStructureIds: string[] = [];

      for (const src of sourceStructures) {
        const newScheduleId = src.feeScheduleId
          ? scheduleIdMap.get(src.feeScheduleId.toString())
          : undefined;

        const copied = await FinanceRepo.createFeeStructure(resolvedTenantId, {
          name:              `${src.name} (copied)`,
          campusId:          src.campusId,
          academicYearId:    new Types.ObjectId(input.toAcademicYearId),
          classId:           input.toGradeId ? new Types.ObjectId(input.toGradeId) : src.classId,
          programId:         src.programId,
          feeScheduleId:     newScheduleId ? new Types.ObjectId(newScheduleId) : undefined,
          allocationMethod:  src.allocationMethod,
          studentCategoryId: src.studentCategoryId,
          components:        src.components.map((c: { feeHeadId: unknown; feeHeadName: string; amount: number; isOptional: boolean; priorityOrder: number }) => ({
            feeHeadId:     c.feeHeadId,
            feeHeadName:   c.feeHeadName,
            amount:        c.amount,
            isOptional:    c.isOptional,
            priorityOrder: c.priorityOrder,
          })),
          totalAmount:       src.totalAmount,
          isActive:          input.activateCopies ?? false,
          createdBy:         safeOid(profileId),
        } as never);

        copiedStructureIds.push(copied._id.toString());
      }

      await AuditLogger.logTenantAction({
        ctx, action: 'FEE_PATTERN_COPIED',
        entityType: 'FeeStructure', entityId: 'bulk',
        after: {
          fromAcademicYearId: input.fromAcademicYearId,
          toAcademicYearId:   input.toAcademicYearId,
          schedulesCount:     scheduleIdMap.size,
          structuresCount:    copiedStructureIds.length,
        },
      });

      return {
        copiedScheduleIds:  Array.from(scheduleIdMap.values()),
        copiedStructureIds,
      };
    }

    default:
      return undefined;
  }
}

export async function createFeeStructureClassMappingInline(
  ctx: AuthContext,
  tenantId: string,
  input: {
    campusId: string;
    academicYearId: string;
    classId: string;
    feeScheduleId: string;
    feeStructureId: string;
    priority?: number;
    effectiveFrom?: string;
    effectiveTo?: string;
  },
) {
  return FinanceRepo.createFeeStructureClassMapping(tenantId, {
    campusId:        new Types.ObjectId(input.campusId),
    academicYearId:  new Types.ObjectId(input.academicYearId),
    classId:         new Types.ObjectId(input.classId),
    feeScheduleId:   new Types.ObjectId(input.feeScheduleId),
    feeStructureId:  new Types.ObjectId(input.feeStructureId),
    priority:        input.priority ?? 0,
    effectiveFrom:   input.effectiveFrom ? new Date(input.effectiveFrom) : undefined,
    effectiveTo:     input.effectiveTo   ? new Date(input.effectiveTo)   : undefined,
    status:          'ACTIVE',
    createdBy:       safeOid(ctx.membership?.profileId ?? ctx.userId),
  });
}

export async function assignFeeStructureToStudent(
  ctx: AuthContext,
  tenantId: string,
  input: {
    studentId: string;
    classId?: string;
    campusId?: string;
    academicYearId: string;
    discountAmount?: number;
    discountReason?: string;
  },
) {
  const { StudentAcademicEnrollment, Class, Student } = await import('@vebgenix/db');
  const { StudentFeeOrderService } = await import('./student-order.js');

  const enrollment = await StudentAcademicEnrollment.findOne({
    tenantId,
    studentId: new Types.ObjectId(input.studentId),
    academicYearId: new Types.ObjectId(input.academicYearId),
    status: 'ACTIVE',
  }).lean();

  let resolvedClassId = enrollment?.gradeId?.toString?.() ?? input.classId;
  let resolvedCampusId: string | undefined = input.campusId;
  if (!resolvedClassId || !resolvedCampusId) {
    const studentDoc = await (Student as unknown as { findOne: (q: unknown, proj: string) => { lean: () => Promise<{ classId?: { toString(): string }; campusId?: { toString(): string } } | null> } })
      .findOne({ tenantId, _id: new Types.ObjectId(input.studentId) }, 'classId campusId').lean();
    if (!resolvedClassId) resolvedClassId = studentDoc?.classId?.toString();
    if (!resolvedCampusId) resolvedCampusId = studentDoc?.campusId?.toString();
  }
  if (!resolvedClassId) {
    throw new AppError('BAD_REQUEST', 'Unable to resolve class for fee assignment');
  }
  if (!resolvedCampusId) {
    throw new AppError('BAD_REQUEST', 'Unable to resolve campus for fee assignment');
  }
  const campusId = resolvedCampusId;

  const classExists = await Class.findOne({
    tenantId,
    _id: new Types.ObjectId(resolvedClassId),
    isActive: true,
  }).lean();
  if (!classExists) {
    throw new AppError('NOT_FOUND', 'Class not found or inactive');
  }

  const mapping = await FinanceRepo.findApplicableFeeStructure(tenantId, resolvedClassId, input.academicYearId);
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

  const totalAmount    = roundMoney(structure.totalAmount);
  const discountAmount = roundMoney(input.discountAmount ?? 0);
  const netAmount      = roundMoney(totalAmount - discountAmount);

  const assignment = await FinanceRepo.createFeeAssignment(tenantId, {
    studentId:      input.studentId,
    feeStructureId: structure._id.toString(),
    academicYearId: input.academicYearId,
    classId:        resolvedClassId,
    totalAmount,
    discountAmount,
    netAmount,
    discountReason: input.discountReason,
    assignedBy:     ctx.membership?.profileId ?? ctx.userId,
    status:         'ACTIVE',
  });

  const orders = await StudentFeeOrderService.generateFromAssignment(ctx, tenantId, {
    assignment,
    structure,
    schedule,
    mapping,
    studentId:      input.studentId,
    campusId:       campusId,
    academicYearId: input.academicYearId,
    classId:        resolvedClassId,
  });

  return { assignment, orders, mapping, structure, schedule };
}
