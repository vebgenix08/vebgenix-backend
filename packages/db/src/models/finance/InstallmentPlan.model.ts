import { Schema, model, Document } from 'mongoose';

export interface IInstallmentEntry {
  label:        string;
  percentage:   number;
  dueDateType:  string;
  fixedDate?:   string;
  monthsOffset?: number;
}

export interface IInstallmentPlan extends Document {
  tenantId:             string;
  name:                 string;
  numberOfInstallments: number;
  description?:         string;
  installments:         IInstallmentEntry[];
  isActive:             boolean;
  createdBy?:           string;
  createdAt:            Date;
  updatedAt:            Date;
}

const InstallmentPlanSchema = new Schema<IInstallmentPlan>({
  tenantId:             { type: String, required: true },
  name:                 { type: String, required: true },
  numberOfInstallments: { type: Number, required: true, min: 1 },
  description:          { type: String },
  installments: [{
    label:        { type: String, required: true },
    percentage:   { type: Number, required: true },
    dueDateType:  { type: String, required: true },
    fixedDate:    { type: String },
    monthsOffset: { type: Number },
  }],
  isActive:             { type: Boolean, default: true },
  createdBy:            { type: String },
}, { timestamps: true });

InstallmentPlanSchema.index({ tenantId: 1 });
InstallmentPlanSchema.index({ tenantId: 1, createdAt: -1 });
InstallmentPlanSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const InstallmentPlan = model<IInstallmentPlan>('InstallmentPlan', InstallmentPlanSchema);
