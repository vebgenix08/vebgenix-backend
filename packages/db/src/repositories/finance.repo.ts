import { Types } from 'mongoose';

import { FeeHead, IFeeHead } from '../models/finance/FeeHead.model';
import { FeeSchedule, IFeeSchedule } from '../models/finance/FeeSchedule.model';
import { FeeStructure, IFeeStructure } from '../models/finance/FeeStructure.model';
import { FeeStructureClassMapping, IFeeStructureClassMapping } from '../models/finance/FeeStructureClassMapping.model';
import { FeeAssignment, IFeeAssignment } from '../models/finance/FeeAssignment.model';
import { FeeRevision, IFeeRevision } from '../models/finance/FeeRevision.model';
import { Invoice, IInvoice, InvoiceStatus } from '../models/finance/Invoice.model';
import { Payment, IPayment } from '../models/finance/Payment.model';
import { PaymentAllocation, IPaymentAllocation } from '../models/finance/PaymentAllocation.model';
import StudentFeeOrder from '../models/finance/StudentFeeOrders.model';
import { IStudentTransaction } from '../models/finance/StudentTransaction.model';
import StudentTransaction from '../models/finance/StudentTransaction.model';
import { FinanceSequence } from '../models/finance/FinanceSequence.model';
import { AcademicYear } from '../models/settings/AcademicYear.model';

