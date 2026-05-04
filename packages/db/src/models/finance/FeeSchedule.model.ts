/**
 * FeeSchedule — a named payment schedule with due-date slots and collection rules.
 * e.g.: "Annual Plan", "Quarterly Plan (Term 1 + Term 2 + Term 3)"
 */
import { Schema, model, Document, Types } from 'mongoose';

export type CollectionType =
  | 'FULL_ONLY'
  | 'PARTIAL_ALLOWED'
  | 'PARTIAL_WITH_MINIMUM_AMOUNT'
  | 'PARTIAL_WITH_MINIMUM_PERCENTAGE';

export interface IFeeScheduleSlot {
  name:              string;    // "Term 1", "Q1 Installment"
  dueDate:           Date;
  percentOfTotal?:   number;    // 33.33 means 1/3 of net amount
  fixedAmount?:      number;    // or a fixed amount
}

export interface IFeeSchedule extends Document {
  tenantId:             string;
  name:                 string;
  academicYearId:       string;
  slots:                IFeeScheduleSlot[];
  isActive:             boolean;
  createdBy?:           string;
  // new fields
  feeCategoryId?:       Types.ObjectId;
  campusId?:            Types.ObjectId;
  allowPartialPayment:  boolean;
  collectionType:       CollectionType;
  minimumAmount:        number;
  minimumPercentage:    number;
  graceDays:            number;
  lateFeeEnabled:       boolean;
  notificationEnabled:  boolean;
  createdAt:            Date;
  updatedAt:            Date;
}

const SlotSchema = new Schema<IFeeScheduleSlot>({
  name:           { type: String, required: true },
  dueDate:        { type: Date,   required: true },
  percentOfTotal: { type: Number },
  fixedAmount:    { type: Number },
}, { _id: false });

const FeeScheduleSchema = new Schema<IFeeSchedule>({
  tenantId:            { type: String, required: true },
  name:                { type: String, required: true },
  academicYearId:      { type: String, required: true },
  slots:               [SlotSchema],
  isActive:            { type: Boolean, default: true },
  createdBy:           { type: String },
  feeCategoryId:       { type: Schema.Types.ObjectId, ref: 'FeeCategory' },
  campusId:            { type: Schema.Types.ObjectId, ref: 'Campus' },
  allowPartialPayment: { type: Boolean, default: true },
  collectionType:      {
    type: String,
    enum: ['FULL_ONLY', 'PARTIAL_ALLOWED', 'PARTIAL_WITH_MINIMUM_AMOUNT', 'PARTIAL_WITH_MINIMUM_PERCENTAGE'],
    default: 'PARTIAL_ALLOWED',
  },
  minimumAmount:       { type: Number, default: 0 },
  minimumPercentage:   { type: Number, default: 0 },
  graceDays:           { type: Number, default: 0 },
  lateFeeEnabled:      { type: Boolean, default: false },
  notificationEnabled: { type: Boolean, default: false },
}, { timestamps: true });

FeeScheduleSchema.index({ tenantId: 1 });
FeeScheduleSchema.index({ tenantId: 1, createdAt: -1 });
FeeScheduleSchema.index({ tenantId: 1, academicYearId: 1 });
FeeScheduleSchema.index({ tenantId: 1, name: 1, academicYearId: 1 }, { unique: true });
FeeScheduleSchema.index({ tenantId: 1, feeCategoryId: 1 }, { sparse: true });

export const FeeSchedule = model<IFeeSchedule>('FeeSchedule', FeeScheduleSchema);
