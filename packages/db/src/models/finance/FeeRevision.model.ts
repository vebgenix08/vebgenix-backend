import { Schema, model, Document } from 'mongoose';

export interface IFeeRevision extends Document {
  tenantId: string;
  studentId: string;
  invoiceId: string;
  feeAssignmentId?: string;
  revisedBy: string;
  previousAmount: number;
  newAmount: number;
  difference: number;
  reason: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeeRevisionSchema = new Schema<IFeeRevision>(
  {
    tenantId:        { type: String, required: true },
    studentId:       { type: String, required: true },
    invoiceId:       { type: String, required: true },
    feeAssignmentId: { type: String },
    revisedBy:       { type: String, required: true },
    previousAmount:  { type: Number, required: true },
    newAmount:       { type: Number, required: true },
    difference:      { type: Number, required: true },
    reason:          { type: String, required: true },
  },
  { timestamps: true },
);

FeeRevisionSchema.index({ tenantId: 1 });
FeeRevisionSchema.index({ tenantId: 1, createdAt: -1 });
FeeRevisionSchema.index({ tenantId: 1, studentId: 1 });
FeeRevisionSchema.index({ tenantId: 1, invoiceId: 1 });

export const FeeRevision = model<IFeeRevision>('FeeRevision', FeeRevisionSchema);
