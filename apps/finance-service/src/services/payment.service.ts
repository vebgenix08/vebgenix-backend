import { connection as mongooseConnection, Types } from 'mongoose';
import { FinanceRepo, IInvoice, IPayment } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';
import { generateReceiptNumberForInvoice, generateFinanceNumber, resolveAcademicYearCode } from '../numbering';
import { roundMoney } from '../helpers/finance';
import { TransactionService } from './transaction.service';
import { createRazorpayOrder } from '../razorpay';

export interface RecordPaymentInput {
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

type OrderSnapshot = {
  _id: Types.ObjectId;
  order_no: string;
  due_date: Date;
  payable_amount: number;
  paid_amount: number;
  balance_amount: number;
  fee_heads: Array<{
    fee_head_id: Types.ObjectId;
    fee_head_name: string;
    original_amount: number;
    concession_amount: number;
    late_fee_amount: number;
    paid_amount: number;
    balance_amount: number;
    final_amount: number;
    status: 'PENDING' | 'PARTIAL' | 'PAID';
  }>;
  status: 'PENDING' | 'PARTIAL' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'REFUNDED';
};

function orderAllocation(order: OrderSnapshot, remaining: number) {
  const amount = Math.min(order.balance_amount, remaining);
  return roundMoney(amount);
}

async function loadOpenOrders(
  tenantId: string,
  input: RecordPaymentInput,
  invoice: IInvoice | null,
): Promise<OrderSnapshot[]> {
  const orders = input.orderIds?.length
    ? await FinanceRepo.getStudentOrders(tenantId, input.studentId).then((docs: unknown) =>
        (docs as OrderSnapshot[]).filter(order => input.orderIds!.includes(order._id.toString())),
      )
    : invoice
      ? await FinanceRepo.getStudentOrders(tenantId, input.studentId).then((docs: unknown) =>
          (docs as OrderSnapshot[]).filter(order => order.status !== 'PAID' && order.status !== 'CANCELLED'),
        )
      : await FinanceRepo.getStudentOrders(tenantId, input.studentId).then((docs: unknown) =>
          (docs as OrderSnapshot[]).filter(order => order.status !== 'PAID' && order.status !== 'CANCELLED'),
        );

  return [...orders].sort((a, b) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());
}

function buildPaymentLines(sortedOrders: OrderSnapshot[], amount: number) {
  let remaining = roundMoney(amount);
  const lines: Array<{ orderId: Types.ObjectId; orderNo: string; paidAmount: number }> = [];

  for (const order of sortedOrders) {
    if (remaining <= 0) break;
    const paidAmount = orderAllocation(order, remaining);
    if (paidAmount <= 0) continue;
    remaining = roundMoney(remaining - paidAmount);
    lines.push({ orderId: order._id, orderNo: order.order_no, paidAmount });
  }

  return {
    lines,
    appliedAmount: roundMoney(amount - Math.max(0, remaining)),
    excessAmount: remaining > 0 ? roundMoney(remaining) : 0,
  };
}

export class PaymentService {
  static async list(tenantId: string, filters: Record<string, unknown> = {}) {
    return FinanceRepo.listPayments(tenantId, filters);
  }

  static async getById(tenantId: string, id: string) {
    return FinanceRepo.findPaymentById(tenantId, id);
  }

  static async findByRazorpayOrderId(orderId: string) {
    return FinanceRepo.findPaymentByRazorpayOrderId(orderId);
  }

  static async createPaymentOrder(ctx: AuthContext, tenantId: string, invoiceId: string, amount?: number) {
    const invoice = await FinanceRepo.findInvoiceById(tenantId, invoiceId);
    if (!invoice) throw new AppError('NOT_FOUND', 'Invoice not found');

    const payable = roundMoney(amount ?? invoice.dueAmount);
    if (payable <= 0) throw new AppError('BAD_REQUEST', 'Amount must be greater than 0');

    const receipt = await generateReceiptNumberForInvoice(tenantId, invoice as IInvoice);
    const order = await createRazorpayOrder({
      amount: Math.round(payable * 100),
      currency: 'INR',
      receipt,
      notes: {
        invoiceId: invoice._id.toString(),
        tenantId,
        studentId: invoice.studentId.toString(),
      },
    });
    const payment = await FinanceRepo.createPayment(tenantId, {
      campusId: invoice.campusId,
      studentId: invoice.studentId,
      invoiceId: invoice._id,
      academicYearId: invoice.academicYearId,
      classId: invoice.classId,
      feeOrderId: invoice.feeOrderId,
      feeHeadPrefix: invoice.feeHeadPrefix,
      amount: payable,
      method: 'ONLINE',
      status: 'PENDING',
      razorpayOrderId: order.id,
      collectedBy: new Types.ObjectId(ctx.membership!.profileId),
    });

    return { orderId: order.id, amount: payable, currency: order.currency ?? 'INR', paymentId: payment._id.toString() };
  }

