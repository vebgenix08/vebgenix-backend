// import { Schema, model, Document, Types } from 'mongoose';

// export type AllocationMethod = 'PRO_RATA' | 'PRIORITY_WISE' | 'MANUAL';

// export interface IFeeComponent {
//   feeHeadId: Types.ObjectId;
//   feeHeadName: string;
//   amount: number;
//   isOptional: boolean;
//   priorityOrder: number;
// }

// export interface IFeeStructure extends Document {
//   tenantId: string;
//   campusId: Types.ObjectId;
//   academicYearId: Types.ObjectId;
//   programId?: Types.ObjectId;
//   classId?: Types.ObjectId;
//   classFrom?: number;
//   classTo?: number;
//   name: string;
//   components: IFeeComponent[];
//   totalAmount: number;
//   isActive: boolean;
//   createdBy: Types.ObjectId;
//   feeCategoryId?: Types.ObjectId;
//   feeScheduleId?: Types.ObjectId;
//   allocationMethod: AllocationMethod;
//   studentCategoryId?: Types.ObjectId;
//   createdAt: Date;
//   updatedAt: Date;
// }

// const FeeStructureSchema = new Schema<IFeeStructure>(
//   {
//     tenantId:         { type: String, required: true },
//     campusId:         { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
//     academicYearId:   { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
//     programId:        { type: Schema.Types.ObjectId },
//     classId:          { type: Schema.Types.ObjectId },
//     classFrom:        { type: Number },
//     classTo:          { type: Number },
//     name:             { type: String, required: true },
//     components: [{
//       feeHeadId:     { type: Schema.Types.ObjectId, required: true, ref: 'FeeHead' },
//       feeHeadName:   { type: String, required: true },
//       amount:        { type: Number, required: true },
//       isOptional:    { type: Boolean, default: false },
//       priorityOrder: { type: Number, default: 0 },
//     }],
//     totalAmount:      { type: Number, required: true },
//     isActive:         { type: Boolean, default: true },
//     createdBy:        { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
//     feeCategoryId:    { type: Schema.Types.ObjectId, ref: 'FeeCategory' },
//     feeScheduleId:    { type: Schema.Types.ObjectId, ref: 'FeeSchedule' },
//     allocationMethod: { type: String, enum: ['PRO_RATA', 'PRIORITY_WISE', 'MANUAL'], default: 'PRO_RATA' },
//     studentCategoryId:{ type: Schema.Types.ObjectId },
//   },
//   { timestamps: true }
// );

// FeeStructureSchema.index({ tenantId: 1 });
// FeeStructureSchema.index({ tenantId: 1, createdAt: -1 });
// FeeStructureSchema.index({ tenantId: 1, academicYearId: 1, campusId: 1 });
// FeeStructureSchema.index({ tenantId: 1, academicYearId: 1, programId: 1 });
// FeeStructureSchema.index({ tenantId: 1, isActive: 1 });
// FeeStructureSchema.index({ tenantId: 1, feeCategoryId: 1 }, { sparse: true });
// FeeStructureSchema.index({ tenantId: 1, feeScheduleId: 1 }, { sparse: true });

// export const FeeStructure = model<IFeeStructure>('FeeStructure', FeeStructureSchema);

import { Schema, model, Document, Types } from 'mongoose';

export type AllocationMethod = 'PRO_RATA' | 'PRIORITY_WISE' | 'MANUAL';

export interface IFeeComponent {
  feeHeadId: Types.ObjectId;
  feeHeadName: string;
  amount: number;
  isOptional: boolean;
  priorityOrder: number;
}

export interface IFeeStructure extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  programId?: Types.ObjectId;
  classId?: Types.ObjectId;
  classFrom?: number;
  classTo?: number;
  name: string;
  components: IFeeComponent[];
  totalAmount: number;
  isActive: boolean;
  createdBy: Types.ObjectId;
  feeCategoryId?: Types.ObjectId;
  feeScheduleId?: Types.ObjectId;
  allocationMethod: AllocationMethod;
  studentCategoryId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeeStructureSchema = new Schema<IFeeStructure>(
  {
    tenantId:         { type: String, required: true },
    campusId:         { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    academicYearId:   { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    programId:        { type: Schema.Types.ObjectId },
    classId:          { type: Schema.Types.ObjectId },
    classFrom:        { type: Number },
    classTo:          { type: Number },
    name:             { type: String, required: true },
    components: [{
      feeHeadId:     { type: Schema.Types.ObjectId, required: true, ref: 'FeeHead' },
      feeHeadName:   { type: String, required: true },
      amount:        { type: Number, required: true },
      isOptional:    { type: Boolean, default: false },
      priorityOrder: { type: Number, default: 0 },
    }],
    totalAmount:      { type: Number, required: true },
    isActive:         { type: Boolean, default: true },
    createdBy:        { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
    feeCategoryId:    { type: Schema.Types.ObjectId },
    feeScheduleId:    { type: Schema.Types.ObjectId, ref: 'FeeSchedule' },
    allocationMethod: { type: String, enum: ['PRO_RATA', 'PRIORITY_WISE', 'MANUAL'], default: 'PRO_RATA' },
    studentCategoryId:{ type: Schema.Types.ObjectId },
  },
  { timestamps: true },
);

FeeStructureSchema.index({ tenantId: 1 });
FeeStructureSchema.index({ tenantId: 1, createdAt: -1 });
FeeStructureSchema.index({ tenantId: 1, academicYearId: 1, campusId: 1 });
FeeStructureSchema.index({ tenantId: 1, academicYearId: 1, programId: 1 });
FeeStructureSchema.index({ tenantId: 1, isActive: 1 });
FeeStructureSchema.index({ tenantId: 1, feeCategoryId: 1 }, { sparse: true });
FeeStructureSchema.index({ tenantId: 1, feeScheduleId: 1 }, { sparse: true });

export const FeeStructure = model<IFeeStructure>('FeeStructure', FeeStructureSchema, 'fee_structures');
export default FeeStructure;
