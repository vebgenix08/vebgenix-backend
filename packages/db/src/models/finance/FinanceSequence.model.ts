import { Schema, model, Document } from 'mongoose';

export interface IFinanceSequence extends Document {
  tenantId: string;
  scope: string;
  key: string;
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

const FinanceSequenceSchema = new Schema<IFinanceSequence>(
  {
    tenantId: { type: String, required: true },
    scope:   { type: String, required: true },
    key:     { type: String, required: true },
    value:   { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

FinanceSequenceSchema.index({ tenantId: 1, scope: 1, key: 1 }, { unique: true });

export const FinanceSequence = model<IFinanceSequence>('FinanceSequence', FinanceSequenceSchema);
