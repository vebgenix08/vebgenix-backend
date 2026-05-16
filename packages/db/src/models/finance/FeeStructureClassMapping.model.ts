import { Schema, model, Document, Types } from 'mongoose';

export type FeeStructureClassMappingStatus = 'ACTIVE' | 'INACTIVE';

export interface IFeeStructureClassMapping extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  feeScheduleId: Types.ObjectId;
  feeStructureId: Types.ObjectId;
  priority: number;
  effectiveFrom?: Date;
  effectiveTo?: Date;
  status: FeeStructureClassMappingStatus;
  createdBy: Types.ObjectId;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeeStructureClassMappingSchema = new Schema<IFeeStructureClassMapping>(
  {
    tenantId:      { type: String, required: true },
    campusId:      { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    academicYearId:{ type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    classId:       { type: Schema.Types.ObjectId, required: true, ref: 'Class' },
    feeScheduleId: { type: Schema.Types.ObjectId, required: true, ref: 'FeeSchedule' },
    feeStructureId:{ type: Schema.Types.ObjectId, required: true, ref: 'FeeStructure' },
    priority:      { type: Number, default: 0 },
    effectiveFrom: { type: Date },
    effectiveTo:   { type: Date },
    status:        { type: String, enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE', index: true },
    createdBy:     { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
    updatedBy:     { type: Schema.Types.ObjectId, ref: 'Profile' },
  },
  { timestamps: true },
);

FeeStructureClassMappingSchema.index({ tenantId: 1 });
FeeStructureClassMappingSchema.index({ tenantId: 1, createdAt: -1 });
FeeStructureClassMappingSchema.index({ tenantId: 1, campusId: 1, academicYearId: 1, classId: 1, status: 1 });
FeeStructureClassMappingSchema.index(
  { tenantId: 1, campusId: 1, academicYearId: 1, classId: 1, feeScheduleId: 1, feeStructureId: 1 },
  { unique: true },
);

export const FeeStructureClassMapping = model<IFeeStructureClassMapping>(
  'FeeStructureClassMapping',
  FeeStructureClassMappingSchema,
  'fee_structure_class_mappings',
);
export default FeeStructureClassMapping;
