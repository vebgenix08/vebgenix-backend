/**
 * FeeSchedule — a named payment schedule with due-date slots.
 * e.g.: "Annual Plan", "Quarterly Plan (Term 1 + Term 2 + Term 3)"
 */
import { Schema, model, Document } from 'mongoose';

export interface IFeeScheduleSlot {
  name:              string;    // "Term 1", "Q1 Installment"
  dueDate:           Date;
  percentOfTotal?:   number;    // 33.33 means 1/3 of net amount
  fixedAmount?:      number;    // or a fixed amount
}

export interface IFeeSchedule extends Document {
  tenantId:       string;
  name:           string;
  academicYearId: string;
  slots:          IFeeScheduleSlot[];
  isActive:       boolean;
  createdBy?:     string;
  createdAt:      Date;
  updatedAt:      Date;
}

const SlotSchema = new Schema<IFeeScheduleSlot>({
  name:           { type: String, required: true },
  dueDate:        { type: Date,   required: true },
  percentOfTotal: { type: Number },
  fixedAmount:    { type: Number },
}, { _id: false });

const FeeScheduleSchema = new Schema<IFeeSchedule>({
  tenantId:       { type: String, required: true },
  name:           { type: String, required: true },
  academicYearId: { type: String, required: true },
  slots:          [SlotSchema],
  isActive:       { type: Boolean, default: true },
  createdBy:      { type: String },
}, { timestamps: true });

FeeScheduleSchema.index({ tenantId: 1 });
FeeScheduleSchema.index({ tenantId: 1, createdAt: -1 });
FeeScheduleSchema.index({ tenantId: 1, academicYearId: 1 });
FeeScheduleSchema.index({ tenantId: 1, name: 1, academicYearId: 1 }, { unique: true });

export const FeeSchedule = model<IFeeSchedule>('FeeSchedule', FeeScheduleSchema);
