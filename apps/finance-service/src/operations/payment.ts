import { FinanceRepo, IInvoice, IPayment, Invoice, Payment, PaymentAllocation } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import { authorize } from '@vebgenix/permissions';
import { AuditLogger } from '@vebgenix/audit';
import { getTenantId } from '@vebgenix/tenant';
import type { AuthContext } from '@vebgenix/auth';
import { Types, connection as mongooseConnection } from 'mongoose';
import { safeOid, toGql } from '../shared';
import {
  generateReceiptNumberForInvoice,
  generateFinanceNumber,
  resolveAcademicYearCode,
} from '../numbering';
import { roundMoney } from '../helpers/finance';
import { verifyRazorpaySignature, createRazorpayOrder } from '../razorpay';
import { TransactionService } from './transaction';

// ── Allocation helpers (from RecordPayment use-case) ──────────────────────────

type InvoiceItem = IInvoice['items'][number];

interface ManualAllocationLine {
  invoiceItemId: string;
  amount: number;
}

function allocateProRata(items: InvoiceItem[], paymentAmount: number): Map<string, number> {
  const totalBalance = items.reduce((s, i) => s + i.balanceAmount, 0);
  const result = new Map<string, number>();
  let allocated = 0;

  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx];
    const id   = item._id!.toString();
    if (item.balanceAmount <= 0) { result.set(id, 0); continue; }

    if (idx === items.length - 1) {
      result.set(id, Math.round((paymentAmount - allocated) * 100) / 100);
    } else {
      const raw     = (paymentAmount * item.balanceAmount) / totalBalance;
      const rounded = Math.round(raw * 100) / 100;
      result.set(id, rounded);
      allocated += rounded;
    }
  }
  return result;
}

function allocatePriorityWise(items: InvoiceItem[], paymentAmount: number): Map<string, number> {
  const sorted    = [...items].sort((a, b) => (a.priorityOrder ?? 0) - (b.priorityOrder ?? 0));
  const result    = new Map<string, number>();
  let remaining   = paymentAmount;

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
      throw new AppError('BAD_REQUEST', `Full payment required. Due amount is ${invoice.dueAmount}`);
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
    const pct      = invoice.minimumPercentage ?? 0;
    const required = Math.min(Math.round(invoice.netAmount * pct / 100 * 100) / 100, invoice.dueAmount);
    if (amount < required - 0.01) {
      throw new AppError('BAD_REQUEST', `Minimum payment required is ${required} (${pct}% of ${invoice.netAmount})`);
    }
  }
}

// ── recordPaymentFull: uses RecordPayment use-case logic (with allocation) ────

interface RecordPaymentFullInput {
  invoiceId: string;
  studentId: string;
  campusId: string;
  amount: number;
  method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'ONLINE';
  referenceNumber?: string;
  remarks?: string;
  allocations?: ManualAllocationLine[];
}

async function recordPaymentFull(ctx: AuthContext, input: RecordPaymentFullInput) {
  authorize(ctx, 'finance.payments.record');
  const tenantId = getTenantId(ctx);

  const invoice = await FinanceRepo.findInvoiceById(tenantId, input.invoiceId) as IInvoice | null;
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
  if (invoice.status === 'PAID')      throw new AppError('CONFLICT', 'Invoice is already fully paid');
  if (invoice.status === 'CANCELLED') throw new AppError('CONFLICT', 'Invoice is cancelled');

  validatePartialPayment(invoice, input.amount);

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

  const method = invoice.allocationMethod ?? 'PRO_RATA';
  let allocationMap: Map<string, number>;

  if (method === 'PRIORITY_WISE') {
    allocationMap = allocatePriorityWise(invoice.items, input.amount);
  } else if (method === 'MANUAL' && input.allocations) {
    allocationMap = allocateManual(invoice.items, input.allocations);
  } else {
    allocationMap = allocateProRata(invoice.items, input.amount);
  }

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
      collectedBy:     safeOid(ctx.membership?.profileId ?? ctx.userId),
    });
    return { payment, receiptNumber: null, allocations: [] };
  }

  const receiptNumber = await generateReceiptNumberForInvoice(tenantId, invoice);

  const updatedItems = invoice.items.map((item) => {
    const allocated = allocationMap.get(item._id!.toString()) ?? 0;
    const newPaid   = Math.round((item.paidAmount + allocated) * 100) / 100;
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

  const newPaid  = Math.round((invoice.paidAmount + input.amount) * 100) / 100;
  const newDue   = Math.max(0, Math.round((invoice.netAmount - newPaid) * 100) / 100);
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
        collectedBy:     safeOid(ctx.membership?.profileId ?? ctx.userId),
      }], { session });
      payment = created;

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
      invoiceId:        input.invoiceId,
      amount:           input.amount,
      method:           input.method,
      receiptNumber,
      allocationMethod: method,
    },
  });

  return { payment: { ...payment.toObject(), receiptNumber }, receiptNumber, allocations: finalAllocations };
}

