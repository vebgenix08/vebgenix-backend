import { Schema, model, Document, Types } from 'mongoose';

export type BatchStatus = 'PENDING' | 'GENERATED' | 'FROZEN';

export interface IAcademicRegistrationBatch extends Document {
  tenantId: string;
  academicYearId: Types.ObjectId;
  campusId: Types.ObjectId;
  gradeId: Types.ObjectId;
  generationMode: 'ALPHABETICAL';
  status: BatchStatus;
  lastRegistrationNo: number;   // last sequence number assigned in this batch
  generatedAt?: Date;
  frozenAt?: Date;
  generatedBy?: Types.ObjectId;
  frozenBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AcademicRegistrationBatchSchema = new Schema<IAcademicRegistrationBatch>(
  {
    tenantId:           { type: String, required: true },
    academicYearId:     { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    campusId:           { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    gradeId:            { type: Schema.Types.ObjectId, required: true, ref: 'Class' },
    generationMode:     { type: String, enum: ['ALPHABETICAL'], default: 'ALPHABETICAL' },
    status:             { type: String, enum: ['PENDING','GENERATED','FROZEN'], default: 'PENDING' },
    lastRegistrationNo: { type: Number, default: 0 },
    generatedAt:        { type: Date },
    frozenAt:           { type: Date },
    generatedBy:        { type: Schema.Types.ObjectId, ref: 'Profile' },
    frozenBy:           { type: Schema.Types.ObjectId, ref: 'Profile' },
  },
  { timestamps: true },
);

AcademicRegistrationBatchSchema.index(
  { tenantId: 1, academicYearId: 1, campusId: 1, gradeId: 1 },
  { unique: true },
);

export const AcademicRegistrationBatch = model<IAcademicRegistrationBatch>(
  'AcademicRegistrationBatch',
  AcademicRegistrationBatchSchema,
);
