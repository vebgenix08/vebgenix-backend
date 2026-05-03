import { Schema, model, Document, Types } from 'mongoose';

export interface IFeeComponent {
  feeHeadId: Types.ObjectId;
  feeHeadName: string;
  amount: number;
  isOptional: boolean;
}

export interface IFeeStructure extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  programId?: Types.ObjectId;
  classId?: Types.ObjectId;
  name: string;
  components: IFeeComponent[];
  totalAmount: number;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeeStructureSchema = new Schema<IFeeStructure>(
  {
    tenantId:      { type: String, required: true },
    campusId:      { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    academicYearId:{ type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    programId:     { type: Schema.Types.ObjectId },
    classId:       { type: Schema.Types.ObjectId },
    name:          { type: String, required: true },
    components: [{
      feeHeadId:   { type: Schema.Types.ObjectId, required: true, ref: 'FeeHead' },
      feeHeadName: { type: String, required: true },
      amount:      { type: Number, required: true },
      isOptional:  { type: Boolean, default: false },
    }],
    totalAmount: { type: Number, required: true },
    isActive:    { type: Boolean, default: true },
    createdBy:   { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
  },
  { timestamps: true }
);

FeeStructureSchema.index({ tenantId: 1 });
FeeStructureSchema.index({ tenantId: 1, createdAt: -1 });
FeeStructureSchema.index({ tenantId: 1, academicYearId: 1, campusId: 1 });
FeeStructureSchema.index({ tenantId: 1, academicYearId: 1, programId: 1 });
FeeStructureSchema.index({ tenantId: 1, isActive: 1 });

export const FeeStructure = model<IFeeStructure>('FeeStructure', FeeStructureSchema);
