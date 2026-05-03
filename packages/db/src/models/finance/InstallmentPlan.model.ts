import { Schema, model, Document } from 'mongoose';

export interface IInstallmentPlan extends Document {
  tenantId:             string;
  name:                 string;
  numberOfInstallments: number;
  description?:         string;
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
  isActive:             { type: Boolean, default: true },
  createdBy:            { type: String },
}, { timestamps: true });

InstallmentPlanSchema.index({ tenantId: 1 });
InstallmentPlanSchema.index({ tenantId: 1, createdAt: -1 });
InstallmentPlanSchema.index({ tenantId: 1, name: 1 }, { unique: true });

export const InstallmentPlan = model<IInstallmentPlan>('InstallmentPlan', InstallmentPlanSchema);
