import { Schema, model, Document, Types } from 'mongoose';

export type PaymentMethod = 'CASH' | 'CHEQUE' | 'BANK_TRANSFER' | 'UPI' | 'CARD' | 'ONLINE';
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED';

export interface IPayment extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  studentId: Types.ObjectId;
  invoiceId: Types.ObjectId;
  receiptNumber?: string;
  amount: number;
  method: PaymentMethod;
  status: PaymentStatus;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  referenceNumber?: string;
  remarks?: string;
  paidAt?: Date;
  collectedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    tenantId:           { type: String, required: true },
    campusId:           { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    studentId:          { type: Schema.Types.ObjectId, required: true, ref: 'Student' },
    invoiceId:          { type: Schema.Types.ObjectId, required: true, ref: 'Invoice' },
    receiptNumber:      { type: String },
    amount:             { type: Number, required: true },
    method:             { type: String, enum: ['CASH','CHEQUE','BANK_TRANSFER','UPI','CARD','ONLINE'], required: true },
    status:             { type: String, enum: ['PENDING','SUCCESS','FAILED','REFUNDED'], default: 'PENDING' },
    razorpayOrderId:    { type: String },
    razorpayPaymentId:  { type: String },
    razorpaySignature:  { type: String },
    referenceNumber:    { type: String },
    remarks:            { type: String },
    paidAt:             { type: Date },
    collectedBy:        { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
  },
  { timestamps: true }
);

PaymentSchema.index({ tenantId: 1 });
PaymentSchema.index({ tenantId: 1, createdAt: -1 });
PaymentSchema.index({ tenantId: 1, invoiceId: 1 });
PaymentSchema.index({ tenantId: 1, studentId: 1, status: 1 });
PaymentSchema.index({ tenantId: 1, receiptNumber: 1 }, { unique: true, sparse: true });
PaymentSchema.index({ razorpayOrderId: 1 }, { sparse: true });
PaymentSchema.index({ razorpayPaymentId: 1 }, { sparse: true });

export const Payment = model<IPayment>('Payment', PaymentSchema);
