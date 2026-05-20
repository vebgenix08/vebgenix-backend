/**
 * Manual Fee Collection / Temporary Receipt operations
 *
 * Allows fee collection before students are formally imported/admitted.
 * Uses 3 separate tables:
 *   manual_student_fee_accounts
 *   manual_fee_collections
 *   manual_fee_collection_particulars
 */

import {
  ManualStudentFeeAccount,
  ManualFeeCollection,
  ManualFeeCollectionParticular,
  FeeStructureClassMapping,
  FeeStructure,
  AcademicSequence,
} from '@vebgenix/db';
import { authorize } from '@vebgenix/permissions';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { Types } from 'mongoose';
import { safeOid, toGql } from '../shared';
import { resolveAcademicYearCode, nextSequenceValue } from '../numbering';

// ── Admission number — uses the same AcademicSequence as actual admissions ──

async function generateAdmissionNo(tenantId: string, academicYearId: string): Promise<string> {
  const yearCode = await resolveAcademicYearCode(tenantId, academicYearId);
  const doc = await AcademicSequence.findOneAndUpdate(
    { tenantId, scope: 'ADMISSION', key: yearCode },
    { $inc: { value: 1 }, $setOnInsert: { tenantId, scope: 'ADMISSION', key: yearCode } },
    { upsert: true, new: true },
  );
  return `ADM/${yearCode}/${doc.value.toString().padStart(4, '0')}`;
}

// ── Receipt number — uses FinanceSequence shared with normal receipts ─────────

async function generateManualReceiptNo(tenantId: string, academicYearId: string): Promise<string> {
  const yearCode = await resolveAcademicYearCode(tenantId, academicYearId);
  const key = `RCP:${yearCode}`;
  const value = await nextSequenceValue(tenantId, key);
  return `RCP/${yearCode}/${value.toString().padStart(5, '0')}`;
}

// ── Load fee structure by grade/class mapping ─────────────────────────────────
// feeScheduleId is optional — when omitted, the first active mapping for the
// grade is used (because fee schedules are mapped to classes at creation time).

