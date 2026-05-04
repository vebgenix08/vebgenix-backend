import { Schema, model, Document, Types } from 'mongoose';

export type RollNoBatchStatus = 'PENDING' | 'GENERATED' | 'FROZEN';
export type RollNoGenerationMode = 'ALPHABETICAL' | 'SEQUENTIAL';

export interface IAcademicRollNoBatch extends Document {
  tenantId: string;
  academicYearId: Types.ObjectId;
  campusId: Types.ObjectId;
  gradeId: Types.ObjectId;
  sectionId: Types.ObjectId;
  generationMode: RollNoGenerationMode;
  status: RollNoBatchStatus;
  lastRollNo: number;
  generatedAt?: Date;
  frozenAt?: Date;
  generatedBy?: Types.ObjectId;
  frozenBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AcademicRollNoBatchSchema = new Schema<IAcademicRollNoBatch>(
  {
    tenantId:       { type: String, required: true },
    academicYearId: { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    campusId:       { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    gradeId:        { type: Schema.Types.ObjectId, required: true, ref: 'Class' },
    sectionId:      { type: Schema.Types.ObjectId, required: true, ref: 'Section' },
    generationMode: { type: String, enum: ['ALPHABETICAL','SEQUENTIAL'], default: 'ALPHABETICAL' },
    status:         { type: String, enum: ['PENDING','GENERATED','FROZEN'], default: 'PENDING' },
    lastRollNo:     { type: Number, default: 0 },
    generatedAt:    { type: Date },
    frozenAt:       { type: Date },
    generatedBy:    { type: Schema.Types.ObjectId, ref: 'Profile' },
    frozenBy:       { type: Schema.Types.ObjectId, ref: 'Profile' },
  },
  { timestamps: true },
);

AcademicRollNoBatchSchema.index(
  { tenantId: 1, academicYearId: 1, campusId: 1, gradeId: 1, sectionId: 1 },
  { unique: true },
);

export const AcademicRollNoBatch = model<IAcademicRollNoBatch>(
  'AcademicRollNoBatch',
  AcademicRollNoBatchSchema,
);
