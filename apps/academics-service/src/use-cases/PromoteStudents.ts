import { AuthContext } from '@vebgenix/auth';
import {
  AcademicYear,
  AcademicsRepo,
  Exam,
  FeeCategory,
  FeeSchedule,
  FeeStructure,
  FinanceRepo,
  FinanceSequence,
  Invoice,
  Student,
  StudentAcademicEnrollment,
} from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import mongoose, { Types } from 'mongoose';

export interface SectionAssignment {
  studentId: string;
  sectionId: string;
}

export interface SubjectGroupSectionMapping {
  subjectGroupId: string;
  sectionId: string;
}

export interface TransportRouteSectionMapping {
  transportRouteId: string;
  sectionId: string;
}

export interface PromoteStudentsInput {
  fromAcademicYearId:   string;
  toAcademicYearId:     string;
  campusId:             string;
  fromGradeId:          string;
  toGradeId:            string;
  studentIds:           string[];

  sectionStrategy:
    | 'SAME_SECTION'
    | 'MANUAL'
    | 'AUTO_SHUFFLE'
    | 'GENDER_BALANCE'
    | 'CAPACITY_LIMIT'
    | 'PERFORMANCE_RANK'
    | 'SUBJECT_GROUP'
    | 'TRANSPORT_ROUTE'
    | 'EXCEL_IMPORT';

  sectionAssignments?:       SectionAssignment[];   // MANUAL / EXCEL_IMPORT
  targetSectionIds?:         string[];              // AUTO_SHUFFLE / GENDER_BALANCE / CAPACITY_LIMIT / PERFORMANCE_RANK / *_GROUP fallback
  maxStudentsPerSection?:    number;                // CAPACITY_LIMIT
  rankByExamId?:             string;               // PERFORMANCE_RANK
  subjectGroupSectionMap?:   SubjectGroupSectionMapping[];  // SUBJECT_GROUP
  transportRouteSectionMap?: TransportRouteSectionMapping[]; // TRANSPORT_ROUTE

  // Eligibility
  eligibilityMode?: 'USE_ENROLLMENT_ELIGIBILITY' | 'IGNORE_RESULTS';  // default: USE_ENROLLMENT_ELIGIBILITY

  feeAction:            'SKIP' | 'ASSIGN_EXISTING' | 'COPY_PATTERN';
  feeStructureId?:      string;
  feeStructureIds?:     string[];
  feeCategoryId?:       string;
  allowPendingFee?:     boolean;
  force?:               boolean;
}

type PromotionFeeStructure = {
  _id: Types.ObjectId;
  campusId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  programId?: Types.ObjectId;
  classId?: Types.ObjectId;
  name: string;
  components: Array<{
    feeHeadId: Types.ObjectId;
    feeHeadName: string;
    amount: number;
    isOptional?: boolean;
    priorityOrder?: number;
  }>;
  totalAmount: number;
  isActive: boolean;
  feeCategoryId?: Types.ObjectId;
  feeScheduleId?: Types.ObjectId;
  allocationMethod?: 'PRO_RATA' | 'PRIORITY_WISE' | 'MANUAL';
  studentCategoryId?: Types.ObjectId;
};

type PromotionFeeSchedule = {
  _id: Types.ObjectId;
  name: string;
  academicYearId: string;
  feeCategoryId?: Types.ObjectId;
  campusId?: Types.ObjectId;
  allowPartialPayment?: boolean;
  collectionType?: 'FULL_ONLY' | 'PARTIAL_ALLOWED' | 'PARTIAL_WITH_MINIMUM_AMOUNT' | 'PARTIAL_WITH_MINIMUM_PERCENTAGE';
  minimumAmount?: number;
  minimumPercentage?: number;
  graceDays?: number;
  lateFeeEnabled?: boolean;
  notificationEnabled?: boolean;
  slots?: Array<{ name: string; dueDate: Date; percentOfTotal?: number; fixedAmount?: number }>;
};

type PromotionFeeAssignmentResult = {
  status: 'ASSIGNED' | 'SKIPPED' | 'FAILED';
  generatedInvoiceIds: Types.ObjectId[];
  remarks?: string;
};

// ── Section resolver helpers ──────────────────────────────────────────────────

async function resolveSameSection(
  tenantId: string,
  toGradeId: string,
  toAcademicYearId: string,
  currentSectionId: Types.ObjectId | undefined,
): Promise<string | undefined> {
  if (!currentSectionId) return undefined;
  const currentSection = await AcademicsRepo.getSectionById(tenantId, currentSectionId.toString());
  if (!currentSection) return undefined;
  const match = await AcademicsRepo.findSectionByName(tenantId, toGradeId, toAcademicYearId, currentSection.name);
  return match?._id?.toString();
}

