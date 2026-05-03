import { Types } from 'mongoose';
import { FeeHead, IFeeHead } from '../models/finance/FeeHead.model';
import { FeeStructure, IFeeStructure } from '../models/finance/FeeStructure.model';
import { FeeAssignment, IFeeAssignment } from '../models/finance/FeeAssignment.model';
import { FeeSchedule, IFeeSchedule } from '../models/finance/FeeSchedule.model';
import { InstallmentPlan, IInstallmentPlan } from '../models/finance/InstallmentPlan.model';
import { FeeRevision, IFeeRevision } from '../models/finance/FeeRevision.model';
import { Invoice, IInvoice } from '../models/finance/Invoice.model';
import { Payment, IPayment } from '../models/finance/Payment.model';

function tid(tenantId: string) {
  return new Types.ObjectId(tenantId);
}

export const FinanceRepo = {
  // ── Fee Heads ─────────────────────────────────────────────────────────────

  async listFeeHeads(tenantId: string, activeOnly = true) {
    return FeeHead.find({ tenantId: tid(tenantId), ...(activeOnly ? { isActive: true } : {}) })
      .sort({ name: 1 });
  },

  async findFeeHeadById(tenantId: string, id: string): Promise<IFeeHead | null> {
    return FeeHead.findOne({ tenantId: tid(tenantId), _id: new Types.ObjectId(id) });
  },

  async createFeeHead(tenantId: string, data: Partial<IFeeHead>) {
    return FeeHead.create({ ...data, tenantId: tid(tenantId) });
  },

  async updateFeeHead(tenantId: string, id: string, update: Partial<IFeeHead>) {
    return FeeHead.findOneAndUpdate(
      { tenantId: tid(tenantId), _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true }
    );
  },

  async deleteFeeHead(tenantId: string, id: string) {
    return FeeHead.findOneAndUpdate(
      { tenantId: tid(tenantId), _id: new Types.ObjectId(id) },
      { $set: { isActive: false } },
      { new: true }
    );
  },

  // ── Fee Structures ─────────────────────────────────────────────────────────

  async listFeeStructures(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeStructure.find({ tenantId: tid(tenantId), ...filters });
  },

  async findFeeStructureById(tenantId: string, id: string): Promise<IFeeStructure | null> {
    return FeeStructure.findOne({ tenantId: tid(tenantId), _id: new Types.ObjectId(id) });
  },

  async createFeeStructure(tenantId: string, data: Partial<IFeeStructure>) {
    return FeeStructure.create({ ...data, tenantId: tid(tenantId) });
  },

  async updateFeeStructure(tenantId: string, id: string, update: Partial<IFeeStructure>) {
    return FeeStructure.findOneAndUpdate(
      { tenantId: tid(tenantId), _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true }
    );
  },

  async deleteFeeStructure(tenantId: string, id: string) {
    return FeeStructure.findOneAndDelete({ tenantId: tid(tenantId), _id: new Types.ObjectId(id) });
  },

  // ── Fee Assignments ────────────────────────────────────────────────────────

  async listFeeAssignments(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeAssignment.find({ tenantId: tid(tenantId), ...filters }).sort({ createdAt: -1 });
  },

  async findFeeAssignmentById(tenantId: string, id: string): Promise<IFeeAssignment | null> {
    return FeeAssignment.findOne({ tenantId: tid(tenantId), _id: new Types.ObjectId(id) });
  },

  async findFeeAssignmentByStudent(tenantId: string, studentId: string, academicYearId?: string) {
    const q: Record<string, unknown> = { tenantId: tid(tenantId), studentId };
    if (academicYearId) q.academicYearId = academicYearId;
    return FeeAssignment.findOne(q);
  },

  async createFeeAssignment(tenantId: string, data: Partial<IFeeAssignment>) {
    return FeeAssignment.findOneAndUpdate(
      { tenantId: tid(tenantId), studentId: data.studentId, academicYearId: data.academicYearId },
      { $setOnInsert: { ...data, tenantId: tid(tenantId) } },
      { upsert: true, new: true }
    );
  },

  async updateFeeAssignment(tenantId: string, id: string, update: Partial<IFeeAssignment>) {
    return FeeAssignment.findOneAndUpdate(
      { tenantId: tid(tenantId), _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true }
    );
  },

  // ── Fee Schedules ──────────────────────────────────────────────────────────

  async listFeeSchedules(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeSchedule.find({ tenantId: tid(tenantId), ...filters }).sort({ name: 1 });
  },

  async createFeeSchedule(tenantId: string, data: Partial<IFeeSchedule>) {
    return FeeSchedule.create({ ...data, tenantId: tid(tenantId) });
  },

  async updateFeeSchedule(tenantId: string, id: string, update: Partial<IFeeSchedule>) {
    return FeeSchedule.findOneAndUpdate(
      { tenantId: tid(tenantId), _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true }
    );
  },

  async deleteFeeSchedule(tenantId: string, id: string) {
    return FeeSchedule.findOneAndDelete({ tenantId: tid(tenantId), _id: new Types.ObjectId(id) });
  },

  // ── Installment Plans ──────────────────────────────────────────────────────

  async listInstallmentPlans(tenantId: string) {
    return InstallmentPlan.find({ tenantId: tid(tenantId) }).sort({ name: 1 });
  },

  async createInstallmentPlan(tenantId: string, data: Partial<IInstallmentPlan>) {
    return InstallmentPlan.create({ ...data, tenantId: tid(tenantId) });
  },

  async updateInstallmentPlan(tenantId: string, id: string, update: Partial<IInstallmentPlan>) {
    return InstallmentPlan.findOneAndUpdate(
      { tenantId: tid(tenantId), _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true }
    );
  },

  async deleteInstallmentPlan(tenantId: string, id: string) {
    return InstallmentPlan.findOneAndDelete({ tenantId: tid(tenantId), _id: new Types.ObjectId(id) });
  },

  // ── Fee Revisions ──────────────────────────────────────────────────────────

  async createFeeRevision(tenantId: string, data: Partial<IFeeRevision>) {
    return FeeRevision.create({ ...data, tenantId: tid(tenantId) });
  },

  async listFeeRevisions(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeRevision.find({ tenantId: tid(tenantId), ...filters }).sort({ createdAt: -1 });
  },

  // ── Invoices ───────────────────────────────────────────────────────────────

  async listInvoices(tenantId: string, filters: Record<string, unknown> = {}) {
    return Invoice.find({ tenantId: tid(tenantId), ...filters }).sort({ createdAt: -1 });
  },

  async findInvoiceById(tenantId: string, id: string): Promise<IInvoice | null> {
    return Invoice.findOne({ tenantId: tid(tenantId), _id: new Types.ObjectId(id) });
  },

  async createInvoice(tenantId: string, data: Partial<IInvoice>) {
    return Invoice.create({ ...data, tenantId: tid(tenantId) });
  },

  async updateInvoice(tenantId: string, id: string, update: Partial<IInvoice>) {
    return Invoice.findOneAndUpdate(
      { tenantId: tid(tenantId), _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true }
    );
  },

  async updateInvoicePaid(tenantId: string, id: string, paidAmount: number) {
    const invoice = await Invoice.findOne({ tenantId: tid(tenantId), _id: new Types.ObjectId(id) });
    if (!invoice) return null;
    const newPaid = invoice.paidAmount + paidAmount;
    const newDue  = invoice.netAmount - newPaid;
    const status  = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : invoice.status;
    return Invoice.findOneAndUpdate(
      { _id: invoice._id },
      { $set: { paidAmount: newPaid, dueAmount: newDue < 0 ? 0 : newDue, status } },
      { new: true }
    );
  },

  // ── Payments ───────────────────────────────────────────────────────────────

  async createPayment(tenantId: string, data: Partial<IPayment>) {
    return Payment.create({ ...data, tenantId: tid(tenantId) });
  },

  async listPayments(tenantId: string, filters: Record<string, unknown> = {}) {
    return Payment.find({ tenantId: tid(tenantId), ...filters }).sort({ createdAt: -1 });
  },

  async findPaymentById(tenantId: string, id: string): Promise<IPayment | null> {
    return Payment.findOne({ tenantId: tid(tenantId), _id: new Types.ObjectId(id) });
  },

  async findPaymentByRazorpayOrderId(orderId: string): Promise<IPayment | null> {
    return Payment.findOne({ razorpayOrderId: orderId });
  },

  async updatePaymentStatus(id: string, update: Partial<IPayment>) {
    return Payment.findByIdAndUpdate(id, { $set: update }, { new: true });
  },

  async listPaymentsByInvoice(tenantId: string, invoiceId: string) {
    return Payment.find({ tenantId: tid(tenantId), invoiceId: new Types.ObjectId(invoiceId) });
  },

  // ── Reports ────────────────────────────────────────────────────────────────

  async dayBookReport(tenantId: string, from: Date, to: Date) {
    const payments = await Payment.aggregate([
      { $match: { tenantId: tid(tenantId), status: 'SUCCESS', createdAt: { $gte: from, $lte: to } } },
      { $group: {
        _id:         '$method',
        totalAmount: { $sum: '$amount' },
        count:       { $sum: 1 },
        payments:    { $push: { _id: '$_id', amount: '$amount', invoiceId: '$invoiceId', createdAt: '$createdAt', receiptNumber: '$receiptNumber' } },
      }},
      { $sort: { _id: 1 } },
    ]);
    const grandTotal = payments.reduce((acc: number, g: Record<string, unknown>) => acc + (g.totalAmount as number), 0);
    return { from, to, byMethod: payments, grandTotal };
  },

  async feeCollectionAnalytics(tenantId: string, academicYearId?: string) {
    const matchStage: Record<string, unknown> = { tenantId: tid(tenantId) };
    if (academicYearId) matchStage.academicYearId = academicYearId;
    const [invoiceSummary, collectionByMonth] = await Promise.all([
      Invoice.aggregate([
        { $match: matchStage },
        { $group: {
          _id:         '$status',
          totalAmount: { $sum: '$netAmount' },
          paidAmount:  { $sum: '$paidAmount' },
          dueAmount:   { $sum: '$dueAmount' },
          count:       { $sum: 1 },
        }},
      ]),
      Payment.aggregate([
        { $match: { tenantId: tid(tenantId), status: 'SUCCESS', ...(academicYearId ? { academicYearId } : {}) } },
        { $group: {
          _id:    { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
          total:  { $sum: '$amount' },
          count:  { $sum: 1 },
        }},
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
    ]);
    return { invoiceSummary, collectionByMonth };
  },

  async classFeeStats(tenantId: string, classId?: string, academicYearId?: string) {
    const matchStage: Record<string, unknown> = { tenantId: tid(tenantId) };
    if (classId)        matchStage.classId        = classId;
    if (academicYearId) matchStage.academicYearId = academicYearId;
    return Invoice.aggregate([
      { $match: matchStage },
      { $group: {
        _id:         '$classId',
        totalBilled: { $sum: '$netAmount' },
        totalPaid:   { $sum: '$paidAmount' },
        totalDue:    { $sum: '$dueAmount' },
        studentCount: { $addToSet: '$studentId' },
      }},
      { $addFields: { studentCount: { $size: '$studentCount' } } },
      { $sort: { totalDue: -1 } },
    ]);
  },

  async studentFinancialSummary(tenantId: string, studentId: string) {
    const [invoices, payments] = await Promise.all([
      Invoice.find({ tenantId: tid(tenantId), studentId }).sort({ createdAt: -1 }).lean(),
      Payment.find({ tenantId: tid(tenantId), studentId, status: 'SUCCESS' }).sort({ createdAt: -1 }).lean(),
    ]);
    const totalBilled  = invoices.reduce((s, i) => s + i.netAmount, 0);
    const totalPaid    = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const totalDue     = invoices.reduce((s, i) => s + i.dueAmount, 0);
    return { invoices, payments, totalBilled, totalPaid, totalDue };
  },
};
