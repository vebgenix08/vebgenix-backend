import { Types } from 'mongoose';
import { FeeHead, IFeeHead } from '../models/finance/FeeHead.model';
import { FeeStructure, IFeeStructure } from '../models/finance/FeeStructure.model';
import { FeeAssignment, IFeeAssignment } from '../models/finance/FeeAssignment.model';
import { FeeSchedule, IFeeSchedule } from '../models/finance/FeeSchedule.model';
import { InstallmentPlan, IInstallmentPlan } from '../models/finance/InstallmentPlan.model';
import { FeeRevision, IFeeRevision } from '../models/finance/FeeRevision.model';
import { Invoice, IInvoice, InvoiceStatus } from '../models/finance/Invoice.model';
import { Payment, IPayment } from '../models/finance/Payment.model';
import { FeeCategory, IFeeCategory } from '../models/finance/FeeCategory.model';
import { PaymentAllocation, IPaymentAllocation } from '../models/finance/PaymentAllocation.model';

function toObjectId(id: string): Types.ObjectId {
  return new Types.ObjectId(id);
}

// biome-ignore lint: large object — explicit type annotation suppresses TS7056
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FinanceRepo: any = {
  // ── Fee Heads ─────────────────────────────────────────────────────────────

  async listFeeHeads(tenantId: string, activeOnly = true) {
    return FeeHead.find({ tenantId, ...(activeOnly ? { isActive: true } : {}) }).sort({ name: 1 });
  },

  async findFeeHeadById(tenantId: string, id: string): Promise<IFeeHead | null> {
    return FeeHead.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async createFeeHead(tenantId: string, data: Partial<IFeeHead>) {
    return FeeHead.create({ ...data, tenantId });
  },

  async updateFeeHead(tenantId: string, id: string, update: Partial<IFeeHead>) {
    return FeeHead.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true },
    );
  },

  async deleteFeeHead(tenantId: string, id: string) {
    return FeeHead.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: { isActive: false } },
      { new: true },
    );
  },

  // ── Fee Structures ─────────────────────────────────────────────────────────

  async listFeeStructures(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeStructure.find({ tenantId, ...filters });
  },

  async findFeeStructureById(tenantId: string, id: string): Promise<IFeeStructure | null> {
    return FeeStructure.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async createFeeStructure(tenantId: string, data: Partial<IFeeStructure>) {
    return FeeStructure.create({ ...data, tenantId });
  },

  async updateFeeStructure(tenantId: string, id: string, update: Partial<IFeeStructure>) {
    return FeeStructure.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true },
    );
  },

  async deleteFeeStructure(tenantId: string, id: string) {
    return FeeStructure.findOneAndDelete({ tenantId, _id: new Types.ObjectId(id) });
  },

  // ── Fee Assignments ────────────────────────────────────────────────────────

  async listFeeAssignments(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeAssignment.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async findFeeAssignmentById(tenantId: string, id: string): Promise<IFeeAssignment | null> {
    return FeeAssignment.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async findFeeAssignmentByStudent(tenantId: string, studentId: string, academicYearId?: string) {
    const q: Record<string, unknown> = { tenantId, studentId };
    if (academicYearId) q.academicYearId = academicYearId;
    return FeeAssignment.findOne(q);
  },

  async createFeeAssignment(tenantId: string, data: Partial<IFeeAssignment>) {
    return FeeAssignment.findOneAndUpdate(
      { tenantId, studentId: data.studentId, academicYearId: data.academicYearId, feeStructureId: data.feeStructureId },
      { $setOnInsert: { ...data, tenantId } },
      { upsert: true, new: true },
    );
  },

  async updateFeeAssignment(tenantId: string, id: string, update: Partial<IFeeAssignment>) {
    return FeeAssignment.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true },
    );
  },

  // ── Fee Schedules ──────────────────────────────────────────────────────────

  async listFeeSchedules(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeSchedule.find({ tenantId, ...filters }).sort({ name: 1 });
  },

  async createFeeSchedule(tenantId: string, data: Partial<IFeeSchedule>) {
    return FeeSchedule.create({ ...data, tenantId });
  },

  async updateFeeSchedule(tenantId: string, id: string, update: Partial<IFeeSchedule>) {
    return FeeSchedule.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true },
    );
  },

  async deleteFeeSchedule(tenantId: string, id: string) {
    return FeeSchedule.findOneAndDelete({ tenantId, _id: new Types.ObjectId(id) });
  },

  // ── Installment Plans ──────────────────────────────────────────────────────

  async listInstallmentPlans(tenantId: string) {
    return InstallmentPlan.find({ tenantId }).sort({ name: 1 });
  },

  async createInstallmentPlan(tenantId: string, data: Partial<IInstallmentPlan>) {
    return InstallmentPlan.create({ ...data, tenantId });
  },

  async updateInstallmentPlan(tenantId: string, id: string, update: Partial<IInstallmentPlan>) {
    return InstallmentPlan.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true },
    );
  },

  async deleteInstallmentPlan(tenantId: string, id: string) {
    return InstallmentPlan.findOneAndDelete({ tenantId, _id: new Types.ObjectId(id) });
  },

  // ── Fee Revisions ──────────────────────────────────────────────────────────

  async createFeeRevision(tenantId: string, data: Partial<IFeeRevision>) {
    return FeeRevision.create({ ...data, tenantId });
  },

  async listFeeRevisions(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeRevision.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  // ── Invoices ───────────────────────────────────────────────────────────────

  async listInvoices(tenantId: string, filters: Record<string, unknown> = {}) {
    return Invoice.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async findInvoiceById(tenantId: string, id: string): Promise<IInvoice | null> {
    return Invoice.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async createInvoice(tenantId: string, data: Partial<IInvoice>) {
    return Invoice.create({ ...data, tenantId });
  },

  async updateInvoice(tenantId: string, id: string, update: Partial<IInvoice>) {
    return Invoice.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true },
    );
  },

  async updateInvoicePaid(tenantId: string, id: string, paidAmount: number) {
    const invoice = await Invoice.findOne({ tenantId, _id: new Types.ObjectId(id) });
    if (!invoice) return null;
    const newPaid = invoice.paidAmount + paidAmount;
    const newDue  = invoice.netAmount - newPaid;
    const status  = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : invoice.status;
    return Invoice.findOneAndUpdate(
      { _id: invoice._id },
      { $set: { paidAmount: newPaid, dueAmount: newDue < 0 ? 0 : newDue, status } },
      { new: true },
    );
  },

  // ── Payments ───────────────────────────────────────────────────────────────

  async createPayment(tenantId: string, data: Partial<IPayment>) {
    return Payment.create({ ...data, tenantId });
  },

  async listPayments(tenantId: string, filters: Record<string, unknown> = {}) {
    return Payment.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async findPaymentById(tenantId: string, id: string): Promise<IPayment | null> {
    return Payment.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async findPaymentByRazorpayOrderId(orderId: string): Promise<IPayment | null> {
    return Payment.findOne({ razorpayOrderId: orderId });
  },

  async updatePaymentStatus(id: string, update: Partial<IPayment>) {
    return Payment.findByIdAndUpdate(id, { $set: update }, { new: true });
  },

  async listPaymentsByInvoice(tenantId: string, invoiceId: string) {
    return Payment.find({ tenantId, invoiceId: new Types.ObjectId(invoiceId) });
  },

  // ── Reports ────────────────────────────────────────────────────────────────

  async dayBookReport(tenantId: string, from: Date, to: Date, campusId?: string) {
    const matchStage: Record<string, unknown> = {
      tenantId,
      status: 'SUCCESS',
      createdAt: { $gte: from, $lte: to },
    };
    if (campusId) matchStage.campusId = toObjectId(campusId);
    const payments = await Payment.aggregate([
      { $match: matchStage },
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

  async feeCollectionAnalytics(
    tenantId: string,
    options: { campusId?: string; academicYearId?: string; from?: string; to?: string } = {},
  ) {
    const invoiceMatch: Record<string, unknown> = { tenantId };
    const paymentMatch: Record<string, unknown> = { tenantId, status: 'SUCCESS' };
    const feeAssignmentMatch: Record<string, unknown> = { tenantId };

    if (options.campusId) {
      const campusId = toObjectId(options.campusId);
      invoiceMatch.campusId = campusId;
      paymentMatch.campusId = campusId;
    }
    if (options.academicYearId) {
      const academicYearId = toObjectId(options.academicYearId);
      invoiceMatch.academicYearId = academicYearId;
      paymentMatch.academicYearId = academicYearId;
      feeAssignmentMatch.academicYearId = academicYearId;
    }

    const from = options.from ? new Date(options.from) : undefined;
    const to = options.to ? new Date(options.to) : undefined;
    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.$gte = from;
      if (to) createdAt.$lte = to;
      paymentMatch.createdAt = createdAt;
    }

    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [invoiceTotals, paymentMethodRows, monthlyRows, todayRows, monthRows, receiptsToday, pendingFeeAssignments] = await Promise.all([
      Invoice.aggregate([
        { $match: invoiceMatch },
        {
          $group: {
            _id: null,
            totalBilled: { $sum: '$netAmount' },
            totalCollected: { $sum: '$paidAmount' },
            totalDue: { $sum: '$dueAmount' },
            openInvoices: {
              $sum: {
                $cond: [{ $gt: ['$dueAmount', 0] }, 1, 0],
              },
            },
          },
        },
      ]),
      Payment.aggregate([
        { $match: paymentMatch },
        {
          $group: {
            _id: '$method',
            amount: { $sum: '$amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { amount: -1 } },
      ]),
      Payment.aggregate([
        { $match: paymentMatch },
        {
          $group: {
            _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
            amount: { $sum: '$amount' },
          },
        },
        { $sort: { '_id.year': 1, '_id.month': 1 } },
      ]),
      Payment.aggregate([
        {
          $match: {
            ...paymentMatch,
            createdAt: { $gte: todayStart, $lte: now },
          },
        },
        {
          $group: {
            _id: null,
            amount: { $sum: '$amount' },
          },
        },
      ]),
      Payment.aggregate([
        {
          $match: {
            ...paymentMatch,
            createdAt: { $gte: monthStart, $lte: now },
          },
        },
        {
          $group: {
            _id: null,
            amount: { $sum: '$amount' },
          },
        },
      ]),
      Payment.countDocuments({
        ...paymentMatch,
        receiptNumber: { $exists: true, $ne: null },
        createdAt: { $gte: todayStart, $lte: now },
      }),
      FeeAssignment.countDocuments(feeAssignmentMatch),
    ]);

    const invoiceSummary = invoiceTotals[0] ?? {
      totalBilled: 0,
      totalCollected: 0,
      totalDue: 0,
      openInvoices: 0,
    };
    const totalCollected = Number(invoiceSummary.totalCollected ?? 0);
    const totalDue = Number(invoiceSummary.totalDue ?? 0);
    const totalExpected = Number(invoiceSummary.totalBilled ?? 0);

    return {
      totalCollected,
      totalDue,
      collectionRate: totalExpected > 0 ? Number(((totalCollected / totalExpected) * 100).toFixed(2)) : 0,
      collectedToday: Number(todayRows[0]?.amount ?? 0),
      collectedThisMonth: Number(monthRows[0]?.amount ?? 0),
      outstandingDue: totalDue,
      openInvoices: Number(invoiceSummary.openInvoices ?? 0),
      receiptsToday,
      pendingFeeAssignments,
      byMethod: paymentMethodRows.map((row: Record<string, unknown>) => ({
        method: String(row._id ?? 'OTHER'),
        amount: Number(row.amount ?? 0),
        count: Number(row.count ?? 0),
      })),
      monthly: monthlyRows.map((row: Record<string, unknown>) => {
        const bucket = (row._id ?? {}) as { year?: number; month?: number };
        return {
          month: `${bucket.year ?? 0}-${String(bucket.month ?? 0).padStart(2, '0')}`,
          amount: Number(row.amount ?? 0),
          count: Number(row.count ?? 0),
        };
      }),
    };
  },

  async classFeeStats(tenantId: string, classId?: string, academicYearId?: string) {
    const matchStage: Record<string, unknown> = { tenantId };
    if (classId)        matchStage.classId        = toObjectId(classId);
    if (academicYearId) matchStage.academicYearId = toObjectId(academicYearId);
    return Invoice.aggregate([
      { $match: matchStage },
      { $group: {
        _id:          '$classId',
        totalBilled:  { $sum: '$netAmount' },
        totalPaid:    { $sum: '$paidAmount' },
        totalDue:     { $sum: '$dueAmount' },
        studentCount: { $addToSet: '$studentId' },
      }},
      { $addFields: { studentCount: { $size: '$studentCount' } } },
      { $sort: { totalDue: -1 } },
    ]);
  },

  async studentFinancialSummary(tenantId: string, studentId: string) {
    const [invoices, payments] = await Promise.all([
      Invoice.find({ tenantId, studentId }).sort({ createdAt: -1 }).lean(),
      Payment.find({ tenantId, studentId, status: 'SUCCESS' }).sort({ createdAt: -1 }).lean(),
    ]);
    const totalBilled = invoices.reduce((s, i) => s + i.netAmount, 0);
    const totalPaid   = invoices.reduce((s, i) => s + i.paidAmount, 0);
    const totalDue    = invoices.reduce((s, i) => s + i.dueAmount, 0);
    return { invoices, payments, totalBilled, totalPaid, totalDue };
  },

  // ── Fee Categories ─────────────────────────────────────────────────────────

  async listFeeCategories(tenantId: string, activeOnly = true) {
    return FeeCategory.find({ tenantId, ...(activeOnly ? { isActive: true } : {}) }).sort({ name: 1 });
  },

  async findFeeCategoryById(tenantId: string, id: string): Promise<IFeeCategory | null> {
    return FeeCategory.findOne({ tenantId, _id: new Types.ObjectId(id) });
  },

  async createFeeCategory(tenantId: string, data: Partial<IFeeCategory>) {
    return FeeCategory.create({ ...data, tenantId });
  },

  async updateFeeCategory(tenantId: string, id: string, update: Partial<IFeeCategory>) {
    return FeeCategory.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: update },
      { new: true },
    );
  },

  async deleteFeeCategoryById(tenantId: string, id: string) {
    return FeeCategory.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(id) },
      { $set: { isActive: false } },
      { new: true },
    );
  },

  // ── Payment Allocations ────────────────────────────────────────────────────

  async createPaymentAllocations(tenantId: string, docs: Array<Partial<IPaymentAllocation>>) {
    return PaymentAllocation.insertMany(docs.map(d => ({ ...d, tenantId })));
  },

  async listAllocationsByPayment(tenantId: string, paymentId: string) {
    return PaymentAllocation.find({ tenantId, paymentId: new Types.ObjectId(paymentId) });
  },

  async listAllocationsByInvoice(tenantId: string, invoiceId: string) {
    return PaymentAllocation.find({ tenantId, invoiceId: new Types.ObjectId(invoiceId) });
  },

  // ── Invoice item-level update after successful payment ────────────────────
  // Loads the invoice in app code, computes updated item values, writes atomically.

  async updateInvoiceAfterPayment(
    tenantId: string,
    invoiceId: string,
    updatedItems: IInvoice['items'],
    paidDelta: number,
  ) {
    const inv = await Invoice.findOne({ tenantId, _id: new Types.ObjectId(invoiceId) });
    if (!inv) return null;
    const newPaid = inv.paidAmount + paidDelta;
    const newDue  = Math.max(0, inv.netAmount - newPaid);
    const status: InvoiceStatus = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : inv.status as InvoiceStatus;
    return Invoice.findOneAndUpdate(
      { _id: inv._id },
      { $set: { items: updatedItems, paidAmount: newPaid, dueAmount: newDue, status } },
      { new: true },
    );
  },

  // ── FeeHead (extended filter) ──────────────────────────────────────────────

  async listFeeHeadsFiltered(tenantId: string, filters: { feeCategoryId?: string; activeOnly?: boolean } = {}) {
    const q: Record<string, unknown> = { tenantId };
    if (filters.feeCategoryId) q.feeCategoryId = new Types.ObjectId(filters.feeCategoryId);
    if (filters.activeOnly !== false)  q.isActive = true;
    return FeeHead.find(q).sort({ priorityOrder: 1, name: 1 });
  },

  // ── Fee collection analytics (extended with fee-head breakdown) ────────────

  async feeHeadCollectionSummary(tenantId: string, academicYearId?: string) {
    const match: Record<string, unknown> = { tenantId };
    if (academicYearId) match.academicYearId = toObjectId(academicYearId);
    return PaymentAllocation.aggregate([
      {
        $lookup: {
          from: 'payments',
          localField: 'paymentId',
          foreignField: '_id',
          as: 'payment',
        },
      },
      { $unwind: '$payment' },
      { $match: { ...match, 'payment.status': 'SUCCESS' } },
      {
        $group: {
          _id:             '$feeHeadId',
          feeHeadName:     { $first: '$feeHeadName' },
          totalCollected:  { $sum: '$allocatedAmount' },
          paymentCount:    { $sum: 1 },
        },
      },
      { $sort: { totalCollected: -1 } },
    ]);
  },
};
