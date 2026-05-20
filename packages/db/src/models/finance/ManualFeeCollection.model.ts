import { Schema, model, Document, Types } from 'mongoose';

export type ManualReceiptStatus = 'GENERATED' | 'CANCELLED' | 'LINKED';
export type ManualPaymentMode = 'CASH' | 'UPI' | 'BANK_TRANSFER' | 'CHEQUE' | 'CARD';

export interface IManualFeeCollection extends Document {
  tenantId: string;
  manualStudentFeeAccountId: Types.ObjectId;

  academicYearId: Types.ObjectId;
  feeScheduleId: Types.ObjectId;
  feeStructureId: Types.ObjectId;

  studentName: string;
  studentDob?: Date;
  admissionNo: string;
  registrationNo?: string;

  campusId: Types.ObjectId;
  gradeId: Types.ObjectId;
  sectionId?: Types.ObjectId;

  totalFeeAmount: number;
  paidAmount: number;
  balanceAmount: number;

  paymentMode: ManualPaymentMode;
  referenceNo?: string;
  paymentDate: Date;
  remarks?: string;

  receiptNo: string;
  receiptStatus: ManualReceiptStatus;

  linkedStudentId?: Types.ObjectId;
  linkedAt?: Date;

  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ManualFeeCollectionSchema = new Schema<IManualFeeCollection>(
  {
    tenantId:                    { type: String, required: true },
    manualStudentFeeAccountId:   { type: Schema.Types.ObjectId, required: true, ref: 'ManualStudentFeeAccount' },

    academicYearId:  { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    feeScheduleId:   { type: Schema.Types.ObjectId, ref: 'FeeSchedule' },
    feeStructureId:  { type: Schema.Types.ObjectId, required: true, ref: 'FeeStructure' },

    studentName:     { type: String, required: true },
    studentDob:      { type: Date },
    admissionNo:     { type: String, required: true },
    registrationNo:  { type: String },

    campusId:        { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    gradeId:         { type: Schema.Types.ObjectId, required: true, ref: 'Class' },
    sectionId:       { type: Schema.Types.ObjectId, ref: 'Section' },

    totalFeeAmount:  { type: Number, required: true },
    paidAmount:      { type: Number, required: true },
    balanceAmount:   { type: Number, required: true },

    paymentMode:     { type: String, enum: ['CASH', 'UPI', 'BANK_TRANSFER', 'CHEQUE', 'CARD'], required: true },
    referenceNo:     { type: String },
    paymentDate:     { type: Date, required: true },
    remarks:         { type: String },

    receiptNo:       { type: String, required: true },
    receiptStatus:   { type: String, enum: ['GENERATED', 'CANCELLED', 'LINKED'], default: 'GENERATED' },

    linkedStudentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    linkedAt:        { type: Date },

    createdBy:       { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
  },
  { timestamps: true },
);

ManualFeeCollectionSchema.index({ tenantId: 1 });
ManualFeeCollectionSchema.index({ tenantId: 1, createdAt: -1 });
ManualFeeCollectionSchema.index({ tenantId: 1, manualStudentFeeAccountId: 1 });
ManualFeeCollectionSchema.index({ tenantId: 1, academicYearId: 1, receiptStatus: 1 });
ManualFeeCollectionSchema.index({ tenantId: 1, admissionNo: 1 });
ManualFeeCollectionSchema.index({ tenantId: 1, linkedStudentId: 1 }, { sparse: true });
ManualFeeCollectionSchema.index({ tenantId: 1, receiptNo: 1 }, { unique: true });

export const ManualFeeCollection = model<IManualFeeCollection>(
  'ManualFeeCollection',
  ManualFeeCollectionSchema,
  'manual_fee_collections',
);