function buildRoundRobinAssigner(targetSectionIds: string[]) {
  let idx = 0;
  return () => {
    const sectionId = targetSectionIds[idx % targetSectionIds.length];
    idx++;
    return sectionId;
  };
}

function toObjectId(id: string | Types.ObjectId): Types.ObjectId {
  return typeof id === 'string' ? new Types.ObjectId(id) : id;
}

const DEFAULT_FEE_PREFIX = 'FEE';

function normalizeFeePrefix(value: string | undefined, fallbackName = DEFAULT_FEE_PREFIX): string {
  const source = value?.trim() || fallbackName;
  const words = source
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const prefix = words.length > 1
    ? words.map((word) => word[0]).join('')
    : (words[0] ?? DEFAULT_FEE_PREFIX).slice(0, 4);
  return (prefix || DEFAULT_FEE_PREFIX).slice(0, 8);
}

async function resolveAcademicYearCode(tenantId: string, academicYearId: string | Types.ObjectId): Promise<string> {
  const academicYear = await AcademicYear.findOne({ tenantId, _id: toObjectId(academicYearId) }).lean();

  if (academicYear?.startDate && academicYear?.endDate) {
    const start = academicYear.startDate.getFullYear() % 100;
    const end = academicYear.endDate.getFullYear() % 100;
    return `${start.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`;
  }

  if (academicYear?.name) {
    const match = academicYear.name.match(/(\d{2,4})\D+(\d{2,4})/);
    if (match) {
      const start = Number(match[1]) % 100;
      const end = Number(match[2]) % 100;
      return `${start.toString().padStart(2, '0')}-${end.toString().padStart(2, '0')}`;
    }
  }

  const currentYear = new Date().getFullYear() % 100;
  return `${currentYear.toString().padStart(2, '0')}-${((currentYear + 1) % 100).toString().padStart(2, '0')}`;
}

async function generatePromotionFeeOrderId(
  tenantId: string,
  prefix: string,
  academicYearId: string | Types.ObjectId,
): Promise<string> {
  const academicYearCode = await resolveAcademicYearCode(tenantId, academicYearId);
  const normalizedPrefix = normalizeFeePrefix(prefix);
  const key = `ORD:${normalizedPrefix}:${academicYearCode}`;
  const sequence = await FinanceSequence.findOneAndUpdate(
    { tenantId, scope: 'finance', key },
    { $inc: { value: 1 }, $setOnInsert: { tenantId, scope: 'finance', key } },
    { upsert: true, new: true },
  );
  return `${normalizedPrefix}_${academicYearCode}_ORD_${sequence.value.toString().padStart(6, '0')}`;
}

function shiftDateByYears(date: Date, years: number): Date {
  const shifted = new Date(date);
  shifted.setFullYear(shifted.getFullYear() + years);
  return shifted;
}

async function hasPendingFees(tenantId: string, studentId: string, academicYearId: string): Promise<boolean> {
  const pending = await Invoice.findOne({
    tenantId,
    studentId:      new Types.ObjectId(studentId),
    academicYearId: new Types.ObjectId(academicYearId),
    dueAmount:      { $gt: 0 },
    status:         { $in: ['PENDING', 'PARTIALLY_PAID', 'OVERDUE'] },
  }).lean();
  return Boolean(pending);
}

async function findTargetFeeStructures(
  tenantId: string,
  input: PromoteStudentsInput,
): Promise<PromotionFeeStructure[]> {
  const explicitIds = Array.from(new Set([
    ...(input.feeStructureIds ?? []),
    ...(input.feeStructureId ? [input.feeStructureId] : []),
  ]));

  if (explicitIds.length > 0) {
    const structures = await FeeStructure.find({
      tenantId,
      _id:            { $in: explicitIds.map((id) => new Types.ObjectId(id)) },
      academicYearId: new Types.ObjectId(input.toAcademicYearId),
      campusId:       new Types.ObjectId(input.campusId),
      isActive:       true,
    }).lean() as unknown as PromotionFeeStructure[];

    if (structures.length !== explicitIds.length) {
      throw new AppError('NOT_FOUND', 'One or more target fee structures were not found for the target academic year/campus');
    }

    const wrongGrade = structures.find((structure) =>
      structure.classId && structure.classId.toString() !== input.toGradeId
    );
    if (wrongGrade) {
      throw new AppError('BAD_REQUEST', `Fee structure ${wrongGrade.name} does not belong to the target grade`);
    }

    return structures;
  }

  const query: Record<string, unknown> = {
    tenantId,
    academicYearId: new Types.ObjectId(input.toAcademicYearId),
    campusId:       new Types.ObjectId(input.campusId),
    classId:        new Types.ObjectId(input.toGradeId),
    isActive:       true,
  };
  if (input.feeCategoryId) query.feeCategoryId = new Types.ObjectId(input.feeCategoryId);

  return FeeStructure.find(query).lean() as unknown as PromotionFeeStructure[];
}

