import { Schema, model, Document, Types } from 'mongoose';

export type PromotionItemAction = 'PROMOTE' | 'DETAIN' | 'SKIP';
export type FeeAssignmentStatus = 'PENDING' | 'ASSIGNED' | 'SKIPPED' | 'FAILED';

export interface IStudentPromotionBatchItem extends Document {
  tenantId: string;
  promotionBatchId: Types.ObjectId;
  studentId: Types.ObjectId;
  fromEnrollmentId?: Types.ObjectId;
  toEnrollmentId?: Types.ObjectId;
  fromGradeId: Types.ObjectId;
  fromSectionId?: Types.ObjectId;
  toGradeId: Types.ObjectId;
  toSectionId?: Types.ObjectId;
  action: PromotionItemAction;
  feeAssignmentStatus: FeeAssignmentStatus;
  targetFeeStructureId?: Types.ObjectId;
  generatedInvoiceIds: Types.ObjectId[];
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const StudentPromotionBatchItemSchema = new Schema<IStudentPromotionBatchItem>(
  {
    tenantId:            { type: String, required: true },
    promotionBatchId:    { type: Schema.Types.ObjectId, required: true, ref: 'StudentPromotionBatch' },
    studentId:           { type: Schema.Types.ObjectId, required: true, ref: 'Student' },
    fromEnrollmentId:    { type: Schema.Types.ObjectId, ref: 'StudentAcademicEnrollment' },
    toEnrollmentId:      { type: Schema.Types.ObjectId, ref: 'StudentAcademicEnrollment' },
    fromGradeId:         { type: Schema.Types.ObjectId, required: true, ref: 'Class' },
    fromSectionId:       { type: Schema.Types.ObjectId, ref: 'Section' },
    toGradeId:           { type: Schema.Types.ObjectId, required: true, ref: 'Class' },
    toSectionId:         { type: Schema.Types.ObjectId, ref: 'Section' },
    action:              { type: String, enum: ['PROMOTE','DETAIN','SKIP'], required: true },
    feeAssignmentStatus: { type: String, enum: ['PENDING','ASSIGNED','SKIPPED','FAILED'], default: 'SKIPPED' },
    targetFeeStructureId: { type: Schema.Types.ObjectId, ref: 'FeeStructure' },
    generatedInvoiceIds: [{ type: Schema.Types.ObjectId, ref: 'Invoice' }],
    remarks:             { type: String },
  },
  { timestamps: true },
);

StudentPromotionBatchItemSchema.index({ tenantId: 1, promotionBatchId: 1 });
StudentPromotionBatchItemSchema.index({ tenantId: 1, studentId: 1 });
StudentPromotionBatchItemSchema.index({ tenantId: 1, feeAssignmentStatus: 1 });

export const StudentPromotionBatchItem = model<IStudentPromotionBatchItem>(
  'StudentPromotionBatchItem',
  StudentPromotionBatchItemSchema,
);
