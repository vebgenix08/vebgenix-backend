import { Schema, model, Document, Types } from 'mongoose';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'CANCELLED' | 'OVERDUE' | 'PENDING';
export type CollectionType =
  | 'FULL_ONLY'
  | 'PARTIAL_ALLOWED'
  | 'PARTIAL_WITH_MINIMUM_AMOUNT'
  | 'PARTIAL_WITH_MINIMUM_PERCENTAGE';
export type AllocationMethod = 'PRO_RATA' | 'PRIORITY_WISE' | 'MANUAL';

export interface IInvoiceItem {
  _id?: Types.ObjectId;
  feeHeadId: Types.ObjectId;
  feeHeadName: string;
  amount: number;
  concession: number;
  netAmount: number;
  paidAmount: number;
  balanceAmount: number;
  priorityOrder: number;
}

export interface IInvoice extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  studentId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId?: Types.ObjectId;
  feeOrderId: string;
  feeHeadPrefix: string;
  invoiceNumber: string;
  status: InvoiceStatus;
  items: IInvoiceItem[];
  totalAmount: number;
  concessionAmount: number;
  netAmount: number;
  paidAmount: number;
  dueAmount: number;
  dueDate?: Date;
  issuedAt?: Date;
  issuedBy: Types.ObjectId;
  feeScheduleId?: Types.ObjectId;
  installmentLabel?: string;
  cancelledAt?: Date;
  cancelledBy?: Types.ObjectId;
  cancelReason?: string;
  feeCategoryId?: Types.ObjectId;
  feeStructureId?: Types.ObjectId;
  allocationMethod: AllocationMethod;
  collectionType: CollectionType;
  minimumAmount: number;
  minimumPercentage: number;
  allowPartialPayment: boolean;
  graceDays: number;
  invoicePrefix: string;
  receiptPrefix: string;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceSchema = new Schema<IInvoice>(
  {
    tenantId:        { type: String, required: true },
    campusId:        { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    studentId:       { type: Schema.Types.ObjectId, required: true, ref: 'Student' },
    academicYearId:  { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    classId:         { type: Schema.Types.ObjectId, ref: 'Class' },
    feeOrderId:      { type: String, required: true },
    feeHeadPrefix:   { type: String, required: true, uppercase: true, trim: true },
    invoiceNumber:   { type: String, required: true },
    status:          { type: String, enum: ['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED', 'OVERDUE', 'PENDING'], default: 'PENDING' },
    items: [{
      feeHeadId:     { type: Schema.Types.ObjectId, required: true },
      feeHeadName:   { type: String, required: true },
      amount:        { type: Number, required: true },
      concession:    { type: Number, default: 0 },
      netAmount:     { type: Number, required: true },
      paidAmount:    { type: Number, default: 0 },
      balanceAmount: { type: Number, required: true },
      priorityOrder: { type: Number, default: 0 },
    }],
    totalAmount:      { type: Number, required: true },
    concessionAmount: { type: Number, default: 0 },
    netAmount:        { type: Number, required: true },
    paidAmount:       { type: Number, default: 0 },
    dueAmount:        { type: Number, required: true },
    dueDate:          { type: Date },
    issuedAt:         { type: Date },
    issuedBy:         { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
    feeScheduleId:    { type: Schema.Types.ObjectId, ref: 'FeeSchedule' },
    installmentLabel: { type: String },
    cancelledAt:      { type: Date },
    cancelledBy:      { type: Schema.Types.ObjectId, ref: 'Profile' },
    cancelReason:     { type: String },
    feeCategoryId:    { type: Schema.Types.ObjectId, ref: 'FeeCategory' },
    feeStructureId:   { type: Schema.Types.ObjectId, ref: 'FeeStructure' },
    allocationMethod: { type: String, enum: ['PRO_RATA', 'PRIORITY_WISE', 'MANUAL'], default: 'PRO_RATA' },
    collectionType:   { type: String, enum: ['FULL_ONLY', 'PARTIAL_ALLOWED', 'PARTIAL_WITH_MINIMUM_AMOUNT', 'PARTIAL_WITH_MINIMUM_PERCENTAGE'], default: 'PARTIAL_ALLOWED' },
    minimumAmount:    { type: Number, default: 0 },
    minimumPercentage: { type: Number, default: 0 },
    allowPartialPayment: { type: Boolean, default: true },
    graceDays:        { type: Number, default: 0 },
    invoicePrefix:    { type: String, default: '' },
    receiptPrefix:    { type: String, default: '' },
  },
  { timestamps: true },
);

InvoiceSchema.index({ tenantId: 1 });
InvoiceSchema.index({ tenantId: 1, feeOrderId: 1 });
InvoiceSchema.index({ tenantId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ tenantId: 1, studentId: 1, status: 1 });
InvoiceSchema.index({ tenantId: 1, academicYearId: 1, status: 1 });
InvoiceSchema.index({ tenantId: 1, classId: 1, academicYearId: 1 });
InvoiceSchema.index({ tenantId: 1, campusId: 1, dueDate: 1 });
InvoiceSchema.index({ tenantId: 1, feeScheduleId: 1 }, { sparse: true });
InvoiceSchema.index({ tenantId: 1, feeCategoryId: 1 }, { sparse: true });
InvoiceSchema.index({ tenantId: 1, feeStructureId: 1 }, { sparse: true });
InvoiceSchema.index({ tenantId: 1, studentId: 1, feeStructureId: 1, academicYearId: 1 }, { sparse: true });

export const Invoice = model<IInvoice>('Invoice', InvoiceSchema);
