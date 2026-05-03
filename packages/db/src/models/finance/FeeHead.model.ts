import { Schema, model, Document, Types } from 'mongoose';

export type FeeHeadType = 'RECURRING' | 'ONE_TIME' | 'OPTIONAL';

export interface IFeeHead extends Document {
  tenantId: string;
  name: string;
  type: FeeHeadType;
  description?: string;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const FeeHeadSchema = new Schema<IFeeHead>(
  {
    tenantId:    { type: String, required: true },
    name:        { type: String, required: true },
    type:        { type: String, enum: ['RECURRING','ONE_TIME','OPTIONAL'], required: true },
    description: { type: String },
    isActive:    { type: Boolean, default: true },
    createdBy:   { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
  },
  { timestamps: true }
);

FeeHeadSchema.index({ tenantId: 1 });
FeeHeadSchema.index({ tenantId: 1, createdAt: -1 });
FeeHeadSchema.index({ tenantId: 1, name: 1 }, { unique: true });
FeeHeadSchema.index({ tenantId: 1, isActive: 1 });

export const FeeHead = model<IFeeHead>('FeeHead', FeeHeadSchema);
