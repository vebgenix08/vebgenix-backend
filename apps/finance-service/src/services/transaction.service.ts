import { Types } from 'mongoose';
import { FinanceRepo } from '@vebgenix/db';

export class TransactionService {
  static async create(tenantId: string, data: Record<string, unknown>) {
    return FinanceRepo.createTransaction(tenantId, data);
  }

  static async bulkCreate(tenantId: string, docs: Record<string, unknown>[]) {
    return FinanceRepo.bulkCreateTransactions(tenantId, docs);
  }

  static async list(tenantId: string, filters: Record<string, unknown> = {}) {
    const { Types } = require('mongoose');
    const toValidOid = (id: unknown) => {
      if (!id) return undefined;
      const s = String(id);
      return Types.ObjectId.isValid(s) ? new Types.ObjectId(s) : undefined;
    };
    const cleanFilters: Record<string, unknown> = {};
    const studentOid = toValidOid(filters.studentId);
    if (studentOid) cleanFilters.studentId = studentOid;
    const yearOid = toValidOid(filters.academicYearId);
    if (yearOid) cleanFilters.academicYearId = yearOid;
    return FinanceRepo.listTransactions({ tenantId, ...cleanFilters });
  }

  static async getById(tenantId: string, id: string) {
    return FinanceRepo.getTransactionById(tenantId, id);
  }

  static async dayBook(tenantId: string, from: Date, to: Date, campusId?: string, academicYearId?: string) {
    return FinanceRepo.dayBookReport(tenantId, from, to, campusId, academicYearId);
  }

  static async collectionAnalytics(
    tenantId: string,
    options: { campusId?: string; academicYearId?: string; from?: string; to?: string } = {},
  ) {
    return FinanceRepo.feeCollectionAnalytics(tenantId, options);
  }

  static async classFeeStats(tenantId: string, classId?: string, academicYearId?: string) {
    return FinanceRepo.classFeeStats(tenantId, classId, academicYearId);
  }

  static async studentFinancialSummary(tenantId: string, studentId: string) {
    return FinanceRepo.studentFinancialSummary(tenantId, studentId);
  }

  static async outstandingReport(
    tenantId: string,
    filters: { studentId?: string; classId?: string; academicYearId?: string } = {},
  ) {
    const query: Record<string, unknown> = { tenant_id: tenantId, status: { $in: ['PENDING', 'PARTIAL', 'OVERDUE'] } };
    if (filters.studentId) query.student_id = new Types.ObjectId(filters.studentId);
    if (filters.classId) query.class_id = new Types.ObjectId(filters.classId);
    if (filters.academicYearId) query.academic_year_id = new Types.ObjectId(filters.academicYearId);
    return FinanceRepo.listStudentOrders(query);
  }
}