async function copyFeePatternForPromotion(
  tenantId: string,
  profileId: string,
  input: PromoteStudentsInput,
): Promise<PromotionFeeStructure[]> {
  const existingTargets = await findTargetFeeStructures(tenantId, { ...input, feeStructureId: undefined, feeStructureIds: undefined });
  if (existingTargets.length > 0) return existingTargets;

  const targetYearCode = await resolveAcademicYearCode(tenantId, input.toAcademicYearId);
  const sourceScheduleQuery: Record<string, unknown> = {
    tenantId,
    academicYearId: input.fromAcademicYearId,
  };
  if (input.campusId) sourceScheduleQuery.campusId = new Types.ObjectId(input.campusId);
  if (input.feeCategoryId) sourceScheduleQuery.feeCategoryId = new Types.ObjectId(input.feeCategoryId);

  const sourceSchedules = await FeeSchedule.find(sourceScheduleQuery).lean() as unknown as PromotionFeeSchedule[];
  const scheduleIdMap = new Map<string, Types.ObjectId>();

  for (const source of sourceSchedules) {
    const copiedName = `${source.name} (${targetYearCode})`;
    const existing = await FeeSchedule.findOne({
      tenantId,
      academicYearId: input.toAcademicYearId,
      name: copiedName,
    }).lean() as unknown as PromotionFeeSchedule | null;

    if (existing) {
      scheduleIdMap.set(source._id.toString(), existing._id);
      continue;
    }

    const copied = await FeeSchedule.create({
      tenantId,
      name: copiedName,
      academicYearId: input.toAcademicYearId,
      feeCategoryId: source.feeCategoryId,
      campusId: source.campusId,
      allowPartialPayment: source.allowPartialPayment ?? true,
      collectionType: source.collectionType ?? 'PARTIAL_ALLOWED',
      minimumAmount: source.minimumAmount ?? 0,
      minimumPercentage: source.minimumPercentage ?? 0,
      graceDays: source.graceDays ?? 0,
      lateFeeEnabled: source.lateFeeEnabled ?? false,
      notificationEnabled: source.notificationEnabled ?? false,
      isActive: true,
      createdBy: profileId,
      slots: (source.slots ?? []).map((slot) => ({
        name: slot.name,
        dueDate: shiftDateByYears(slot.dueDate, 1),
        percentOfTotal: slot.percentOfTotal,
        fixedAmount: slot.fixedAmount,
      })),
    });
    scheduleIdMap.set(source._id.toString(), copied._id);
  }

  const sourceStructureQuery: Record<string, unknown> = {
    tenantId,
    academicYearId: new Types.ObjectId(input.fromAcademicYearId),
    campusId:       new Types.ObjectId(input.campusId),
    classId:        new Types.ObjectId(input.fromGradeId),
    isActive:       true,
  };
  if (input.feeCategoryId) sourceStructureQuery.feeCategoryId = new Types.ObjectId(input.feeCategoryId);

  const sourceStructures = await FeeStructure.find(sourceStructureQuery).lean() as unknown as PromotionFeeStructure[];

  for (const source of sourceStructures) {
    const copiedName = `${source.name} (${targetYearCode})`;
    const existing = await FeeStructure.findOne({
      tenantId,
      academicYearId: new Types.ObjectId(input.toAcademicYearId),
      campusId:       new Types.ObjectId(input.campusId),
      classId:        new Types.ObjectId(input.toGradeId),
      name:           copiedName,
    }).lean();

    if (existing) continue;

    const copiedScheduleId = source.feeScheduleId
      ? scheduleIdMap.get(source.feeScheduleId.toString())
      : undefined;

    await FeeStructure.create({
      tenantId,
      name: copiedName,
      campusId: new Types.ObjectId(input.campusId),
      academicYearId: new Types.ObjectId(input.toAcademicYearId),
      classId: new Types.ObjectId(input.toGradeId),
      programId: source.programId,
      feeCategoryId: source.feeCategoryId,
      feeScheduleId: copiedScheduleId,
      allocationMethod: source.allocationMethod ?? 'PRO_RATA',
      studentCategoryId: source.studentCategoryId,
      components: source.components.map((component) => ({
        feeHeadId: component.feeHeadId,
        feeHeadName: component.feeHeadName,
        amount: component.amount,
        isOptional: component.isOptional ?? false,
        priorityOrder: component.priorityOrder ?? 0,
      })),
      totalAmount: source.totalAmount,
      isActive: true,
      createdBy: new Types.ObjectId(profileId),
    });
  }

  return findTargetFeeStructures(tenantId, { ...input, feeStructureId: undefined, feeStructureIds: undefined });
}

