import { AuthContext } from '@vebgenix/auth';
import { FinanceRepo, IInvoice, IPayment, Invoice, Payment, PaymentAllocation } from '@vebgenix/db';
import { AuditLogger } from '@vebgenix/audit';
import { authorize } from '@vebgenix/permissions';
import { getTenantId } from '@vebgenix/tenant';
import { AppError } from '@vebgenix/errors';
import { Types, connection as mongooseConnection } from 'mongoose';
import { generateReceiptNumberForInvoice } from '../numbering';

export interface ManualAllocationLine {
  invoiceItemId: string;
  amount: number;
}

export interface RecordPaymentInput {
  invoiceId: string;
  studentId: string;
  campusId: string;
  amount: number;
  method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'ONLINE';
  referenceNumber?: string;
  remarks?: string;
  allocations?: ManualAllocationLine[];  // required when allocationMethod = MANUAL
}

// ── Allocation helpers ────────────────────────────────────────────────────────

type InvoiceItem = IInvoice['items'][number];

function allocateProRata(items: InvoiceItem[], paymentAmount: number): Map<string, number> {
  const totalBalance = items.reduce((s, i) => s + i.balanceAmount, 0);
  const result = new Map<string, number>();
  let allocated = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const id = item._id!.toString();
    if (item.balanceAmount <= 0) { result.set(id, 0); continue; }

    if (idx === items.length - 1) {
      // Last item absorbs rounding remainder
      result.set(id, Math.round((paymentAmount - allocated) * 100) / 100);
    } else {
      const raw = (paymentAmount * item.balanceAmount) / totalBalance;
      const rounded = Math.round(raw * 100) / 100;
      result.set(id, rounded);
      allocated += rounded;
    }
  }
  return result;
}

function allocatePriorityWise(items: InvoiceItem[], paymentAmount: number): Map<string, number> {
  const sorted = [...items].sort((a, b) => (a.priorityOrder ?? 0) - (b.priorityOrder ?? 0));
  const result = new Map<string, number>();
  let remaining = paymentAmount;

  for (const item of sorted) {
    const id = item._id!.toString();
    if (item.balanceAmount <= 0 || remaining <= 0) { result.set(id, 0); continue; }
    const take = Math.min(item.balanceAmount, remaining);
    result.set(id, Math.round(take * 100) / 100);
    remaining = Math.round((remaining - take) * 100) / 100;
  }
  return result;
}

function allocateManual(items: InvoiceItem[], lines: ManualAllocationLine[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const item of items) result.set(item._id!.toString(), 0);
  for (const line of lines) result.set(line.invoiceItemId, line.amount);
  return result;
}

function validatePartialPayment(invoice: IInvoice, amount: number): void {
  const ct = invoice.collectionType ?? 'PARTIAL_ALLOWED';

  if (ct === 'FULL_ONLY') {
    if (Math.abs(amount - invoice.dueAmount) > 0.01) {
      throw new AppError(
        'BAD_REQUEST',
        `Full payment required. Due amount is ${invoice.dueAmount}`,
      );
    }
    return;
  }

  if (amount > invoice.dueAmount + 0.01) {
    throw new AppError('BAD_REQUEST', `Payment amount exceeds due amount (${invoice.dueAmount})`);
  }

  if (ct === 'PARTIAL_WITH_MINIMUM_AMOUNT') {
    const required = Math.min(invoice.minimumAmount ?? 0, invoice.dueAmount);
    if (amount < required - 0.01) {
      throw new AppError('BAD_REQUEST', `Minimum payment required is ${required}`);
    }
  }

  if (ct === 'PARTIAL_WITH_MINIMUM_PERCENTAGE') {
    const pct = invoice.minimumPercentage ?? 0;
    const required = Math.min(Math.round(invoice.netAmount * pct / 100 * 100) / 100, invoice.dueAmount);
    if (amount < required - 0.01) {
      throw new AppError('BAD_REQUEST', `Minimum payment required is ${required} (${pct}% of ${invoice.netAmount})`);
    }
  }
}

// ── Main use case ─────────────────────────────────────────────────────────────

