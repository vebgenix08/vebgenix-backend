import { Schema, model, Document, Types } from 'mongoose';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'OVERDUE';

export interface IInvoiceItem {
  feeHeadId: Types.ObjectId;
  feeHeadName: string;
  amount: number;
  concession: number;
  netAmount: number;
}

export interface IInvoice extends Document {
  tenantId:         string;
  campusId:         Types.ObjectId;
  studentId:        Types.ObjectId;
  academicYearId:   Types.ObjectId;
  invoiceNumber:    string;
  status:           InvoiceStatus;
  items:            IInvoiceItem[];
  totalAmount:      number;
  concessionAmount: number;
  netAmount:        number;
  paidAmount:       number;
  dueAmount:        number;
  dueDate?:         Date;
  issuedAt?:        Date;
  issuedBy:         Types.ObjectId;
  /** Set when invoice is part of a schedule-based installment plan */
  feeScheduleId?:   Types.ObjectId;
  /** Human-readable slot label, e.g. "Term 1", "Q1 Installment" */
  installmentLabel?: string;
  /** Cancellation details */
  cancelledAt?:     Date;
  cancelledBy?:     Types.ObjectId;
  cancelReason?:    string;
  createdAt:        Date;
  updatedAt:        Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    tenantId:        { type: String, required: true },
    campusId:        { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    studentId:       { type: Schema.Types.ObjectId, required: true, ref: 'Student' },
    academicYearId:  { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    invoiceNumber:   { type: String, required: true },
    status:          { type: String, enum: ['DRAFT','ISSUED','PARTIALLY_PAID','PAID','CANCELLED','OVERDUE'], default: 'DRAFT' },
    items: [{
      feeHeadId:   { type: Schema.Types.ObjectId, required: true },
      feeHeadName: { type: String, required: true },
      amount:      { type: Number, required: true },
      concession:  { type: Number, default: 0 },
      netAmount:   { type: Number, required: true },
    }],
    totalAmount:     { type: Number, required: true },
    concessionAmount:{ type: Number, default: 0 },
    netAmount:       { type: Number, required: true },
    paidAmount:      { type: Number, default: 0 },
    dueAmount:       { type: Number, required: true },
    dueDate:          { type: Date },
    issuedAt:         { type: Date },
    issuedBy:         { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
    feeScheduleId:    { type: Schema.Types.ObjectId, ref: 'FeeSchedule' },
    installmentLabel: { type: String },
    cancelledAt:      { type: Date },
    cancelledBy:      { type: Schema.Types.ObjectId, ref: 'Profile' },
    cancelReason:     { type: String },
  },
  { timestamps: true }
);

InvoiceSchema.index({ tenantId: 1 });
InvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ tenantId: 1, studentId: 1, status: 1 });
InvoiceSchema.index({ tenantId: 1, academicYearId: 1, status: 1 });
InvoiceSchema.index({ tenantId: 1, campusId: 1, dueDate: 1 });
InvoiceSchema.index({ tenantId: 1, feeScheduleId: 1 }, { sparse: true }); // installment group lookup

export const Invoice = model<IInvoice>('Invoice', InvoiceSchema);