async function createPromotionInvoiceFromStructure(
  ctx: AuthContext,
  tenantId: string,
  input: PromoteStudentsInput,
  studentId: string,
  structure: PromotionFeeStructure,
): Promise<Types.ObjectId> {
  const existingInvoice = await Invoice.findOne({
    tenantId,
    studentId:      new Types.ObjectId(studentId),
    feeStructureId: structure._id,
    academicYearId: new Types.ObjectId(input.toAcademicYearId),
    status:         { $nin: ['CANCELLED'] },
  }).lean();
  if (existingInvoice?._id) return existingInvoice._id;

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

  let collectionType: 'FULL_ONLY' | 'PARTIAL_ALLOWED' | 'PARTIAL_WITH_MINIMUM_AMOUNT' | 'PARTIAL_WITH_MINIMUM_PERCENTAGE' = 'PARTIAL_ALLOWED';
  let minimumAmount = 0;
  let minimumPercentage = 0;
  let allowPartialPayment = true;
  let graceDays = 0;
  let dueDate: Date | undefined;

  if (structure.feeScheduleId) {
    const schedule = await FeeSchedule.findOne({ tenantId, _id: structure.feeScheduleId }).lean() as unknown as PromotionFeeSchedule | null;
    if (schedule) {
      collectionType = schedule.collectionType ?? 'PARTIAL_ALLOWED';
      minimumAmount = schedule.minimumAmount ?? 0;
      minimumPercentage = schedule.minimumPercentage ?? 0;
      allowPartialPayment = schedule.allowPartialPayment ?? true;
      graceDays = schedule.graceDays ?? 0;
      if (schedule.slots?.length) dueDate = schedule.slots[0].dueDate;
    }
  }

  const totalAmount = structure.totalAmount;
  const feeOrderId = await generatePromotionFeeOrderId(tenantId, invoicePrefix, input.toAcademicYearId);
  const items = structure.components.map((component) => ({
    feeHeadId: component.feeHeadId,
    feeHeadName: component.feeHeadName,
    amount: component.amount,
    concession: 0,
    netAmount: component.amount,
    paidAmount: 0,
    balanceAmount: component.amount,
    priorityOrder: component.priorityOrder ?? 0,
  }));

  await FinanceRepo.createFeeAssignment(tenantId, {
    studentId,
    feeStructureId: structure._id.toString(),
    academicYearId: input.toAcademicYearId,
    classId: input.toGradeId,
    totalAmount,
    discountAmount: 0,
    netAmount: totalAmount,
    assignedBy: ctx.membership!.profileId,
    status: 'ACTIVE',
  });

  const invoice = await FinanceRepo.createInvoice(tenantId, {
    campusId: new Types.ObjectId(input.campusId),
    studentId: new Types.ObjectId(studentId),
    academicYearId: new Types.ObjectId(input.toAcademicYearId),
    classId: new Types.ObjectId(input.toGradeId),
    feeOrderId,
    feeHeadPrefix: invoicePrefix.replace(/\//g, '_'),
    invoiceNumber: feeOrderId,
    status: 'PENDING',
    items,
    totalAmount,
    concessionAmount: 0,
    netAmount: totalAmount,
    paidAmount: 0,
    dueAmount: totalAmount,
    dueDate,
    issuedAt: new Date(),
    issuedBy: new Types.ObjectId(ctx.membership!.profileId),
    feeCategoryId: structure.feeCategoryId,
    feeStructureId: structure._id,
    feeScheduleId: structure.feeScheduleId,
    allocationMethod: structure.allocationMethod ?? defaultAllocationMethod,
    collectionType,
    minimumAmount,
    minimumPercentage,
    allowPartialPayment,
    graceDays,
    invoicePrefix,
    receiptPrefix,
  });

  return invoice._id;
}

async function assignPromotionFees(
  ctx: AuthContext,
  tenantId: string,
  input: PromoteStudentsInput,
  studentId: string,
  targetFeeStructures: PromotionFeeStructure[],
): Promise<PromotionFeeAssignmentResult> {
  if (targetFeeStructures.length === 0) {
    return { status: 'SKIPPED', generatedInvoiceIds: [], remarks: 'No target fee structures found' };
  }

  const generatedInvoiceIds: Types.ObjectId[] = [];
  for (const structure of targetFeeStructures) {
    try {
      const invoiceId = await createPromotionInvoiceFromStructure(ctx, tenantId, input, studentId, structure);
      generatedInvoiceIds.push(invoiceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Fee assignment failed';
      return { status: 'FAILED', generatedInvoiceIds, remarks: message };
    }
  }

  return { status: 'ASSIGNED', generatedInvoiceIds };
}

// ── Pre-sort helpers for advanced strategies ──────────────────────────────────

async function buildPerformanceOrder(
  tenantId: string,
  studentIds: string[],
  examId: string,
): Promise<string[]> {
  const exam = await Exam.findOne({ tenantId, _id: new Types.ObjectId(examId) }).lean();
  if (!exam) throw new AppError('NOT_FOUND', `Exam ${examId} not found`);

  const marksMap = new Map<string, number>();
  for (const entry of exam.marksEntries) {
    if (!entry.isAbsent) {
      marksMap.set(entry.studentId.toString(), entry.marksObtained);
    }
  }

  return [...studentIds].sort((a, b) => (marksMap.get(b) ?? 0) - (marksMap.get(a) ?? 0));
}

async function buildSubjectGroupMap(
  tenantId: string,
  studentIds: string[],
  academicYearId: string,
): Promise<Map<string, string | undefined>> {
  const enrollments = await StudentAcademicEnrollment.find({
    tenantId,
    studentId:      { $in: studentIds.map((id) => new Types.ObjectId(id)) },
    academicYearId: new Types.ObjectId(academicYearId),
    status:         'ACTIVE',
  }).lean();
  const map = new Map<string, string | undefined>();
  for (const e of enrollments) map.set(e.studentId.toString(), e.subjectGroupId);
  return map;
}

async function buildTransportRouteMap(
  tenantId: string,
  studentIds: string[],
): Promise<Map<string, string | undefined>> {
  const students = await Student.find({
    tenantId,
    _id: { $in: studentIds.map((id) => new Types.ObjectId(id)) },
  }).lean();
  const map = new Map<string, string | undefined>();
  for (const s of students) map.set(s._id.toString(), s.transportRouteId);
  return map;
}

// ── Main use case ─────────────────────────────────────────────────────────────

export class PromoteStudents {
  static async execute(ctx: AuthContext, input: PromoteStudentsInput) {
    authorize(ctx, 'academics.promotion.create');
    const tenantId  = getTenantId(ctx);
    const profileId = ctx.membership!.profileId;

    if (!input.studentIds?.length) {
      throw new AppError('BAD_REQUEST', 'studentIds must not be empty');
    }

    // ── Strategy-specific input validation ────────────────────────────────
    if (input.sectionStrategy === 'MANUAL' || input.sectionStrategy === 'EXCEL_IMPORT') {
      if (!input.sectionAssignments?.length) {
        throw new AppError('BAD_REQUEST', 'sectionAssignments is required for MANUAL/EXCEL_IMPORT strategy');
      }
    }
    if (['AUTO_SHUFFLE', 'GENDER_BALANCE', 'CAPACITY_LIMIT'].includes(input.sectionStrategy)) {
      if (!input.targetSectionIds?.length) {
        throw new AppError('BAD_REQUEST', 'targetSectionIds is required for this section strategy');
      }
    }
    if (input.sectionStrategy === 'PERFORMANCE_RANK') {
      if (!input.rankByExamId) throw new AppError('BAD_REQUEST', 'rankByExamId is required for PERFORMANCE_RANK strategy');
      if (!input.targetSectionIds?.length) throw new AppError('BAD_REQUEST', 'targetSectionIds is required for PERFORMANCE_RANK strategy');
    }
    if (input.sectionStrategy === 'SUBJECT_GROUP') {
      if (!input.subjectGroupSectionMap?.length) throw new AppError('BAD_REQUEST', 'subjectGroupSectionMap is required for SUBJECT_GROUP strategy');
      if (!input.targetSectionIds?.length) throw new AppError('BAD_REQUEST', 'targetSectionIds is required for SUBJECT_GROUP fallback');
    }
    if (input.sectionStrategy === 'TRANSPORT_ROUTE') {
      if (!input.transportRouteSectionMap?.length) throw new AppError('BAD_REQUEST', 'transportRouteSectionMap is required for TRANSPORT_ROUTE strategy');
      if (!input.targetSectionIds?.length) throw new AppError('BAD_REQUEST', 'targetSectionIds is required for TRANSPORT_ROUTE fallback');
    }

    let targetFeeStructures: PromotionFeeStructure[] = [];
    if (input.feeAction !== 'SKIP') {
      authorize(ctx, 'finance.fee_assignment.create');
      if (input.feeAction === 'COPY_PATTERN') {
        authorize(ctx, 'finance.fee_pattern.copy');
        targetFeeStructures = await copyFeePatternForPromotion(tenantId, profileId, input);
      } else {
        targetFeeStructures = await findTargetFeeStructures(tenantId, input);
      }

      if (targetFeeStructures.length === 0) {
        throw new AppError('BAD_REQUEST', 'No active target fee structures found for promotion fee assignment');
      }
    }

    // ── Create promotion batch ─────────────────────────────────────────────
    const batch = await AcademicsRepo.createPromotionBatch(tenantId, {
      fromAcademicYearId: new Types.ObjectId(input.fromAcademicYearId),
      toAcademicYearId:   new Types.ObjectId(input.toAcademicYearId),
      campusId:           new Types.ObjectId(input.campusId),
      fromGradeId:        new Types.ObjectId(input.fromGradeId),
      toGradeId:          new Types.ObjectId(input.toGradeId),
      sectionStrategy:    input.sectionStrategy,
      feeAction:          input.feeAction,
      status:             'PROCESSING',
      totalStudents:      input.studentIds.length,
      createdBy:          new Types.ObjectId(profileId),
    });

    // ── Build pre-sort ordering for advanced strategies ────────────────────
    let orderedStudentIds = [...input.studentIds];

    if (input.sectionStrategy === 'PERFORMANCE_RANK' && input.rankByExamId) {
      orderedStudentIds = await buildPerformanceOrder(tenantId, orderedStudentIds, input.rankByExamId);
    }

    // Gender balance: interleave M/F then round-robin
    if (input.sectionStrategy === 'GENDER_BALANCE' && input.targetSectionIds?.length) {
      const students = await Student.find({ tenantId, _id: { $in: orderedStudentIds.map(id => new Types.ObjectId(id)) } }).lean();
      const genderMap = new Map(students.map(s => [s._id.toString(), s.gender ?? 'UNKNOWN']));
      const males   = orderedStudentIds.filter(id => genderMap.get(id) === 'MALE');
      const females = orderedStudentIds.filter(id => genderMap.get(id) === 'FEMALE');
      const others  = orderedStudentIds.filter(id => !['MALE','FEMALE'].includes(genderMap.get(id) ?? ''));
      const interleaved: string[] = [];
      const maxLen = Math.max(males.length, females.length);
      for (let i = 0; i < maxLen; i++) {
        if (i < males.length)   interleaved.push(males[i]);
        if (i < females.length) interleaved.push(females[i]);
      }
      orderedStudentIds = [...interleaved, ...others];
    }

    // ── Pre-load lookup maps for advanced strategies ───────────────────────
    const manualMap = new Map<string, string>(
      (input.sectionAssignments ?? []).map(a => [a.studentId, a.sectionId]),
    );

    let subjectGroupMap = new Map<string, string | undefined>();
    if (input.sectionStrategy === 'SUBJECT_GROUP') {
      subjectGroupMap = await buildSubjectGroupMap(tenantId, orderedStudentIds, input.fromAcademicYearId);
    }

    let transportRouteMap = new Map<string, string | undefined>();
    if (input.sectionStrategy === 'TRANSPORT_ROUTE') {
      transportRouteMap = await buildTransportRouteMap(tenantId, orderedStudentIds);
    }

    const subjectGroupLookup = new Map<string, string>(
      (input.subjectGroupSectionMap ?? []).map(m => [m.subjectGroupId, m.sectionId]),
    );
    const transportRouteLookup = new Map<string, string>(
      (input.transportRouteSectionMap ?? []).map(m => [m.transportRouteId, m.sectionId]),
    );

    const sectionCounts = new Map<string, number>();
    const nextRoundRobin = (input.targetSectionIds && ['AUTO_SHUFFLE', 'PERFORMANCE_RANK'].includes(input.sectionStrategy))
      ? buildRoundRobinAssigner(input.targetSectionIds)
      : null;
    const fallbackRoundRobin = (input.targetSectionIds && ['SUBJECT_GROUP', 'TRANSPORT_ROUTE'].includes(input.sectionStrategy))
      ? buildRoundRobinAssigner(input.targetSectionIds)
      : null;

    // ── Process each student ───────────────────────────────────────────────
    let promotedCount = 0;
    let detainedCount = 0;
    let skippedCount  = 0;
    let failedCount   = 0;

    const batchItems: Array<{
      studentId: string;
      fromEnrollment: Awaited<ReturnType<typeof AcademicsRepo.findEnrollment>>;
      targetSectionId: string | undefined;
      action: 'PROMOTE' | 'DETAIN' | 'SKIP';
      remarks?: string;
    }> = [];

    for (const studentId of orderedStudentIds) {
      const currentEnrollment = await AcademicsRepo.findEnrollment(tenantId, studentId, input.fromAcademicYearId);

      if (!currentEnrollment) {
        skippedCount++;
        batchItems.push({ studentId, fromEnrollment: null, targetSectionId: undefined, action: 'SKIP', remarks: 'No active enrollment in source year' });
        continue;
      }

      // ── Already promoted? ────────────────────────────────────────────────
      const alreadyPromoted = await AcademicsRepo.findEnrollment(tenantId, studentId, input.toAcademicYearId);
      if (alreadyPromoted) {
        skippedCount++;
        batchItems.push({ studentId, fromEnrollment: currentEnrollment, targetSectionId: undefined, action: 'SKIP', remarks: 'Already has enrollment in target year' });
        continue;
      }

      // ── Result-based eligibility check ───────────────────────────────────
      const eligibilityMode = input.eligibilityMode ?? 'USE_ENROLLMENT_ELIGIBILITY';
      if (eligibilityMode !== 'IGNORE_RESULTS' && !input.force) {
        const elig = currentEnrollment.promotionEligibility;
        if (elig === 'DETAINED') {
          detainedCount++;
          batchItems.push({ studentId, fromEnrollment: currentEnrollment, targetSectionId: undefined, action: 'DETAIN', remarks: 'Result: DETAINED' });
          continue;
        }
        if (elig === 'ON_HOLD') {
          skippedCount++;
          batchItems.push({ studentId, fromEnrollment: currentEnrollment, targetSectionId: undefined, action: 'SKIP', remarks: 'Result: ON_HOLD — requires manual review' });
          continue;
        }
        // elig === 'ELIGIBLE' or undefined → proceed normally
      }

      // ── Pending fee check ────────────────────────────────────────────────
      if (input.allowPendingFee === false && !input.force) {
        const pendingFees = await hasPendingFees(tenantId, studentId, input.fromAcademicYearId);
        if (pendingFees) {
          skippedCount++;
          batchItems.push({ studentId, fromEnrollment: currentEnrollment, targetSectionId: undefined, action: 'SKIP', remarks: 'Pending fee balance exists' });
          continue;
        }
      }

      // ── Resolve target section ──────────────────────────────────────────
      let targetSectionId: string | undefined;

      if (input.sectionStrategy === 'SAME_SECTION') {
        targetSectionId = await resolveSameSection(tenantId, input.toGradeId, input.toAcademicYearId, currentEnrollment.sectionId);

      } else if (input.sectionStrategy === 'MANUAL' || input.sectionStrategy === 'EXCEL_IMPORT') {
        targetSectionId = manualMap.get(studentId);

      } else if ((input.sectionStrategy === 'AUTO_SHUFFLE' || input.sectionStrategy === 'PERFORMANCE_RANK') && nextRoundRobin) {
        targetSectionId = nextRoundRobin();

      } else if (input.sectionStrategy === 'GENDER_BALANCE' && input.targetSectionIds?.length) {
        const idx = (promotedCount + detainedCount + skippedCount) % input.targetSectionIds.length;
        targetSectionId = input.targetSectionIds[idx];

      } else if (input.sectionStrategy === 'CAPACITY_LIMIT' && input.targetSectionIds?.length) {
        const max = input.maxStudentsPerSection ?? 40;
        targetSectionId = input.targetSectionIds.find(sid => (sectionCounts.get(sid) ?? 0) < max);
        if (!targetSectionId) {
          skippedCount++;
          batchItems.push({ studentId, fromEnrollment: currentEnrollment, targetSectionId: undefined, action: 'SKIP', remarks: 'All target sections at capacity' });
          continue;
        }
        sectionCounts.set(targetSectionId, (sectionCounts.get(targetSectionId) ?? 0) + 1);

      } else if (input.sectionStrategy === 'SUBJECT_GROUP') {
        const groupId = subjectGroupMap.get(studentId);
        targetSectionId = groupId ? subjectGroupLookup.get(groupId) : undefined;
        if (!targetSectionId && fallbackRoundRobin) targetSectionId = fallbackRoundRobin();

      } else if (input.sectionStrategy === 'TRANSPORT_ROUTE') {
        const routeId = transportRouteMap.get(studentId);
        targetSectionId = routeId ? transportRouteLookup.get(routeId) : undefined;
        if (!targetSectionId && fallbackRoundRobin) targetSectionId = fallbackRoundRobin();
      }

      batchItems.push({ studentId, fromEnrollment: currentEnrollment, targetSectionId, action: 'PROMOTE' });
    }

    // ── Execute promotions inside per-student transactions ─────────────────
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const batchItemDocs: any[] = [];

    for (const item of batchItems) {
      if (item.action !== 'PROMOTE' || !item.fromEnrollment) {
        const skippedDoc: Record<string, unknown> = {
          promotionBatchId:    new Types.ObjectId(batch._id.toString()),
          studentId:           new Types.ObjectId(item.studentId),
          fromGradeId:         new Types.ObjectId(input.fromGradeId),
          fromSectionId:       item.fromEnrollment?.sectionId,
          toGradeId:           new Types.ObjectId(input.toGradeId),
          action:              item.action,
          feeAssignmentStatus: 'SKIPPED',
          generatedInvoiceIds: [],
          remarks:             item.remarks,
        };
        if (item.fromEnrollment) {
          skippedDoc.fromEnrollmentId = new Types.ObjectId(item.fromEnrollment._id.toString());
        }
        if (item.action === 'DETAIN') detainedCount++;
        batchItemDocs.push(skippedDoc);
        continue;
      }

      // Per-student transaction: enrollment ops are atomic; fee assignment is best-effort outside
      let newEnrollment: Awaited<ReturnType<typeof AcademicsRepo.createEnrollment>> | null = null;
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          await AcademicsRepo.updateEnrollment(tenantId, item.fromEnrollment._id.toString(), { status: 'PROMOTED' }, session);

          newEnrollment = await AcademicsRepo.createEnrollment(tenantId, {
            studentId:            new Types.ObjectId(item.studentId),
            academicYearId:       new Types.ObjectId(input.toAcademicYearId),
            campusId:             new Types.ObjectId(input.campusId),
            gradeId:              new Types.ObjectId(input.toGradeId),
            sectionId:            item.targetSectionId ? new Types.ObjectId(item.targetSectionId) : undefined,
            programId:            item.fromEnrollment.programId,
            joiningDate:          new Date(),
            joiningType:          'PROMOTED',
            registrationNoStatus: 'PENDING',
            rollNoStatus:         'PENDING',
            promotedFromEnrollmentId: new Types.ObjectId(item.fromEnrollment._id.toString()),
            status:               'ACTIVE',
            createdBy:            new Types.ObjectId(profileId),
          }, session);

          await AcademicsRepo.updateEnrollment(tenantId, item.fromEnrollment._id.toString(), {
            promotedToEnrollmentId: new Types.ObjectId(newEnrollment!._id.toString()),
          }, session);

          await AcademicsRepo.updateStudent(tenantId, item.studentId, {
            academicYearId: new Types.ObjectId(input.toAcademicYearId),
            classId:  new Types.ObjectId(input.toGradeId),
            sectionId: item.targetSectionId ? new Types.ObjectId(item.targetSectionId) : undefined,
          }, session);
        });
      } catch (err) {
        failedCount++;
        batchItemDocs.push({
          promotionBatchId:    new Types.ObjectId(batch._id.toString()),
          studentId:           new Types.ObjectId(item.studentId),
          fromEnrollmentId:    new Types.ObjectId(item.fromEnrollment._id.toString()),
          fromGradeId:         new Types.ObjectId(input.fromGradeId),
          fromSectionId:       item.fromEnrollment.sectionId,
          toGradeId:           new Types.ObjectId(input.toGradeId),
          action:              'PROMOTE',
          feeAssignmentStatus: 'FAILED',
          generatedInvoiceIds: [],
          remarks:             `Transaction failed: ${(err as Error).message}`,
        });
        continue;
      } finally {
        await session.endSession();
      }

      // Fee assignment — best-effort, outside transaction
      let feeResult: PromotionFeeAssignmentResult = { status: 'SKIPPED', generatedInvoiceIds: [] };
      if (input.feeAction !== 'SKIP') {
        feeResult = await assignPromotionFees(ctx, tenantId, input, item.studentId, targetFeeStructures);
        if (feeResult.status === 'FAILED') failedCount++;
      }

      batchItemDocs.push({
        promotionBatchId:     new Types.ObjectId(batch._id.toString()),
        studentId:            new Types.ObjectId(item.studentId),
        fromEnrollmentId:     new Types.ObjectId(item.fromEnrollment._id.toString()),
        toEnrollmentId:       new Types.ObjectId(newEnrollment!._id.toString()),
        fromGradeId:          new Types.ObjectId(input.fromGradeId),
        fromSectionId:        item.fromEnrollment.sectionId,
        toGradeId:            new Types.ObjectId(input.toGradeId),
        toSectionId:          item.targetSectionId ? new Types.ObjectId(item.targetSectionId) : undefined,
        action:               'PROMOTE',
        feeAssignmentStatus:  feeResult.status,
        targetFeeStructureId: targetFeeStructures.length === 1 ? targetFeeStructures[0]._id : undefined,
        generatedInvoiceIds:  feeResult.generatedInvoiceIds,
        remarks:              feeResult.remarks,
      });

      promotedCount++;
    }

    // Persist batch items
    await AcademicsRepo.createPromotionBatchItems(tenantId, batchItemDocs);

    const finalStatus = failedCount > 0
      ? (promotedCount > 0 ? 'PARTIALLY_COMPLETED' : 'FAILED')
      : 'COMPLETED';

    await AcademicsRepo.updatePromotionBatch(tenantId, batch._id.toString(), {
      status:         finalStatus,
      promotedCount,
      detainedCount,
      skippedCount,
      failedCount,
      completedAt:    new Date(),
    });

    await AuditLogger.logTenantAction({
      ctx, action: 'STUDENTS_PROMOTED',
      entityType: 'StudentPromotionBatch', entityId: batch._id.toString(),
      after: {
        fromAcademicYearId: input.fromAcademicYearId,
        toAcademicYearId:   input.toAcademicYearId,
        fromGradeId:        input.fromGradeId,
        toGradeId:          input.toGradeId,
        promotedCount, detainedCount, skippedCount, failedCount,
      },
    });

    return { batch: await AcademicsRepo.findPromotionBatchById(tenantId, batch._id.toString()), promotedCount, detainedCount, skippedCount, failedCount };
  }
}