export class RecordPayment {
  static async execute(ctx: AuthContext, input: RecordPaymentInput) {
    authorize(ctx, 'finance.payments.record');
    const tenantId = getTenantId(ctx);

    const invoice = await FinanceRepo.findInvoiceById(tenantId, input.invoiceId) as IInvoice | null;
    if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
    if (invoice.status === 'PAID')      throw new AppError('CONFLICT', 'Invoice is already fully paid');
    if (invoice.status === 'CANCELLED') throw new AppError('CONFLICT', 'Invoice is cancelled');

    // Validate amount against collection rules
    validatePartialPayment(invoice, input.amount);

    // Validate MANUAL allocations sum matches amount
    if (invoice.allocationMethod === 'MANUAL' && !input.allocations?.length) {
      throw new AppError('BAD_REQUEST', 'Manual allocation lines are required for this invoice');
    }
    if (input.allocations?.length) {
      const sum = input.allocations.reduce((s, l) => s + l.amount, 0);
      if (Math.abs(sum - input.amount) > 0.01) {
        throw new AppError('BAD_REQUEST', `Manual allocation sum (${sum}) must equal payment amount (${input.amount})`);
      }
      for (const line of input.allocations) {
        const item = invoice.items.find(i => i._id!.toString() === line.invoiceItemId);
        if (!item) throw new AppError('BAD_REQUEST', `Invoice item ${line.invoiceItemId} not found`);
        if (line.amount > item.balanceAmount + 0.01) {
          throw new AppError('BAD_REQUEST', `Allocation for ${item.feeHeadName} exceeds balance (${item.balanceAmount})`);
        }
      }
    }

    // Calculate allocation map
    const method = invoice.allocationMethod ?? 'PRO_RATA';
    let allocationMap: Map<string, number>;

    if (method === 'PRIORITY_WISE') {
      allocationMap = allocatePriorityWise(invoice.items, input.amount);
    } else if (method === 'MANUAL' && input.allocations) {
      allocationMap = allocateManual(invoice.items, input.allocations);
    } else {
      allocationMap = allocateProRata(invoice.items, input.amount);
    }

    // For online payments, create PENDING record and stop — allocation happens on webhook
    const isOnline = input.method === 'ONLINE';
    if (isOnline) {
      const payment = await FinanceRepo.createPayment(tenantId, {
        campusId:        invoice.campusId,
        studentId:       invoice.studentId,
        invoiceId:       new Types.ObjectId(invoice._id.toString()),
        academicYearId:  invoice.academicYearId,
        classId:         invoice.classId,
        feeOrderId:      invoice.feeOrderId,
        feeHeadPrefix:   invoice.feeHeadPrefix,
        amount:          input.amount,
        method:          input.method,
        status:          'PENDING',
        referenceNumber: input.referenceNumber,
        remarks:         input.remarks,
        collectedBy:     new Types.ObjectId(ctx.membership!.profileId),
      });
      return { payment, receiptNumber: null, allocations: [] };
    }

    // ── Cash / manual payment: apply allocation inside a transaction ──────────

    const receiptNumber = await generateReceiptNumberForInvoice(tenantId, invoice);

    const updatedItems = invoice.items.map((item) => {
      const allocated = allocationMap.get(item._id!.toString()) ?? 0;
      const newPaid = Math.round((item.paidAmount + allocated) * 100) / 100;
      return {
        ...item,
        paidAmount:    newPaid,
        balanceAmount: Math.max(0, Math.round((item.netAmount - newPaid) * 100) / 100),
      };
    });

    const allocationDocs = invoice.items
      .filter(item => (allocationMap.get(item._id!.toString()) ?? 0) > 0)
      .map(item => ({
        tenantId,
        invoiceId:       new Types.ObjectId(invoice._id.toString()),
        invoiceItemId:   item._id!,
        feeHeadId:       item.feeHeadId,
        feeHeadName:     item.feeHeadName,
        allocatedAmount: allocationMap.get(item._id!.toString())!,
      }));

    const newPaid = Math.round((invoice.paidAmount + input.amount) * 100) / 100;
    const newDue  = Math.max(0, Math.round((invoice.netAmount - newPaid) * 100) / 100);
    const newStatus = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : invoice.status;

    const session = await mongooseConnection.startSession();
    // eslint-disable-next-line prefer-const
    let payment!: IPayment;
    try {
      await session.withTransaction(async () => {
        const [created] = await Payment.create([{
          tenantId,
          campusId:        invoice.campusId,
          studentId:       invoice.studentId,
          invoiceId:       new Types.ObjectId(invoice._id.toString()),
          academicYearId:  invoice.academicYearId,
          classId:         invoice.classId,
          feeOrderId:      invoice.feeOrderId,
          feeHeadPrefix:   invoice.feeHeadPrefix,
          receiptNumber,
          amount:          input.amount,
          method:          input.method,
          status:          'SUCCESS',
          referenceNumber: input.referenceNumber,
          remarks:         input.remarks,
          paidAt:          new Date(),
          collectedBy:     new Types.ObjectId(ctx.membership!.profileId),
        }], { session });
        payment = created;

        // Optimistic guard: reject if invoice was paid/cancelled or due dropped
        // below our amount between the initial read and this write.
        const guarded = await Invoice.findOneAndUpdate(
          {
            _id:       invoice._id,
            status:    { $nin: ['PAID', 'CANCELLED'] },
            dueAmount: { $gte: input.amount - 0.01 },
          },
          { $set: { items: updatedItems, paidAmount: newPaid, dueAmount: newDue, status: newStatus } },
          { session, new: true },
        );
        if (!guarded) {
          throw new AppError('CONFLICT', 'Invoice was already paid or the due amount changed — payment rejected');
        }

        if (allocationDocs.length > 0) {
          await PaymentAllocation.insertMany(
            allocationDocs.map(d => ({ ...d, paymentId: new Types.ObjectId(payment._id.toString()) })),
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }

    const finalAllocations = allocationDocs.map(d => ({
      ...d,
      paymentId: new Types.ObjectId(payment._id.toString()),
    }));

    await AuditLogger.logTenantAction({
      ctx, action: 'PAYMENT_RECORDED',
      entityType: 'Payment', entityId: payment._id.toString(),
      after: {
        invoiceId:     input.invoiceId,
        amount:        input.amount,
        method:        input.method,
        receiptNumber,
        allocationMethod: method,
      },
    });

    return { payment: { ...payment.toObject(), receiptNumber }, receiptNumber, allocations: finalAllocations };
  }

  // Called from Razorpay webhook for ONLINE payments
  static async applyOnlineSuccess(
    tenantId: string,
    paymentId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ) {
    // Quick pre-flight — avoids opening a transaction for obviously stale requests
    const payment = await FinanceRepo.findPaymentById(tenantId, paymentId);
    if (!payment || payment.status !== 'PENDING') return;

    const invoice = await FinanceRepo.findInvoiceById(tenantId, payment.invoiceId.toString()) as IInvoice | null;
    if (!invoice) return;

    // Respect the invoice's allocation method (MANUAL not valid for online — fall back to PRO_RATA)
    const invoiceMethod = invoice.allocationMethod ?? 'PRO_RATA';
    const allocationMap = invoiceMethod === 'PRIORITY_WISE'
      ? allocatePriorityWise(invoice.items, payment.amount)
      : allocateProRata(invoice.items, payment.amount);

    const receiptNumber = await generateReceiptNumberForInvoice(tenantId, invoice);

    const updatedItems = invoice.items.map((item) => {
      const allocated = allocationMap.get(item._id!.toString()) ?? 0;
      const newPaid = Math.round((item.paidAmount + allocated) * 100) / 100;
      return {
        ...item,
        paidAmount:    newPaid,
        balanceAmount: Math.max(0, Math.round((item.netAmount - newPaid) * 100) / 100),
      };
    });

    const allocationDocs = invoice.items
      .filter(item => (allocationMap.get(item._id!.toString()) ?? 0) > 0)
      .map(item => ({
        tenantId,
        invoiceId:       new Types.ObjectId(invoice._id.toString()),
        invoiceItemId:   item._id!,
        feeHeadId:       item.feeHeadId,
        feeHeadName:     item.feeHeadName,
        allocatedAmount: allocationMap.get(item._id!.toString())!,
      }));

    const newPaid = Math.round((invoice.paidAmount + payment.amount) * 100) / 100;
    const newDue  = Math.max(0, Math.round((invoice.netAmount - newPaid) * 100) / 100);
    const newStatus = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : invoice.status;

    const session = await mongooseConnection.startSession();
    try {
      await session.withTransaction(async () => {
        // Atomic PENDING→SUCCESS flip — first writer wins; duplicate webhook finds null and exits
        const claimed = await Payment.findOneAndUpdate(
          { _id: payment._id, status: 'PENDING' },
          { $set: { status: 'SUCCESS', razorpayPaymentId, razorpaySignature, receiptNumber, paidAt: new Date() } },
          { session, new: true },
        );
        if (!claimed) return; // Another concurrent webhook already processed this payment

        const guarded = await Invoice.findOneAndUpdate(
          {
            _id:       invoice._id,
            status:    { $nin: ['PAID', 'CANCELLED'] },
            dueAmount: { $gte: payment.amount - 0.01 },
          },
          { $set: { items: updatedItems, paidAmount: newPaid, dueAmount: newDue, status: newStatus } },
          { session, new: true },
        );
        if (!guarded) {
          throw new AppError('CONFLICT', 'Invoice state changed during online payment processing');
        }

        if (allocationDocs.length > 0) {
          await PaymentAllocation.insertMany(
            allocationDocs.map(d => ({ ...d, paymentId: new Types.ObjectId(payment._id.toString()) })),
            { session },
          );
        }
      });
    } finally {
      await session.endSession();
    }
  }
}
