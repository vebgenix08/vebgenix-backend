// import { Schema, model, Document, Types } from 'mongoose';

// export type FeeHeadType = 'RECURRING' | 'ONE_TIME' | 'OPTIONAL';

// export interface IFeeHead extends Document {
//   tenantId: string;
//   name: string;
//   prefix?: string;
//   type: FeeHeadType;
//   category?: string;
//   description?: string;
//   isActive: boolean;
//   createdBy: Types.ObjectId;
//   feeCategoryId?: Types.ObjectId;
//   code?: string;
//   isRefundable: boolean;
//   isMandatory: boolean;
//   allowConcession: boolean;
//   allowLateFee: boolean;
//   priorityOrder: number;
//   createdAt: Date;
//   updatedAt: Date;
// }

// const FeeHeadSchema = new Schema<IFeeHead>(
//   {
//     tenantId:        { type: String, required: true },
//     name:            { type: String, required: true },
//     prefix:          { type: String, uppercase: true, trim: true },
//     type:            { type: String, enum: ['RECURRING','ONE_TIME','OPTIONAL'], required: true },
//     category:        { type: String },
//     description:     { type: String },
//     isActive:        { type: Boolean, default: true },
//     createdBy:       { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
//     feeCategoryId:   { type: Schema.Types.ObjectId, ref: 'FeeCategory' },
//     code:            { type: String, uppercase: true, trim: true },
//     isRefundable:    { type: Boolean, default: false },
//     isMandatory:     { type: Boolean, default: true },
//     allowConcession: { type: Boolean, default: false },
//     allowLateFee:    { type: Boolean, default: false },
//     priorityOrder:   { type: Number, default: 0 },
//   },
//   { timestamps: true }
// );

// FeeHeadSchema.index({ tenantId: 1 });
// FeeHeadSchema.index({ tenantId: 1, createdAt: -1 });
// FeeHeadSchema.index({ tenantId: 1, name: 1 }, { unique: true });
// FeeHeadSchema.index({ tenantId: 1, prefix: 1 }, { unique: true, sparse: true });
// FeeHeadSchema.index({ tenantId: 1, isActive: 1 });
// FeeHeadSchema.index({ tenantId: 1, feeCategoryId: 1 });
// FeeHeadSchema.index({ tenantId: 1, feeCategoryId: 1, code: 1 }, { unique: true, sparse: true });

// export const FeeHead = model<IFeeHead>('FeeHead', FeeHeadSchema);


import { Schema, model, Document, Types } from 'mongoose';

export type FeeHeadType = 'RECURRING' | 'ONE_TIME' | 'OPTIONAL';

export interface IFeeHead extends Document {
  tenantId: string;
  name: string;
  prefix?: string;
  type: FeeHeadType;
  category?: string;
  description?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  feeCategoryId?: Types.ObjectId;
  code?: string;
  isRefundable: boolean;
  isMandatory: boolean;
  allowConcession: boolean;
  allowLateFee: boolean;
  priorityOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

const FeeHeadSchema = new Schema<IFeeHead>(
  {
    tenantId:        { type: String, required: true },
    name:            { type: String, required: true },
    prefix:          { type: String, uppercase: true, trim: true },
    type:            { type: String, enum: ['RECURRING', 'ONE_TIME', 'OPTIONAL'], required: true },
    category:        { type: String },
    description:     { type: String },
    isActive:        { type: Boolean, default: true },
    createdBy:       { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
    feeCategoryId:   { type: Schema.Types.ObjectId, ref: 'FeeCategory' },
    code:            { type: String, uppercase: true, trim: true },
    isRefundable:    { type: Boolean, default: false },
    isMandatory:     { type: Boolean, default: true },
    allowConcession: { type: Boolean, default: false },
    allowLateFee:    { type: Boolean, default: false },
    priorityOrder:   { type: Number, default: 0 },
  },
  { timestamps: true },
);

FeeHeadSchema.index({ tenantId: 1 });
FeeHeadSchema.index({ tenantId: 1, createdAt: -1 });
FeeHeadSchema.index({ tenantId: 1, name: 1 }, { unique: true });
FeeHeadSchema.index({ tenantId: 1, prefix: 1 }, { unique: true, sparse: true });
FeeHeadSchema.index({ tenantId: 1, isActive: 1 });
FeeHeadSchema.index({ tenantId: 1, feeCategoryId: 1 });
FeeHeadSchema.index({ tenantId: 1, feeCategoryId: 1, code: 1 }, { unique: true, sparse: true });

export const FeeHead = model<IFeeHead>('FeeHead', FeeHeadSchema, 'fee_heads');
export default FeeHead;