const toObjectId = (id: string) => new Types.ObjectId(id);
const safeObjectId = (id: string | undefined): Types.ObjectId | string | undefined => {
  if (!id) return undefined;
  try { return new Types.ObjectId(id); } catch { return id; }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const FinanceRepo: any = {
  // =====================================================
  // FEE HEAD FUNCTIONS
  // =====================================================
  async listFeeHeads(tenantId: string, activeOnly = true) {
    return FeeHead.find({ tenantId, ...(activeOnly ? { isActive: true } : {}) }).sort({ name: 1 });
  },

  async listFeeHeadsFiltered(tenantId: string, filters: { activeOnly?: boolean } = {}) {
    const q: Record<string, unknown> = { tenantId };
    if (filters.activeOnly !== false) q.isActive = true;
    return FeeHead.find(q).sort({ priorityOrder: 1, name: 1 });
  },

  async findFeeHeadById(tenantId: string, id: string): Promise<IFeeHead | null> {
    return FeeHead.findOne({ tenantId, _id: toObjectId(id) });
  },

  async createFeeHead(tenantId: string, data: Partial<IFeeHead>) {
    return FeeHead.create({ ...data, tenantId });
  },

  async updateFeeHead(tenantId: string, id: string, update: Partial<IFeeHead>) {
    return FeeHead.findOneAndUpdate({ tenantId, _id: toObjectId(id) }, { $set: update }, { new: true });
  },

  async deleteFeeHead(tenantId: string, id: string) {
    return FeeHead.findOneAndUpdate(
      { tenantId, _id: toObjectId(id) },
      { $set: { isActive: false } },
      { new: true },
    );
  },

  // =====================================================
  // FEE SCHEDULE FUNCTIONS
  // =====================================================
  async listFeeSchedules(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeSchedule.find({ tenantId, ...filters }).sort({ name: 1 });
  },

  async findFeeScheduleById(tenantId: string, id: string): Promise<IFeeSchedule | null> {
    return FeeSchedule.findOne({ tenantId, _id: toObjectId(id) });
  },

  async createFeeSchedule(tenantId: string, data: Partial<IFeeSchedule>) {
    return FeeSchedule.create({ ...data, tenantId });
  },

  async updateFeeSchedule(tenantId: string, id: string, update: Partial<IFeeSchedule>) {
    return FeeSchedule.findOneAndUpdate({ tenantId, _id: toObjectId(id) }, { $set: update }, { new: true });
  },

  async deleteFeeSchedule(tenantId: string, id: string) {
    return FeeSchedule.findOneAndDelete({ tenantId, _id: toObjectId(id) });
  },

  // =====================================================
  // FEE STRUCTURE FUNCTIONS
  // =====================================================
  async listFeeStructures(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeStructure.find({ tenantId, ...filters });
  },

  async findFeeStructureById(tenantId: string, id: string): Promise<IFeeStructure | null> {
    return FeeStructure.findOne({ tenantId, _id: toObjectId(id) });
  },

  async createFeeStructure(tenantId: string, data: Partial<IFeeStructure>) {
    return FeeStructure.create({ ...data, tenantId });
  },

  async updateFeeStructure(tenantId: string, id: string, update: Partial<IFeeStructure>) {
    return FeeStructure.findOneAndUpdate({ tenantId, _id: toObjectId(id) }, { $set: update }, { new: true });
  },

  async deleteFeeStructure(tenantId: string, id: string) {
    return FeeStructure.findOneAndDelete({ tenantId, _id: toObjectId(id) });
  },

  // =====================================================
  // FEE STRUCTURE CLASS MAPPING FUNCTIONS
  // =====================================================
  async createFeeStructureClassMapping(
    tenantId: string,
    data: Partial<IFeeStructureClassMapping>,
  ) {
    return FeeStructureClassMapping.create({ ...data, tenantId });
  },

  async bulkCreateFeeStructureClassMappings(
    tenantId: string,
    docs: Array<Partial<IFeeStructureClassMapping>>,
  ) {
    // Use upsert per doc to avoid E11000 on re-mapping the same class
    const results = await Promise.all(
      docs.map(doc =>
        FeeStructureClassMapping.findOneAndUpdate(
          {
            tenantId,
            campusId:       doc.campusId,
            academicYearId: doc.academicYearId,
            classId:        doc.classId,
            feeScheduleId:  doc.feeScheduleId,
            feeStructureId: doc.feeStructureId,
          },
          { $set: { ...doc, tenantId, status: doc.status ?? 'ACTIVE' } },
          { upsert: true, new: true },
        ),
      ),
    );
    return results;
  },

  async listFeeStructureClassMappings(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeStructureClassMapping.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async findFeeStructureClassMappingById(tenantId: string, id: string) {
    return FeeStructureClassMapping.findOne({ tenantId, _id: toObjectId(id) });
  },

  async findApplicableFeeStructure(tenantId: string, classId: string, academicYearId: string) {
    return FeeStructureClassMapping.findOne({
      tenantId,
      classId: toObjectId(classId),
      academicYearId: toObjectId(academicYearId),
      status: 'ACTIVE',
    }).sort({ priority: 1, createdAt: -1 });
  },

  async updateFeeStructureClassMapping(tenantId: string, id: string, payload: Partial<IFeeStructureClassMapping>) {
    return FeeStructureClassMapping.findOneAndUpdate(
      { tenantId, _id: toObjectId(id) },
      { $set: payload },
      { new: true },
    );
  },

  async deleteFeeStructureClassMapping(tenantId: string, id: string) {
    return FeeStructureClassMapping.findOneAndDelete({ tenantId, _id: toObjectId(id) });
  },

  // =====================================================
  // STUDENT FEE ASSIGNMENT FUNCTIONS
  // =====================================================
  async listFeeAssignments(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeAssignment.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async findFeeAssignmentById(tenantId: string, id: string): Promise<IFeeAssignment | null> {
    return FeeAssignment.findOne({ tenantId, _id: toObjectId(id) });
  },

  async findFeeAssignmentByStudent(tenantId: string, studentId: string, academicYearId?: string) {
    const q: Record<string, unknown> = { tenantId, studentId };
    if (academicYearId) q.academicYearId = academicYearId;
    return FeeAssignment.findOne(q);
  },

  async createFeeAssignment(tenantId: string, data: Partial<IFeeAssignment>) {
    return FeeAssignment.findOneAndUpdate(
      {
        tenantId,
        studentId: data.studentId,
        academicYearId: data.academicYearId,
        feeStructureId: data.feeStructureId,
      },
      { $setOnInsert: { ...data, tenantId } },
      { upsert: true, new: true },
    );
  },

  async updateFeeAssignment(tenantId: string, id: string, update: Partial<IFeeAssignment>) {
    return FeeAssignment.findOneAndUpdate({ tenantId, _id: toObjectId(id) }, { $set: update }, { new: true });
  },

  // =====================================================
  // FEE REVISION FUNCTIONS
  // =====================================================
  async createFeeRevision(tenantId: string, data: Partial<IFeeRevision>) {
    return FeeRevision.create({ ...data, tenantId });
  },

  async listFeeRevisions(tenantId: string, filters: Record<string, unknown> = {}) {
    return FeeRevision.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  // =====================================================
  // INVOICE FUNCTIONS
  // =====================================================
  async listInvoices(tenantId: string, filters: Record<string, unknown> = {}) {
    return Invoice.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async findInvoiceById(tenantId: string, id: string): Promise<IInvoice | null> {
    return Invoice.findOne({ tenantId, _id: toObjectId(id) });
  },

  async createInvoice(tenantId: string, data: Partial<IInvoice>) {
    return Invoice.create({ ...data, tenantId });
  },

  async updateInvoice(tenantId: string, id: string, update: Partial<IInvoice>) {
    return Invoice.findOneAndUpdate({ tenantId, _id: toObjectId(id) }, { $set: update }, { new: true });
  },

  async updateInvoicePaid(tenantId: string, id: string, paidAmount: number) {
    const invoice = await Invoice.findOne({ tenantId, _id: toObjectId(id) });
    if (!invoice) return null;
    const newPaid = invoice.paidAmount + paidAmount;
    const newDue = invoice.netAmount - newPaid;
    const status = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : invoice.status;
    return Invoice.findOneAndUpdate(
      { _id: invoice._id },
      { $set: { paidAmount: newPaid, dueAmount: newDue < 0 ? 0 : newDue, status } },
      { new: true },
    );
  },

  async updateInvoiceAfterPayment(
    tenantId: string,
    invoiceId: string,
    updatedItems: IInvoice['items'],
    paidDelta: number,
  ) {
    const inv = await Invoice.findOne({ tenantId, _id: toObjectId(invoiceId) });
    if (!inv) return null;
    const newPaid = inv.paidAmount + paidDelta;
    const newDue = Math.max(0, inv.netAmount - newPaid);
    const status: InvoiceStatus = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : inv.status as InvoiceStatus;
    return Invoice.findOneAndUpdate(
      { _id: inv._id },
      { $set: { items: updatedItems, paidAmount: newPaid, dueAmount: newDue, status } },
      { new: true },
    );
  },

  // =====================================================
  // PAYMENT FUNCTIONS
  // =====================================================
  async createPayment(tenantId: string, data: Partial<IPayment>) {
    return Payment.create({ ...data, tenantId });
  },

  async listPayments(tenantId: string, filters: Record<string, unknown> = {}) {
    return Payment.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async findPaymentById(tenantId: string, id: string): Promise<IPayment | null> {
    return Payment.findOne({ tenantId, _id: toObjectId(id) });
  },

  async findPaymentByRazorpayOrderId(orderId: string): Promise<IPayment | null> {
    return Payment.findOne({ razorpayOrderId: orderId });
  },

  async updatePaymentStatus(id: string, update: Partial<IPayment>) {
    return Payment.findByIdAndUpdate(id, { $set: update }, { new: true });
  },

  async listPaymentsByInvoice(tenantId: string, invoiceId: string) {
    return Payment.find({ tenantId, invoiceId: toObjectId(invoiceId) });
  },

  async listPaymentsByStudent(tenantId: string, studentId: string) {
    return Payment.find({ tenantId, studentId }).sort({ createdAt: -1 });
  },

  // =====================================================
  // TRANSACTION FUNCTIONS
  // =====================================================
  async createTransaction(tenantId: string, data: Partial<IStudentTransaction>) {
    return StudentTransaction.create({ ...data, tenantId });
  },

  async bulkCreateTransactions(tenantId: string, docs: Array<Partial<IStudentTransaction>>) {
    return StudentTransaction.insertMany(docs.map(doc => ({ ...doc, tenantId })));
  },

  async getStudentTransactions(tenantId: string, studentId: string) {
    return StudentTransaction.find({ tenantId, studentId: safeObjectId(studentId) }).sort({ createdAt: -1 });
  },

  async getTransactionById(tenantId: string, id: string) {
    return StudentTransaction.findOne({ tenantId, _id: toObjectId(id) });
  },

  async listTransactions(filters: Record<string, unknown> = {}) {
    return StudentTransaction.find(filters).sort({ createdAt: -1 });
  },

  // =====================================================
  // PAYMENT ALLOCATION FUNCTIONS
  // =====================================================
  async createPaymentAllocations(tenantId: string, docs: Array<Partial<IPaymentAllocation>>) {
    return PaymentAllocation.insertMany(docs.map(doc => ({ ...doc, tenantId })));
  },

  async listAllocationsByPayment(tenantId: string, paymentId: string) {
    return PaymentAllocation.find({ tenantId, paymentId: toObjectId(paymentId) });
  },

  async listAllocationsByInvoice(tenantId: string, invoiceId: string) {
    return PaymentAllocation.find({ tenantId, invoiceId: toObjectId(invoiceId) });
  },

  // =====================================================
  // REPORTS
  // =====================================================
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
          _id: '$feeHeadId',
          feeHeadName: { $first: '$feeHeadName' },
          totalCollected: { $sum: '$allocatedAmount' },
          paymentCount: { $sum: 1 },
        },
      },
      { $sort: { totalCollected: -1 } },
    ]);
  },

  async dayBookReport(tenantId: string, from: Date, to: Date, campusId?: string, academicYearId?: string) {
    const matchStage: Record<string, unknown> = {
      tenantId,
      status: 'SUCCESS',
      createdAt: { $gte: from, $lte: to },
    };
    if (campusId) matchStage.campusId = toObjectId(campusId);
    if (academicYearId) matchStage.academicYearId = toObjectId(academicYearId);

    const payments = await Payment.find(matchStage).sort({ createdAt: 1 }).lean();
    const entries = payments.map((payment: Record<string, any>) => ({
      paymentId: String(payment._id),
      receiptNumber: payment.receiptNumber ?? null,
      studentId: String(payment.studentId),
      studentName: null,
      amount: Number(payment.amount ?? 0),
      method: payment.method,
      collectedBy: payment.collectedBy ? String(payment.collectedBy) : null,
      paidAt: (payment.paidAt ?? payment.createdAt)?.toISOString?.() ?? null,
    }));

    return {
      date: from.toISOString().slice(0, 10),
      totalAmount: entries.reduce((sum: number, entry: { amount: number }) => sum + entry.amount, 0),
      entries,
    };
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

    const [invoiceTotals, paymentMethodRows, monthlyRows, todayRows, monthRows, receiptsToday, pendingFeeAssignments] =
      await Promise.all([
        Invoice.aggregate([
          { $match: invoiceMatch },
          {
            $group: {
              _id: null,
              totalBilled: { $sum: '$netAmount' },
              totalCollected: { $sum: '$paidAmount' },
              totalDue: { $sum: '$dueAmount' },
              openInvoices: { $sum: { $cond: [{ $gt: ['$dueAmount', 0] }, 1, 0] } },
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
          { $match: { ...paymentMatch, createdAt: { $gte: todayStart, $lte: now } } },
          { $group: { _id: null, amount: { $sum: '$amount' } } },
        ]),
        Payment.aggregate([
          { $match: { ...paymentMatch, createdAt: { $gte: monthStart, $lte: now } } },
          { $group: { _id: null, amount: { $sum: '$amount' } } },
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
    if (classId && Types.ObjectId.isValid(classId)) matchStage.classId = new Types.ObjectId(classId);
    if (academicYearId && Types.ObjectId.isValid(academicYearId)) matchStage.academicYearId = new Types.ObjectId(academicYearId);
    const rows = await Invoice.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$classId',
          totalAmount: { $sum: '$netAmount' },
          collectedAmount: { $sum: '$paidAmount' },
          pendingAmount: { $sum: '$dueAmount' },
          allStudents: { $addToSet: '$studentId' },
          paidStudents: {
            $addToSet: { $cond: [{ $lte: ['$dueAmount', 0] }, '$studentId', null] },
          },
        },
      },
      {
        $addFields: {
          totalStudents: { $size: '$allStudents' },
          paidStudents: { $size: { $filter: { input: '$paidStudents', as: 'x', cond: { $ne: ['$$x', null] } } } },
        },
      },
      { $sort: { pendingAmount: -1 } },
    ]);
    return rows.map((row: Record<string, unknown>) => ({
      classId: row._id ? String(row._id) : null,
      className: null,
      totalStudents: Number(row.totalStudents ?? 0),
      paidStudents: Number(row.paidStudents ?? 0),
      pendingStudents: Number(row.totalStudents ?? 0) - Number(row.paidStudents ?? 0),
      totalAmount: Number(row.totalAmount ?? 0),
      collectedAmount: Number(row.collectedAmount ?? 0),
      pendingAmount: Number(row.pendingAmount ?? 0),
    }));
  },

  async studentFinancialSummary(tenantId: string, studentId: string) {
    if (!studentId || !Types.ObjectId.isValid(studentId)) {
      return { studentId, totalCharged: 0, totalPaid: 0, totalDue: 0, totalConcession: 0, invoiceCount: 0, paymentCount: 0 };
    }
    const sid = new Types.ObjectId(studentId);
    const [invoices, payments] = await Promise.all([
      Invoice.find({ tenantId, studentId: sid }).sort({ createdAt: -1 }).lean(),
      Payment.find({ tenantId, studentId: sid, status: 'SUCCESS' }).sort({ createdAt: -1 }).lean(),
    ]);
    const totalCharged = invoices.reduce((sum, invoice) => sum + (invoice.netAmount ?? 0), 0);
    const totalPaid = invoices.reduce((sum, invoice) => sum + (invoice.paidAmount ?? 0), 0);
    const totalDue = invoices.reduce((sum, invoice) => sum + (invoice.dueAmount ?? 0), 0);
    const totalConcession = invoices.reduce((sum, invoice) => sum + (invoice.concessionAmount ?? 0), 0);
    return {
      studentId,
      totalCharged,
      totalPaid,
      totalDue,
      totalConcession,
      invoiceCount: invoices.length,
      paymentCount: payments.length,
    };
  },

  // =====================================================
  // STUDENT ORDER FUNCTIONS
  // =====================================================
  async createStudentOrder(data: any) {
    return StudentFeeOrder.create(data);
  },

  async bulkCreateStudentOrders(docs: any[]) {
    return StudentFeeOrder.insertMany(docs);
  },

  async getStudentOrders(tenantId: string, studentId: string) {
    return StudentFeeOrder.find({ tenant_id: tenantId, student_id: studentId }).sort({ due_date: 1 });
  },

  async listStudentOrders(filters: Record<string, unknown> = {}) {
    return StudentFeeOrder.find(filters).sort({ due_date: 1 });
  },

  async getStudentOrderById(tenantId: string, id: string) {
    return StudentFeeOrder.findOne({ tenant_id: tenantId, _id: toObjectId(id) });
  },

  async updateStudentOrder(tenantId: string, id: string, payload: any) {
    return StudentFeeOrder.findOneAndUpdate(
      { tenant_id: tenantId, _id: toObjectId(id) },
      { $set: payload },
      { new: true },
    );
  },

  async updateOrderPayment(tenantId: string, orderId: string, paidAmount: number) {
    const order = await StudentFeeOrder.findOne({ tenant_id: tenantId, _id: toObjectId(orderId) });
    if (!order) return null;
    order.paid_amount = Math.round((order.paid_amount + paidAmount) * 100) / 100;
    order.balance_amount = Math.max(0, Math.round((order.payable_amount - order.paid_amount) * 100) / 100);
    order.payment_completion_percentage = order.payable_amount > 0
      ? Math.min(100, Math.round((order.paid_amount / order.payable_amount) * 10000) / 100)
      : 100;
    order.payment_status = order.balance_amount <= 0 ? 'PAID' : order.paid_amount > 0 ? 'PARTIAL' : 'UNPAID';
    order.status = order.balance_amount <= 0 ? 'PAID' : 'PARTIAL';
    await order.save();
    return order;
  },

  async cancelStudentOrder(tenantId: string, id: string) {
    return StudentFeeOrder.findOneAndUpdate(
      { tenant_id: tenantId, _id: toObjectId(id) },
      { $set: { status: 'CANCELLED' } },
      { new: true },
    );
  },

  // =====================================================
  // SEQUENCE / NUMBERING
  // =====================================================
  async nextSequenceValue(tenantId: string, key: string): Promise<number> {
    const seq = await FinanceSequence.findOneAndUpdate(
      { tenantId, scope: 'finance', key },
      { $inc: { value: 1 }, $setOnInsert: { tenantId, scope: 'finance', key } },
      { upsert: true, new: true },
    );
    return seq.value;
  },

  async nextFeeOrderNo(tenantId: string, academicYearId: string): Promise<string> {
    const oid = new Types.ObjectId(academicYearId);
    const ay = await AcademicYear.findOne({ tenantId, _id: oid }).lean();
    let yearCode: string;
    if (ay?.startDate && ay?.endDate) {
      const s = (ay.startDate as Date).getFullYear() % 100;
      const e = (ay.endDate as Date).getFullYear() % 100;
      yearCode = `${s.toString().padStart(2, '0')}-${e.toString().padStart(2, '0')}`;
    } else {
      const y = new Date().getFullYear() % 100;
      yearCode = `${y.toString().padStart(2, '0')}-${((y + 1) % 100).toString().padStart(2, '0')}`;
    }
    const key = `ORD:FEE:${yearCode}`;
    const value = await (this as any).nextSequenceValue(tenantId, key);
    return `FEE_${yearCode}_ORD_${value.toString().padStart(6, '0')}`;
  },

  // =====================================================
  // AUTO-GENERATE FEE ORDERS FOR NEW STUDENT (TC-021)
  // =====================================================
  async autoGenerateFeeOrdersForStudent({
    tenantId, studentId, classId, sectionId, academicYearId, campusId,
  }: {
    tenantId: string; studentId: string; classId: string;
    sectionId?: string; academicYearId: string; campusId: string;
  }): Promise<number> {
    const mappings = await FeeStructureClassMapping.find({
      tenantId,
      classId:        new Types.ObjectId(classId),
      academicYearId: new Types.ObjectId(academicYearId),
      campusId:       new Types.ObjectId(campusId),
      status:         'ACTIVE',
    }).lean();

    if (mappings.length === 0) return 0;

    let created = 0;
    for (const mapping of mappings) {
      const feeScheduleId  = mapping.feeScheduleId.toString();
      const feeStructureId = mapping.feeStructureId.toString();
      const mappingId      = mapping._id.toString();

      // Skip if orders already exist for this student + schedule + structure
      const existing = await StudentFeeOrder.findOne({
        tenant_id:        tenantId,
        student_id:       new Types.ObjectId(studentId),
        fee_schedule_id:  new Types.ObjectId(feeScheduleId),
        fee_structure_id: new Types.ObjectId(feeStructureId),
      }).lean();
      if (existing) continue;

      const structure = await FeeStructure.findOne({ tenantId, _id: new Types.ObjectId(feeStructureId) }).lean();
      const schedule  = await FeeSchedule.findOne({ tenantId, _id: new Types.ObjectId(feeScheduleId) }).lean();
      if (!structure || !schedule) continue;
      if (!structure.isActive || structure.totalAmount <= 0 || !structure.components?.length) continue;
      if (!schedule.isActive) continue;

      const slots: Array<{ name: string; dueDate: Date; percentOfTotal?: number; fixedAmount?: number }> =
        (schedule.slots ?? []).length > 0 ? schedule.slots : [{ name: 'Full Payment', dueDate: new Date(), percentOfTotal: 100 }];

      const totalNet = Math.round(structure.totalAmount * 100) / 100;
      const docs: any[] = [];

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        let payable: number;
        if (slot.percentOfTotal != null) payable = Math.round(totalNet * (slot.percentOfTotal / 100) * 100) / 100;
        else if (slot.fixedAmount != null) payable = Math.round(slot.fixedAmount * 100) / 100;
        else payable = Math.round((totalNet / slots.length) * 100) / 100;

        const ratioSum = structure.components.reduce((s: number, c: any) => s + c.amount, 0);
        const feeHeads = structure.components.map((c: any) => {
          const ratio = ratioSum > 0 ? c.amount / ratioSum : 1 / structure.components.length;
          const orig  = Math.round(c.amount * 100) / 100;
          const final = Math.round(payable * ratio * 100) / 100;
          return {
            fee_head_id:       c.feeHeadId,
            fee_head_name:     c.feeHeadName,
            original_amount:   orig,
            concession_amount: Math.round((orig - final) * 100) / 100,
            late_fee_amount:   0,
            paid_amount:       0,
            balance_amount:    final,
            final_amount:      final,
            status:            'PENDING',
          };
        });

        const gross = Math.round(feeHeads.reduce((s: number, h: any) => s + h.original_amount, 0) * 100) / 100;
        const orderNo = await (this as any).nextFeeOrderNo(tenantId, academicYearId);

        docs.push({
          tenant_id:                      tenantId,
          campus_id:                      new Types.ObjectId(campusId),
          academic_year_id:               new Types.ObjectId(academicYearId),
          student_id:                     new Types.ObjectId(studentId),
          class_id:                       new Types.ObjectId(classId),
          section_id:                     sectionId ? new Types.ObjectId(sectionId) : undefined,
          fee_schedule_id:                new Types.ObjectId(feeScheduleId),
          fee_structure_id:               new Types.ObjectId(feeStructureId),
          fee_structure_class_mapping_id: new Types.ObjectId(mappingId),
          order_no:                       orderNo,
          installment_no:                 i + 1,
          installment_title:              slot.name,
          due_date:                       new Date(slot.dueDate),
          fee_heads:                      feeHeads,
          gross_amount:                   gross,
          concession_amount:              0,
          late_fee_amount:                0,
          payable_amount:                 payable,
          paid_amount:                    0,
          balance_amount:                 payable,
          payment_completion_percentage:  0,
          status:                         'PENDING',
          payment_status:                 'UNPAID',
          generated_at:                   new Date(),
          remarks:                        null,
          metadata:                       { source: 'auto_enrollment' },
        });
      }

      if (docs.length > 0) {
        await StudentFeeOrder.insertMany(docs);
        created += docs.length;
      }
    }
    return created;
  },
};

export default FinanceRepo;