async function loadFeeStructureForGrade(
  tenantId: string,
  academicYearId: string,
  gradeId: string,
  feeScheduleId?: string,
): Promise<{ feeStructure: Record<string, unknown>; components: Array<Record<string, unknown>>; discoveredFeeScheduleId: string } | null> {
  const mappingFilter: Record<string, unknown> = {
    tenantId,
    academicYearId: new Types.ObjectId(academicYearId),
    classId:        new Types.ObjectId(gradeId),
    status:         'ACTIVE',
  };
  if (feeScheduleId) mappingFilter.feeScheduleId = new Types.ObjectId(feeScheduleId);

  const mapping = await FeeStructureClassMapping.findOne(mappingFilter).lean();

  if (!mapping) return null;

  const feeStructure = await FeeStructure.findOne({
    tenantId,
    _id: mapping.feeStructureId,
    isActive: true,
  }).lean();

  if (!feeStructure) return null;

  const components = (feeStructure.components ?? []).map((c: Record<string, unknown>, idx: number) => ({
    feeHeadId:    c.feeHeadId?.toString(),
    feeHeadName:  c.feeHeadName,
    amount:       c.amount,
    isOptional:   c.isOptional,
    priority:     c.priorityOrder ?? idx,
  }));

  return {
    feeStructure: {
      id:          feeStructure._id.toString(),
      name:        feeStructure.name,
      totalAmount: feeStructure.totalAmount,
    },
    components,
    discoveredFeeScheduleId: mapping.feeScheduleId.toString(),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

export async function handleManualCollection(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {

    // ── Generate next admission number preview ────────────────────────────────
    case 'generateManualAdmissionNo': {
      authorize(ctx, 'finance.manage');
      const { academicYearId } = args as { academicYearId: string };
      if (!academicYearId) throw new AppError('BAD_REQUEST', 'academicYearId is required');
      const admissionNo = await generateAdmissionNo(tenantId, academicYearId);
      return { admissionNo };
    }

    // ── Load fee structure for a given grade (fee schedule auto-discovered) ───
    case 'getManualFeeStructure': {
      authorize(ctx, 'finance.manage');
      const { academicYearId, gradeId } = args as {
        academicYearId: string;
        gradeId: string;
      };
      if (!academicYearId || !gradeId)
        throw new AppError('BAD_REQUEST', 'academicYearId and gradeId are required');

      const result = await loadFeeStructureForGrade(tenantId, academicYearId, gradeId);
      if (!result) throw new AppError('NOT_FOUND', 'No active fee structure found for the selected grade');
      return result;
    }

    // ── Create manual fee collection (main action) ────────────────────────────
    case 'createManualFeeCollection': {
      authorize(ctx, 'finance.manage');
      const input = (args.input as Record<string, unknown>) ?? args;

      const {
        academicYearId,
        campusId,
        gradeId,
        sectionId,
        studentName,
        studentDob,
        paidAmount: rawPaid,
        paymentMode,
        referenceNo,
        paymentDate,
        remarks,
        receivedBy,
      } = input as {
        academicYearId: string;
        campusId: string;
        gradeId: string;
        sectionId?: string;
        studentName: string;
        studentDob?: string;
        paidAmount: number;
        paymentMode: string;
        referenceNo?: string;
        paymentDate: string;
        remarks?: string;
        receivedBy?: string;
      };

      const paidAmount = Number(rawPaid);
      if (!paidAmount || paidAmount <= 0) throw new AppError('BAD_REQUEST', 'paidAmount must be greater than 0');
      if (!paymentMode) throw new AppError('BAD_REQUEST', 'paymentMode is required');
      if (!paymentDate) throw new AppError('BAD_REQUEST', 'paymentDate is required');
      if (!studentName?.trim()) throw new AppError('BAD_REQUEST', 'studentName is required');

      // Load fee structure — fee schedule is auto-discovered from the grade mapping
      const feeData = await loadFeeStructureForGrade(tenantId, academicYearId, gradeId);
      if (!feeData) throw new AppError('NOT_FOUND', 'No active fee structure found for the selected grade');

      const totalAmount        = feeData.feeStructure.totalAmount as number;
      const feeStructureId     = feeData.feeStructure.id as string;
      const feeScheduleId      = feeData.discoveredFeeScheduleId;
      const components         = feeData.components;

      if (paidAmount > totalAmount) throw new AppError('BAD_REQUEST', 'paidAmount cannot exceed total fee amount');

      // Generate admission number
      const admissionNo = await generateAdmissionNo(tenantId, academicYearId);

      // Generate receipt number
      const receiptNo = await generateManualReceiptNo(tenantId, academicYearId);

      const profileId = safeOid(ctx.membership?.profileId ?? ctx.userId);
      const collectedBy = receivedBy ? safeOid(receivedBy) : profileId;

      // Find or create manual fee account
      const existingAccount = await ManualStudentFeeAccount.findOne({
        tenantId,
        academicYearId: new Types.ObjectId(academicYearId),
        admissionNo,
        feeScheduleId:  new Types.ObjectId(feeScheduleId),
      });

      let account = existingAccount;
      if (!account) {
        account = await ManualStudentFeeAccount.create({
          tenantId,
          campusId:        new Types.ObjectId(campusId),
          academicYearId:  new Types.ObjectId(academicYearId),
          admissionNo,
          studentName:     studentName.trim(),
          studentDob:      studentDob ? new Date(studentDob) : undefined,
          gradeId:         new Types.ObjectId(gradeId),
          sectionId:       sectionId ? new Types.ObjectId(sectionId) : undefined,
          feeScheduleId:   new Types.ObjectId(feeScheduleId),
          feeStructureId:  new Types.ObjectId(feeStructureId),
          totalAmount,
          paidAmount:      0,
          balanceAmount:   totalAmount,
          status:          'UNPAID',
          createdBy:       profileId,
        });
      }

      const newPaid    = account.paidAmount + paidAmount;
      const newBalance = totalAmount - newPaid;
      const newStatus: 'UNPAID' | 'PARTIAL' | 'PAID' =
        newBalance <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

      // Create the collection record
      const collection = await ManualFeeCollection.create({
        tenantId,
        manualStudentFeeAccountId: account._id,
        academicYearId:  new Types.ObjectId(academicYearId),
        feeScheduleId:   new Types.ObjectId(feeScheduleId),
        feeStructureId:  new Types.ObjectId(feeStructureId),
        studentName:     studentName.trim(),
        studentDob:      studentDob ? new Date(studentDob) : undefined,
        admissionNo,
        campusId:        new Types.ObjectId(campusId),
        gradeId:         new Types.ObjectId(gradeId),
        sectionId:       sectionId ? new Types.ObjectId(sectionId) : undefined,
        totalFeeAmount:  totalAmount,
        paidAmount,
        balanceAmount:   newBalance < 0 ? 0 : newBalance,
        paymentMode:     paymentMode.toUpperCase(),
        referenceNo,
        paymentDate:     new Date(paymentDate),
        remarks,
        receiptNo,
        receiptStatus:   'GENERATED',
        createdBy:       collectedBy,
      });

      // Create particulars (snapshot fee heads)
      const particulars = components.map((c) => ({
        tenantId,
        manualFeeCollectionId: collection._id,
        feeHeadId:    new Types.ObjectId(c.feeHeadId as string),
        feeHeadName:  c.feeHeadName as string,
        priority:     c.priority as number,
        amount:       c.amount as number,
        paidAmount:   c.amount as number,
        balanceAmount: 0,
      }));
      await ManualFeeCollectionParticular.insertMany(particulars);

      // Update account balance
      await ManualStudentFeeAccount.findByIdAndUpdate(account._id, {
        paidAmount:   newPaid,
        balanceAmount: newBalance < 0 ? 0 : newBalance,
        status:        newStatus,
      });

      return toGql(collection);
    }

    // ── List manual fee collections ───────────────────────────────────────────
    case 'listManualFeeCollections': {
      authorize(ctx, 'finance.manage');
      const filter: Record<string, unknown> = { tenantId };
      if (args.academicYearId) filter.academicYearId = new Types.ObjectId(args.academicYearId as string);
      if (args.campusId)       filter.campusId       = new Types.ObjectId(args.campusId as string);
      if (args.receiptStatus)  filter.receiptStatus  = args.receiptStatus;
      if (args.admissionNo)    filter.admissionNo    = args.admissionNo;

      const docs = await ManualFeeCollection.find(filter).sort({ createdAt: -1 }).limit(200).lean();
      return (docs as unknown[]).map(d => toGql(d));
    }

    // ── Get single manual fee collection ─────────────────────────────────────
    case 'getManualFeeCollection': {
      authorize(ctx, 'finance.manage');
      const doc = await ManualFeeCollection.findOne({ tenantId, _id: new Types.ObjectId(args.id as string) }).lean();
      if (!doc) throw new AppError('NOT_FOUND', 'Manual fee collection not found');
      return toGql(doc);
    }

    // ── List particulars for a collection ─────────────────────────────────────
    case 'listManualFeeCollectionParticulars': {
      authorize(ctx, 'finance.manage');
      const docs = await ManualFeeCollectionParticular.find({
        tenantId,
        manualFeeCollectionId: new Types.ObjectId(args.collectionId as string),
      }).sort({ priority: 1 }).lean();
      return (docs as unknown[]).map(d => toGql(d));
    }

    // ── Cancel a manual receipt ───────────────────────────────────────────────
    case 'cancelManualFeeCollection': {
      authorize(ctx, 'finance.manage');
      const { id, reason } = args as { id: string; reason?: string };
      const col = await ManualFeeCollection.findOne({ tenantId, _id: new Types.ObjectId(id) });
      if (!col) throw new AppError('NOT_FOUND', 'Manual fee collection not found');
      if (col.receiptStatus === 'CANCELLED') throw new AppError('BAD_REQUEST', 'Receipt is already cancelled');

      // Reverse the payment from account
      const account = await ManualStudentFeeAccount.findById(col.manualStudentFeeAccountId);
      if (account) {
        const newPaid    = Math.max(0, account.paidAmount - col.paidAmount);
        const newBalance = account.totalAmount - newPaid;
        const newStatus: 'UNPAID' | 'PARTIAL' | 'PAID' =
          newBalance <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';
        await ManualStudentFeeAccount.findByIdAndUpdate(account._id, {
          paidAmount:   newPaid,
          balanceAmount: newBalance,
          status:        newStatus,
        });
      }

      col.receiptStatus = 'CANCELLED';
      if (reason) col.remarks = reason;
      await col.save();

      return toGql(col.toObject());
    }

    // ── Link manual receipts to imported student ──────────────────────────────
    case 'linkManualFeeToStudent': {
      authorize(ctx, 'finance.manage');
      const { admissionNo, studentId, academicYearId } = args as {
        admissionNo: string;
        studentId: string;
        academicYearId?: string;
      };

      const accountFilter: Record<string, unknown> = { tenantId, admissionNo };
      if (academicYearId) accountFilter.academicYearId = new Types.ObjectId(academicYearId);

      const accounts = await ManualStudentFeeAccount.find(accountFilter);
      if (!accounts.length) throw new AppError('NOT_FOUND', 'No manual fee accounts found for this admission number');

      const studentOid = new Types.ObjectId(studentId);
      const now        = new Date();

      for (const account of accounts) {
        await ManualStudentFeeAccount.findByIdAndUpdate(account._id, {
          linkedStudentId: studentOid,
          linkedAt:        now,
        });
        await ManualFeeCollection.updateMany(
          { tenantId, manualStudentFeeAccountId: account._id },
          { linkedStudentId: studentOid, linkedAt: now, receiptStatus: 'LINKED' },
        );
      }

      return { linked: accounts.length };
    }

    // ── List manual accounts ──────────────────────────────────────────────────
    case 'listManualStudentFeeAccounts': {
      authorize(ctx, 'finance.manage');
      const filter: Record<string, unknown> = { tenantId };
      if (args.academicYearId) filter.academicYearId = new Types.ObjectId(args.academicYearId as string);
      if (args.campusId)       filter.campusId       = new Types.ObjectId(args.campusId as string);
      if (args.status)         filter.status         = args.status;

      const docs = await ManualStudentFeeAccount.find(filter).sort({ createdAt: -1 }).limit(200).lean();
      return (docs as unknown[]).map(d => toGql(d));
    }

    // ── Get single account ────────────────────────────────────────────────────
    case 'getManualStudentFeeAccount': {
      authorize(ctx, 'finance.manage');
      const doc = await ManualStudentFeeAccount.findOne({ tenantId, _id: new Types.ObjectId(args.id as string) }).lean();
      if (!doc) throw new AppError('NOT_FOUND', 'Manual fee account not found');
      return toGql(doc);
    }

    default:
      return undefined;
  }
}
