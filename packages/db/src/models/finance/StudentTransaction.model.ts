import { Schema, model, Document, Types } from 'mongoose';

export type StudentTransactionType = 'PAYMENT' | 'REFUND' | 'LATE_FEE' | 'CONCESSION' | 'WAIVER';
export type StudentTransactionStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED';

export interface IStudentTransaction extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  studentId: Types.ObjectId;
  classId?: Types.ObjectId;
  sectionId?: Types.ObjectId;
  feeAssignmentId?: Types.ObjectId;
  feeOrderId?: Types.ObjectId;
  invoiceId?: Types.ObjectId;
  paymentId?: Types.ObjectId;
  transactionType: StudentTransactionType;
  status: StudentTransactionStatus;
  amount: number;
  balanceBefore: number;
  balanceAfter: number;
  referenceNumber?: string;
  remarks?: string;
  metadata: Record<string, unknown>;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudentTransactionSchema = new Schema<IStudentTransaction>(
  {
    tenantId:        { type: String, required: true },
    campusId:        { type: Schema.Types.ObjectId, required: true, ref: 'Campus', index: true },
    academicYearId:  { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear', index: true },
    studentId:       { type: Schema.Types.ObjectId, required: true, ref: 'Student', index: true },
    classId:         { type: Schema.Types.ObjectId, ref: 'Class' },
    sectionId:       { type: Schema.Types.ObjectId, ref: 'Section' },
    feeAssignmentId: { type: Schema.Types.ObjectId, ref: 'FeeAssignment' },
    feeOrderId:      { type: Schema.Types.ObjectId, ref: 'StudentFeeOrder' },
    invoiceId:       { type: Schema.Types.ObjectId, ref: 'Invoice' },
    paymentId:       { type: Schema.Types.ObjectId, ref: 'Payment' },
    transactionType: {
      type: String,
      enum: ['PAYMENT', 'REFUND', 'LATE_FEE', 'CONCESSION', 'WAIVER'],
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['PENDING', 'SUCCESS', 'FAILED', 'REVERSED'],
      default: 'SUCCESS',
      index: true,
    },
    amount:          { type: Number, required: true },
    balanceBefore:   { type: Number, required: true },
    balanceAfter:    { type: Number, required: true },
    referenceNumber: { type: String },
    remarks:         { type: String },
    metadata:        { type: Schema.Types.Mixed, default: {} },
    createdBy:       { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
    updatedBy:       { type: Schema.Types.ObjectId, ref: 'Profile' },
  },
  { timestamps: true },
);

StudentTransactionSchema.index({ tenantId: 1 });
StudentTransactionSchema.index({ tenantId: 1, createdAt: -1 });
StudentTransactionSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1, createdAt: -1 });
StudentTransactionSchema.index({ tenantId: 1, paymentId: 1 }, { sparse: true });
StudentTransactionSchema.index({ tenantId: 1, invoiceId: 1 }, { sparse: true });

export const StudentTransaction = model<IStudentTransaction>(
  'StudentTransaction',
  StudentTransactionSchema,
  'student_transactions',
);
export default StudentTransaction;
