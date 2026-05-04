import { AuthContext } from '@vebgenix/auth';
import { FinanceRepo } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { Types } from 'mongoose';

export interface CopyFeePatternToNextYearInput {
  fromAcademicYearId: string;
  toAcademicYearId:   string;
  campusId?:          string;
  fromGradeId?:       string;   // classId — scope copy to one grade
  toGradeId?:         string;   // classId — target grade in new year
  feeCategoryId?:     string;   // optional — scope copy to one category
  activateCopies?:    boolean;  // default false — copies start as DRAFT (isActive:false)
}

function shiftDateByOneYear(d: Date): Date {
  const nd = new Date(d);
  nd.setFullYear(nd.getFullYear() + 1);
  return nd;
}

export class CopyFeePatternToNextYear {
  static async execute(ctx: AuthContext, input: CopyFeePatternToNextYearInput) {
    authorize(ctx, 'finance.fee_pattern.copy');
    const tenantId = getTenantId(ctx);
    const profileId = ctx.membership!.profileId;

    // ── Find source fee schedules ─────────────────────────────────────────────
    const scheduleFilter: Record<string, unknown> = { academicYearId: input.fromAcademicYearId };
    if (input.campusId)     scheduleFilter.campusId     = new Types.ObjectId(input.campusId);
    if (input.feeCategoryId) scheduleFilter.feeCategoryId = new Types.ObjectId(input.feeCategoryId);

    const sourceSchedules = await FinanceRepo.listFeeSchedules(tenantId, scheduleFilter);

    // ── Copy each schedule, shifting slot due dates by +1 year ───────────────
    const scheduleIdMap = new Map<string, string>(); // old id → new id

    for (const src of sourceSchedules) {
      // Avoid duplicating an already-copied schedule for the same target year
      const existing = await FinanceRepo.listFeeSchedules(tenantId, {
        academicYearId: input.toAcademicYearId,
        name: `${src.name} (copied)`,
      });
      if (existing.length > 0) {
        scheduleIdMap.set(src._id.toString(), existing[0]._id.toString());
        continue;
      }

      const copied = await FinanceRepo.createFeeSchedule(tenantId, {
        name:                `${src.name} (copied)`,
        academicYearId:      input.toAcademicYearId,
        feeCategoryId:       src.feeCategoryId,
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

    // ── Find source fee structures ────────────────────────────────────────────
    const structureFilter: Record<string, unknown> = {
      academicYearId: new Types.ObjectId(input.fromAcademicYearId),
      isActive: true,
    };
    if (input.campusId)      structureFilter.campusId      = new Types.ObjectId(input.campusId);
    if (input.fromGradeId)   structureFilter.classId       = new Types.ObjectId(input.fromGradeId);
    if (input.feeCategoryId) structureFilter.feeCategoryId = new Types.ObjectId(input.feeCategoryId);

    const sourceStructures = await FinanceRepo.listFeeStructures(tenantId, structureFilter);

    // ── Copy each structure ───────────────────────────────────────────────────
    const copiedStructureIds: string[] = [];

    for (const src of sourceStructures) {
      const newScheduleId = src.feeScheduleId
        ? scheduleIdMap.get(src.feeScheduleId.toString())
        : undefined;

      const copied = await FinanceRepo.createFeeStructure(tenantId, {
        name:             `${src.name} (copied)`,
        campusId:         src.campusId,
        academicYearId:   new Types.ObjectId(input.toAcademicYearId),
        classId:          input.toGradeId ? new Types.ObjectId(input.toGradeId) : src.classId,
        programId:        src.programId,
        feeCategoryId:    src.feeCategoryId,
        feeScheduleId:    newScheduleId ? new Types.ObjectId(newScheduleId) : undefined,
        allocationMethod: src.allocationMethod,
        studentCategoryId: src.studentCategoryId,
        components:       src.components.map((c: { feeHeadId: unknown; feeHeadName: string; amount: number; isOptional: boolean; priorityOrder: number }) => ({
          feeHeadId:     c.feeHeadId,
          feeHeadName:   c.feeHeadName,
          amount:        c.amount,
          isOptional:    c.isOptional,
          priorityOrder: c.priorityOrder,
        })),
        totalAmount:      src.totalAmount,
        isActive:         input.activateCopies ?? false,
        createdBy:        new Types.ObjectId(profileId),
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
}
