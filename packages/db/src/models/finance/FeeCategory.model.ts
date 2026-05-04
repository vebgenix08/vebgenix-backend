import { Schema, model, Document, Types } from 'mongoose';

export type AllocationMethod = 'PRO_RATA' | 'PRIORITY_WISE' | 'MANUAL';
export type FeeCategoryFeeType = 'GENERAL' | 'EXAM' | 'ADMISSION' | 'MISC' | 'TRANSPORT' | 'HOSTEL' | 'OTHER';
export type FeeCategoryModuleType = 'FEE' | 'BILLING' | 'OTHER';

export interface IFeeCategory extends Document {
  tenantId: string;
  name: string;
  moduleType: FeeCategoryModuleType;
  feeType: FeeCategoryFeeType;
  invoicePrefix: string;
  receiptPrefix: string;
  defaultAllocationMethod: AllocationMethod;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeeCategorySchema = new Schema<IFeeCategory>(
  {
    tenantId:                { type: String, required: true },
    name:                    { type: String, required: true },
    moduleType:              { type: String, enum: ['FEE', 'BILLING', 'OTHER'], default: 'FEE' },
    feeType:                 { type: String, enum: ['GENERAL', 'EXAM', 'ADMISSION', 'MISC', 'TRANSPORT', 'HOSTEL', 'OTHER'], required: true },
    invoicePrefix:           { type: String, required: true, uppercase: true, trim: true },
    receiptPrefix:           { type: String, required: true, uppercase: true, trim: true },
    defaultAllocationMethod: { type: String, enum: ['PRO_RATA', 'PRIORITY_WISE', 'MANUAL'], default: 'PRO_RATA' },
    isActive:                { type: Boolean, default: true },
    createdBy:               { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
  },
  { timestamps: true },
);

FeeCategorySchema.index({ tenantId: 1 });
FeeCategorySchema.index({ tenantId: 1, name: 1 }, { unique: true });
FeeCategorySchema.index({ tenantId: 1, isActive: 1 });

export const FeeCategory = model<IFeeCategory>('FeeCategory', FeeCategorySchema);
