import { Schema, model, Document, Types } from 'mongoose';

export type PromotionBatchStatus = 'DRAFT' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED';
export type SectionStrategy = 'SAME_SECTION' | 'MANUAL' | 'AUTO_SHUFFLE' | 'GENDER_BALANCE' | 'CAPACITY_LIMIT'
  | 'PERFORMANCE_RANK' | 'SUBJECT_GROUP' | 'TRANSPORT_ROUTE' | 'EXCEL_IMPORT';
export type FeeAction = 'SKIP' | 'ASSIGN_EXISTING' | 'COPY_PATTERN';

export interface IStudentPromotionBatch extends Document {
  tenantId: string;
  fromAcademicYearId: Types.ObjectId;
  toAcademicYearId: Types.ObjectId;
  campusId: Types.ObjectId;
  fromGradeId: Types.ObjectId;
  toGradeId: Types.ObjectId;
  sectionStrategy: SectionStrategy;
  feeAction: FeeAction;
  status: PromotionBatchStatus;
  totalStudents: number;
  promotedCount: number;
  detainedCount: number;
  skippedCount: number;
  failedCount: number;
  createdBy: Types.ObjectId;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const StudentPromotionBatchSchema = new Schema<IStudentPromotionBatch>(
  {
    tenantId:           { type: String, required: true },
    fromAcademicYearId: { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    toAcademicYearId:   { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    campusId:           { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    fromGradeId:        { type: Schema.Types.ObjectId, required: true, ref: 'Class' },
    toGradeId:          { type: Schema.Types.ObjectId, required: true, ref: 'Class' },
    sectionStrategy:    { type: String, enum: ['SAME_SECTION','MANUAL','AUTO_SHUFFLE','GENDER_BALANCE','CAPACITY_LIMIT','PERFORMANCE_RANK','SUBJECT_GROUP','TRANSPORT_ROUTE','EXCEL_IMPORT'], default: 'SAME_SECTION' },
    feeAction:          { type: String, enum: ['SKIP','ASSIGN_EXISTING','COPY_PATTERN'], default: 'SKIP' },
    status:             { type: String, enum: ['DRAFT','PROCESSING','COMPLETED','PARTIALLY_COMPLETED','FAILED'], default: 'DRAFT' },
    totalStudents:  { type: Number, default: 0 },
    promotedCount:  { type: Number, default: 0 },
    detainedCount:  { type: Number, default: 0 },
    skippedCount:   { type: Number, default: 0 },
    failedCount:    { type: Number, default: 0 },
    createdBy:      { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
    completedAt:    { type: Date },
  },
  { timestamps: true },
);

StudentPromotionBatchSchema.index({ tenantId: 1, fromAcademicYearId: 1, campusId: 1, fromGradeId: 1 });
StudentPromotionBatchSchema.index({ tenantId: 1, status: 1 });

export const StudentPromotionBatch = model<IStudentPromotionBatch>(
  'StudentPromotionBatch',
  StudentPromotionBatchSchema,
);
