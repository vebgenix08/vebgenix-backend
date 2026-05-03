import { Schema, model, Document } from 'mongoose';

export interface ITenant extends Document {
  name: string;
  slug: string;
  logoUrl?: string;
  domain?: string;
  isActive: boolean;
  plan?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TenantSchema = new Schema<ITenant>(
  {
    name:    { type: String, required: true },
    slug:    { type: String, required: true },
    logoUrl: { type: String },
    domain:  { type: String },
    isActive:{ type: Boolean, default: true },
    plan:    { type: String },
  },
  { timestamps: true }
);

TenantSchema.index({ slug: 1 }, { unique: true });
TenantSchema.index({ domain: 1 }, { unique: true, sparse: true });

export const Tenant = model<ITenant>('Tenant', TenantSchema);