// ── applyOnlineSuccess (from RecordPayment use-case + PaymentService) ─────────

export async function applyOnlineSuccess(
  tenantId: string,
  paymentId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
) {
  const payment = await FinanceRepo.findPaymentById(tenantId, paymentId);
  if (!payment || payment.status !== 'PENDING') return null;

  const invoice = await FinanceRepo.findInvoiceById(tenantId, payment.invoiceId.toString()) as IInvoice | null;
  if (!invoice) return null;

  const invoiceMethod  = invoice.allocationMethod ?? 'PRO_RATA';
  const allocationMap  = invoiceMethod === 'PRIORITY_WISE'
    ? allocatePriorityWise(invoice.items, payment.amount)
    : allocateProRata(invoice.items, payment.amount);

  const receiptNumber  = await generateReceiptNumberForInvoice(tenantId, invoice);

  const updatedItems = invoice.items.map((item) => {
    const allocated = allocationMap.get(item._id!.toString()) ?? 0;
    const newPaid   = Math.round((item.paidAmount + allocated) * 100) / 100;
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

  const newPaid   = Math.round((invoice.paidAmount + payment.amount) * 100) / 100;
  const newDue    = Math.max(0, Math.round((invoice.netAmount - newPaid) * 100) / 100);
  const newStatus = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : invoice.status;

  const session = await mongooseConnection.startSession();
  try {
    await session.withTransaction(async () => {
      const claimed = await Payment.findOneAndUpdate(
        { _id: payment._id, status: 'PENDING' },
        { $set: { status: 'SUCCESS', razorpayPaymentId, razorpaySignature, receiptNumber, paidAt: new Date() } },
        { session, new: true },
      );
      if (!claimed) return;

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
  return null;
}

// ── createPaymentOrder ────────────────────────────────────────────────────────

async function createPaymentOrder(ctx: AuthContext, tenantId: string, invoiceId: string, amount?: number) {
  const invoice = await FinanceRepo.findInvoiceById(tenantId, invoiceId);
  if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');

  const payable = roundMoney(amount ?? invoice.dueAmount);
  if (payable <= 0) throw new AppError('BAD_REQUEST', 'Amount must be greater than 0');

  const receipt = await generateReceiptNumberForInvoice(tenantId, invoice as IInvoice);
  const order   = await createRazorpayOrder({
    amount:   Math.round(payable * 100),
    currency: 'INR',
    receipt,
    notes: {
      invoiceId: invoice._id.toString(),
      tenantId,
      studentId: invoice.studentId.toString(),
    },
  });
  const payment = await FinanceRepo.createPayment(tenantId, {
    campusId:        invoice.campusId,
    studentId:       invoice.studentId,
    invoiceId:       invoice._id,
    academicYearId:  invoice.academicYearId,
    classId:         invoice.classId,
    feeOrderId:      invoice.feeOrderId,
    feeHeadPrefix:   invoice.feeHeadPrefix,
    amount:          payable,
    method:          'ONLINE',
    status:          'PENDING',
    razorpayOrderId: order.id,
    collectedBy:     safeOid(ctx.membership?.profileId ?? ctx.userId),
  });

  return { orderId: order.id, amount: payable, currency: order.currency ?? 'INR', paymentId: payment._id.toString() };
}

// ── collectPaymentByStudent helper (uses PaymentService.record logic) ─────────

interface OrderSnapshot {
  _id: Types.ObjectId;
  order_no: string;
  due_date: Date;
  payable_amount: number;
  paid_amount: number;
  balance_amount: number;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';
}

function orderAllocation(order: OrderSnapshot, remaining: number) {
  return roundMoney(Math.min(order.balance_amount, remaining));
}

interface RecordPaymentServiceInput {
  invoiceId?: string;
  studentId: string;
  campusId: string;
  academicYearId?: string;
  amount: number;
  method: 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'ONLINE';
  referenceNumber?: string;
  remarks?: string;
  orderIds?: string[];
}

async function recordPaymentService(ctx: AuthContext, tenantId: string, input: RecordPaymentServiceInput) {
  const invoice = input.invoiceId
    ? await FinanceRepo.findInvoiceById(tenantId, input.invoiceId)
    : null;

  if (input.invoiceId && !invoice) throw new AppError('NOT_FOUND', 'Invoice not found');
  if (invoice?.status === 'PAID')      throw new AppError('CONFLICT', 'Invoice is already fully paid');
  if (invoice?.status === 'CANCELLED') throw new AppError('CONFLICT', 'Invoice is cancelled');
  if (!invoice && !input.academicYearId) {
    throw new AppError('BAD_REQUEST', 'academicYearId is required when payment is not linked to an invoice');
  }

  const allOrders = await FinanceRepo.getStudentOrders(tenantId, input.studentId).then((docs: unknown) =>
    (docs as OrderSnapshot[]).filter(order => order.status !== 'PAID' && order.status !== 'CANCELLED'),
  );
  const openOrders = input.orderIds?.length
    ? allOrders.filter((o: OrderSnapshot) => input.orderIds!.includes(o._id.toString()))
    : allOrders;
  const sortedOrders = [...openOrders].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  if (!invoice && sortedOrders.length === 0) {
    throw new AppError('BAD_REQUEST', 'No payable orders found for this payment');
  }

  if (input.method === 'ONLINE') {
    const pendingPayment = await FinanceRepo.createPayment(tenantId, {
      campusId:        invoice?.campusId ?? new Types.ObjectId(input.campusId),
      studentId:       invoice?.studentId ?? new Types.ObjectId(input.studentId),
      invoiceId:       invoice?._id,
      academicYearId:  invoice?.academicYearId ?? new Types.ObjectId(input.academicYearId as string),
      classId:         invoice?.classId,
      feeOrderId:      invoice?.feeOrderId ?? 'PENDING',
      feeHeadPrefix:   invoice?.feeHeadPrefix ?? 'FEE',
      amount:          roundMoney(input.amount),
      method:          input.method,
      status:          'PENDING',
      referenceNumber: input.referenceNumber,
      remarks:         input.remarks,
      collectedBy:     safeOid(ctx.membership?.profileId ?? ctx.userId),
    });
    return { payment: pendingPayment, receiptNumber: null, allocations: [] };
  }

  const session = await mongooseConnection.startSession();
  let paymentDoc!: IPayment;
  let receiptNumber: string | null = null;
  const allocations: Array<Record<string, unknown>> = [];

  try {
    await session.withTransaction(async () => {
      let remaining = roundMoney(input.amount);
      const paymentLines: Array<{ orderId: Types.ObjectId; orderNo: string; paidAmount: number }> = [];

      for (const order of sortedOrders) {
        if (remaining <= 0) break;
        const paidAmount = orderAllocation(order, remaining);
        if (paidAmount <= 0) continue;
        const updated = await FinanceRepo.updateOrderPayment(tenantId, order._id.toString(), paidAmount);
        if (!updated) throw new AppError('CONFLICT', `Order ${order.order_no} could not be updated`);
        remaining = roundMoney(remaining - paidAmount);
        paymentLines.push({ orderId: order._id, orderNo: order.order_no, paidAmount });
        allocations.push({ orderId: order._id.toString(), orderNo: order.order_no, paidAmount });

        const balanceBefore = roundMoney(order.balance_amount);
        const balanceAfter  = roundMoney(balanceBefore - paidAmount);
        await TransactionService.create(tenantId, {
          campusId:        invoice?.campusId ?? new Types.ObjectId(input.campusId),
          academicYearId:  invoice?.academicYearId ?? new Types.ObjectId(input.academicYearId ?? ''),
          studentId:       new Types.ObjectId(input.studentId),
          classId:         invoice?.classId,
          feeOrderId:      order._id,
          invoiceId:       invoice?._id,
          transactionType: 'PAYMENT',
          status:          'SUCCESS',
          amount:          paidAmount,
          balanceBefore,
          balanceAfter,
          referenceNumber: input.referenceNumber,
          remarks:         input.remarks,
          metadata:        { orderNo: order.order_no },
          createdBy:       safeOid(ctx.membership?.profileId ?? ctx.userId),
        });
      }

      const finalPaymentAmount = roundMoney(input.amount - Math.max(0, remaining));
      if (invoice) {
        receiptNumber = await generateReceiptNumberForInvoice(tenantId, invoice as IInvoice);
      } else {
        if (!input.academicYearId) {
          throw new AppError('BAD_REQUEST', 'academicYearId is required when payment is not linked to an invoice');
        }
        const academicYearCode = await resolveAcademicYearCode(tenantId, input.academicYearId);
        receiptNumber = await generateFinanceNumber(tenantId, 'FEE', academicYearCode, 'RCP');
      }

      paymentDoc = await FinanceRepo.createPayment(tenantId, {
        campusId:        invoice?.campusId ?? new Types.ObjectId(input.campusId),
        studentId:       invoice?.studentId ?? new Types.ObjectId(input.studentId),
        invoiceId:       invoice?._id,
        academicYearId:  invoice?.academicYearId ?? new Types.ObjectId(input.academicYearId as string),
        classId:         invoice?.classId,
        feeOrderId:      invoice?.feeOrderId ?? receiptNumber,
        feeHeadPrefix:   invoice?.feeHeadPrefix ?? 'FEE',
        receiptNumber,
        amount:          finalPaymentAmount,
        method:          input.method,
        status:          'SUCCESS',
        referenceNumber: input.referenceNumber,
        remarks:         input.remarks,
        paidAt:          new Date(),
        collectedBy:     safeOid(ctx.membership?.profileId ?? ctx.userId),
        orders:          paymentLines,
        totalPaidAmount: finalPaymentAmount,
        excessAmount:    remaining > 0 ? remaining : 0,
        refundAmount:    0,
      });

      if (invoice) {
        const newPaid   = roundMoney(invoice.paidAmount + finalPaymentAmount);
        const newDue    = Math.max(0, roundMoney(invoice.netAmount - newPaid));
        const newStatus = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : invoice.status;
        await FinanceRepo.updateInvoice(tenantId, invoice._id.toString(), { paidAmount: newPaid, dueAmount: newDue, status: newStatus });
      }
    });
  } finally {
    await session.endSession();
  }

  return { payment: paymentDoc, receiptNumber, allocations: [] };
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handlePayment(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  tenantId: string,
): Promise<unknown> {
  switch (operation) {
    case 'recordPayment':
    case 'POST:/api/admin/finance/payments': {
      const input = ((args.input as Record<string, unknown>) ?? args) as unknown as RecordPaymentFullInput;
      const result = await recordPaymentFull(ctx, input);
      return {
        payment:       toGql(result.payment),
        receiptNumber: result.receiptNumber,
        allocations:   (result.allocations as unknown[]).map(d => toGql(d)),
      };
    }

    case 'listPayments':
    case 'GET:/api/admin/finance/payments': {
      authorize(ctx, 'finance.payment.read');
      const filter: Record<string, unknown> = {};
      if (args.invoiceId)      filter.invoiceId      = args.invoiceId;
      if (args.studentId)      filter.studentId      = args.studentId;
      if (args.status)         filter.status         = args.status;
      if (args.campusId)       filter.campusId       = args.campusId;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.from || args.to) {
        const createdAt: Record<string, Date> = {};
        if (args.from) createdAt.$gte = new Date(args.from as string);
        if (args.to)   createdAt.$lte = new Date(args.to as string);
        filter.createdAt = createdAt;
      }
      const docs = await FinanceRepo.listPayments(tenantId, filter);
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getPayment':
    case 'GET:/api/admin/finance/payments/:id':
      authorize(ctx, 'finance.payment.read');
      return toGql(await FinanceRepo.findPaymentById(tenantId, args.id as string));

    case 'createPaymentOrder':
    case 'POST:/api/finance/payments/create-order': {
      authorize(ctx, 'finance.payment.create');
      return createPaymentOrder(ctx, tenantId, args.invoiceId as string, args.amount ? Number(args.amount) : undefined);
    }

    case 'verifyPaymentSignature':
    case 'POST:/api/finance/payments/verify': {
      authorize(ctx, 'finance.payment.create');
      const input = ((args.input as Record<string, unknown>) ?? args) as Record<string, string>;
      const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = input;
      const valid = verifyRazorpaySignature(
        `${razorpayOrderId}|${razorpayPaymentId}`,
        razorpaySignature,
        process.env.RAZORPAY_KEY_SECRET ?? '',
      );
      if (!valid) throw new AppError('BAD_REQUEST', 'Invalid payment signature');
      const payment = await FinanceRepo.findPaymentByRazorpayOrderId(razorpayOrderId);
      if (!payment) throw new AppError('NOT_FOUND', 'Payment record not found');
      await applyOnlineSuccess(tenantId, payment._id.toString(), razorpayPaymentId, razorpaySignature);
      return { success: true, paymentId: String(payment._id) };
    }

    case 'listReceipts':
    case 'GET:/api/admin/finance/receipts': {
      authorize(ctx, 'finance.payment.read');
      const filter: Record<string, unknown> = {};
      if (args.studentId)      filter.studentId      = args.studentId;
      if (args.invoiceId)      filter.invoiceId      = args.invoiceId;
      if (args.campusId)       filter.campusId       = args.campusId;
      if (args.academicYearId) filter.academicYearId = args.academicYearId;
      if (args.from || args.to) {
        const createdAt: Record<string, Date> = {};
        if (args.from) createdAt.$gte = new Date(args.from as string);
        if (args.to)   createdAt.$lte = new Date(args.to as string);
        filter.createdAt = createdAt;
      }
      const docs = await FinanceRepo.listPayments(tenantId, { ...filter, status: 'SUCCESS', receiptNumber: { $exists: true, $ne: null } });
      return (docs as unknown[]).map(d => toGql(d));
    }

    case 'getReceipt':
    case 'GET:/api/admin/finance/receipts/:id': {
      authorize(ctx, 'finance.payment.read');
      return toGql(await FinanceRepo.findPaymentById(tenantId, args.id as string));
    }

    case 'collectPaymentByStudent':
    case 'POST:/api/admin/finance/students/:studentId/collect': {
      authorize(ctx, 'finance.payment.create');
      const input     = ((args.input as Record<string, unknown>) ?? args) as Record<string, unknown>;
      const studentId = (args.studentId ?? args.id) as string;
      let remaining   = input.amount as number;
      const method    = (input.method as string) ?? 'CASH';
      if (!remaining || remaining <= 0) throw new AppError('BAD_REQUEST', 'amount must be > 0');

      const invoices = await FinanceRepo.listInvoices(tenantId, {
        studentId,
        status: { $in: ['PENDING', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      });

      const payments = [];

      if ((invoices as unknown[]).length > 0) {
        // Invoice-based flow
        (invoices as { createdAt: Date }[]).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        for (const inv of invoices) {
          if (remaining <= 0) break;
          const toPay = Math.min(remaining, inv.dueAmount);
          const result = await recordPaymentService(ctx, tenantId, {
            invoiceId:      inv._id.toString(),
            studentId:      inv.studentId.toString(),
            campusId:       inv.campusId.toString(),
            academicYearId: inv.academicYearId.toString(),
            amount:         toPay,
            method:         method as 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'ONLINE',
            remarks:        input.remarks as string | undefined,
          });
          payments.push(toGql(result.payment));
          remaining -= toPay;
        }
      } else {
        // Order-based flow — resolve campusId and academicYearId from student orders
        const { FinanceRepo: FR } = await import('@vebgenix/db');
        interface OrderDoc { campus_id: Types.ObjectId; academic_year_id: Types.ObjectId }
        const orders = (await FR.getStudentOrders(tenantId, studentId)) as OrderDoc[];
        const firstOrder = orders[0];
        if (!firstOrder) throw new AppError('BAD_REQUEST', 'No payable orders found for this student');
        const campusId       = firstOrder.campus_id.toString();
        const academicYearId = firstOrder.academic_year_id.toString();
        const result = await recordPaymentService(ctx, tenantId, {
          studentId,
          campusId,
          academicYearId,
          amount:   remaining,
          method:   method as 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'ONLINE',
          remarks:  input.remarks as string | undefined,
        });
        payments.push(toGql(result.payment));
        remaining = 0;
      }

      return { payments, totalCollected: (input.amount as number) - remaining, remainingAmount: remaining };
    }

    case 'getStudentDues':
    case 'GET:/api/admin/finance/students/:studentId/dues': {
      authorize(ctx, 'finance.invoice.read');
      const studentId = (args.studentId ?? args.id) as string;
      if (!studentId || !Types.ObjectId.isValid(studentId)) {
        return { studentId: studentId ?? null, invoices: [], totalDue: 0 };
      }
      const overdueInvoices = await FinanceRepo.listInvoices(tenantId, {
        studentId: new Types.ObjectId(studentId),
        status: { $in: ['PENDING', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE'] },
      });
      const totalDue = (overdueInvoices as { dueAmount: number }[]).reduce((s, i) => s + i.dueAmount, 0);
      return { studentId, invoices: (overdueInvoices as unknown[]).map(d => toGql(d)), totalDue };
    }

    default:
      return undefined;
  }
}