  static async record(ctx: AuthContext, tenantId: string, input: RecordPaymentInput) {
    const invoice = input.invoiceId
      ? await FinanceRepo.findInvoiceById(tenantId, input.invoiceId)
      : null;

    if (input.invoiceId && !invoice) {
      throw new AppError('NOT_FOUND', 'Invoice not found');
    }
    if (invoice?.status === 'PAID') {
      throw new AppError('CONFLICT', 'Invoice is already fully paid');
    }
    if (invoice?.status === 'CANCELLED') {
      throw new AppError('CONFLICT', 'Invoice is cancelled');
    }
    if (!invoice && !input.academicYearId) {
      throw new AppError('BAD_REQUEST', 'academicYearId is required when payment is not linked to an invoice');
    }

    const openOrders = await loadOpenOrders(tenantId, input, invoice);
    if (!invoice && openOrders.length === 0) {
      throw new AppError('BAD_REQUEST', 'No payable orders found for this payment');
    }

    const sortedOrders = [...openOrders];
    const paymentPlan = buildPaymentLines(sortedOrders, roundMoney(input.amount));
    let paymentDoc!: IPayment;
    let receiptNumber: string | null = null;
    const allocations: Array<Record<string, unknown>> = [];

    if (input.method === 'ONLINE') {
      const pendingPayment = await FinanceRepo.createPayment(tenantId, {
        campusId: invoice?.campusId ?? new Types.ObjectId(input.campusId),
        studentId: invoice?.studentId ?? new Types.ObjectId(input.studentId),
        invoiceId: invoice?._id,
        academicYearId: invoice?.academicYearId ?? new Types.ObjectId(input.academicYearId as string),
        classId: invoice?.classId,
        feeOrderId: invoice?.feeOrderId ?? 'PENDING',
        feeHeadPrefix: invoice?.feeHeadPrefix ?? 'FEE',
        amount: roundMoney(input.amount),
        method: input.method,
        status: 'PENDING',
        referenceNumber: input.referenceNumber,
        remarks: input.remarks,
        collectedBy: new Types.ObjectId(ctx.membership!.profileId),
        orders: paymentPlan.lines,
        totalPaidAmount: paymentPlan.appliedAmount,
        excessAmount: paymentPlan.excessAmount,
        refundAmount: 0,
      });
      return {
        payment: pendingPayment,
        receiptNumber: null,
        allocations: [],
      };
    }

    const session = await mongooseConnection.startSession();
    try {
      await session.withTransaction(async () => {
        let remaining = roundMoney(input.amount);
        const paymentLines: Array<{ orderId: Types.ObjectId; orderNo: string; paidAmount: number }> = [];

        for (const order of sortedOrders) {
          if (remaining <= 0) break;
          const paidAmount = orderAllocation(order, remaining);
          if (paidAmount <= 0) continue;
          const updated = await FinanceRepo.updateOrderPayment(tenantId, order._id.toString(), paidAmount);
          if (!updated) {
            throw new AppError('CONFLICT', `Order ${order.order_no} could not be updated`);
          }
          remaining = roundMoney(remaining - paidAmount);
          paymentLines.push({ orderId: order._id, orderNo: order.order_no, paidAmount });
          allocations.push({
            orderId: order._id.toString(),
            orderNo: order.order_no,
            paidAmount,
          });

          const balanceBefore = roundMoney(order.balance_amount);
          const balanceAfter = roundMoney(balanceBefore - paidAmount);
          await TransactionService.create(tenantId, {
            campusId: invoice?.campusId ?? new Types.ObjectId(input.campusId),
            academicYearId: invoice?.academicYearId ?? new Types.ObjectId(input.academicYearId ?? ''),
            studentId: new Types.ObjectId(input.studentId),
            classId: invoice?.classId,
            feeOrderId: order._id,
            invoiceId: invoice?._id,
            transactionType: 'PAYMENT',
            status: 'SUCCESS',
            amount: paidAmount,
            balanceBefore,
            balanceAfter,
            referenceNumber: input.referenceNumber,
            remarks: input.remarks,
            metadata: { orderNo: order.order_no },
            createdBy: new Types.ObjectId(ctx.membership!.profileId),
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
          campusId: invoice?.campusId ?? new Types.ObjectId(input.campusId),
          studentId: invoice?.studentId ?? new Types.ObjectId(input.studentId),
          invoiceId: invoice?._id,
          academicYearId: invoice?.academicYearId ?? new Types.ObjectId(input.academicYearId as string),
          classId: invoice?.classId,
          feeOrderId: invoice?.feeOrderId ?? receiptNumber,
          feeHeadPrefix: invoice?.feeHeadPrefix ?? 'FEE',
          receiptNumber,
          amount: finalPaymentAmount,
          method: input.method,
          status: input.method === 'ONLINE' ? 'PENDING' : 'SUCCESS',
          referenceNumber: input.referenceNumber,
          remarks: input.remarks,
          paidAt: input.method === 'ONLINE' ? undefined : new Date(),
          collectedBy: new Types.ObjectId(ctx.membership!.profileId),
          orders: paymentLines,
          totalPaidAmount: finalPaymentAmount,
          excessAmount: remaining > 0 ? remaining : 0,
          refundAmount: 0,
        });

        if (invoice) {
          const newPaid = roundMoney(invoice.paidAmount + finalPaymentAmount);
          const newDue = Math.max(0, roundMoney(invoice.netAmount - newPaid));
          const newStatus = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : invoice.status;
          await FinanceRepo.updateInvoice(tenantId, invoice._id.toString(), {
            paidAmount: newPaid,
            dueAmount: newDue,
            status: newStatus,
          });
        }
      });
    } finally {
      await session.endSession();
    }

    return {
      payment: paymentDoc,
      receiptNumber,
      allocations: [],
    };
  }

  static async applyOnlineSuccess(
    tenantId: string,
    paymentId: string,
    razorpayPaymentId: string,
    razorpaySignature: string,
  ) {
    const payment = await FinanceRepo.findPaymentById(tenantId, paymentId);
    if (!payment || payment.status !== 'PENDING') return null;

    const updated = await FinanceRepo.updatePaymentStatus(paymentId, {
      status: 'SUCCESS',
      razorpayPaymentId,
      razorpaySignature,
      paidAt: new Date(),
    });

    if (!updated) return null;
    const orderLines = (payment.orders ?? []) as Array<{ orderId: Types.ObjectId; orderNo: string; paidAmount: number }>;
    let totalApplied = 0;

    for (const line of orderLines) {
      const updatedOrder = await FinanceRepo.updateOrderPayment(tenantId, line.orderId.toString(), line.paidAmount);
      if (updatedOrder) {
        totalApplied = roundMoney(totalApplied + line.paidAmount);
        await TransactionService.create(tenantId, {
          campusId: payment.campusId,
          academicYearId: payment.academicYearId,
          studentId: payment.studentId,
          classId: payment.classId,
          feeOrderId: line.orderId,
          invoiceId: payment.invoiceId,
          paymentId: updated._id,
          transactionType: 'PAYMENT',
          status: 'SUCCESS',
          amount: line.paidAmount,
          balanceBefore: roundMoney(updatedOrder.balance_amount + line.paidAmount),
          balanceAfter: roundMoney(updatedOrder.balance_amount),
          referenceNumber: payment.referenceNumber,
          remarks: payment.remarks,
          metadata: { orderNo: line.orderNo, razorpayPaymentId },
          createdBy: payment.collectedBy,
        });
      }
    }

    if (payment.invoiceId) {
      const invoice = await FinanceRepo.findInvoiceById(tenantId, payment.invoiceId.toString());
      if (invoice) {
        const applied = totalApplied > 0 ? totalApplied : roundMoney(payment.amount);
        const newPaid = roundMoney(invoice.paidAmount + applied);
        const newDue = Math.max(0, roundMoney(invoice.netAmount - newPaid));
        const newStatus = newDue <= 0 ? 'PAID' : newPaid > 0 ? 'PARTIALLY_PAID' : invoice.status;
        const receiptNumber = await generateReceiptNumberForInvoice(tenantId, invoice);
        await FinanceRepo.updateInvoice(tenantId, invoice._id.toString(), {
          paidAmount: newPaid,
          dueAmount: newDue,
          status: newStatus,
        });
        await FinanceRepo.updatePaymentStatus(paymentId, { receiptNumber, totalPaidAmount: applied });
        if (orderLines.length === 0) {
          await TransactionService.create(tenantId, {
            campusId: payment.campusId,
            academicYearId: payment.academicYearId,
            studentId: payment.studentId,
            classId: payment.classId,
            feeOrderId: invoice._id,
            invoiceId: invoice._id,
            paymentId: updated._id,
            transactionType: 'PAYMENT',
            status: 'SUCCESS',
            amount: applied,
            balanceBefore: roundMoney(newPaid - applied),
            balanceAfter: newPaid,
            referenceNumber: payment.referenceNumber,
            remarks: payment.remarks,
            metadata: { invoiceNumber: invoice.invoiceNumber, razorpayPaymentId },
            createdBy: payment.collectedBy,
          });
        }
      }
    } else if (totalApplied > 0) {
      const academicYearCode = await resolveAcademicYearCode(tenantId, payment.academicYearId.toString());
      const receiptNumber = await generateFinanceNumber(tenantId, 'FEE', academicYearCode, 'RCP');
      await FinanceRepo.updatePaymentStatus(paymentId, { receiptNumber, totalPaidAmount: totalApplied });
    }
    return updated;
  }
}
