import { Schema, model, Document, Types } from 'mongoose';

export interface IManualFeeCollectionParticular extends Document {
  tenantId: string;
  manualFeeCollectionId: Types.ObjectId;

  feeHeadId: Types.ObjectId;
  feeHeadName: string;

  priority: number;
  amount: number;
  paidAmount: number;
  balanceAmount: number;

  createdAt: Date;
}

const ManualFeeCollectionParticularSchema = new Schema<IManualFeeCollectionParticular>(
  {
    tenantId:               { type: String, required: true },
    manualFeeCollectionId:  { type: Schema.Types.ObjectId, required: true, ref: 'ManualFeeCollection' },

    feeHeadId:     { type: Schema.Types.ObjectId, required: true, ref: 'FeeHead' },
    feeHeadName:   { type: String, required: true },

    priority:      { type: Number, default: 0 },
    amount:        { type: Number, required: true },
    paidAmount:    { type: Number, required: true },
    balanceAmount: { type: Number, required: true },
  },
  { timestamps: false },
);

ManualFeeCollectionParticularSchema.index({ tenantId: 1 });
ManualFeeCollectionParticularSchema.index({ tenantId: 1, manualFeeCollectionId: 1 });

export const ManualFeeCollectionParticular = model<IManualFeeCollectionParticular>(
  'ManualFeeCollectionParticular',
  ManualFeeCollectionParticularSchema,
  'manual_fee_collection_particulars',
);
