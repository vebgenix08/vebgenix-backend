import { Schema, model, Document, Types } from 'mongoose';

export interface IPaymentAllocation extends Document {
  tenantId: string;
  paymentId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  invoiceItemId: Types.ObjectId;
  feeHeadId: Types.ObjectId;
  feeHeadName: string;
  allocatedAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentAllocationSchema = new Schema<IPaymentAllocation>(
  {
    tenantId:       { type: String, required: true },
    paymentId:      { type: Schema.Types.ObjectId, required: true, ref: 'Payment' },
    invoiceId:      { type: Schema.Types.ObjectId, required: true, ref: 'Invoice' },
    invoiceItemId:  { type: Schema.Types.ObjectId, required: true },
    feeHeadId:      { type: Schema.Types.ObjectId, required: true, ref: 'FeeHead' },
    feeHeadName:    { type: String, required: true },
    allocatedAmount:{ type: Number, required: true },
  },
  { timestamps: true },
);

PaymentAllocationSchema.index({ tenantId: 1, paymentId: 1 });
PaymentAllocationSchema.index({ tenantId: 1, invoiceId: 1 });

export const PaymentAllocation = model<IPaymentAllocation>('PaymentAllocation', PaymentAllocationSchema);
