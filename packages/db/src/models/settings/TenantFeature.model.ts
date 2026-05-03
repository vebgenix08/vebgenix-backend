/**
 * TenantFeature — feature flags / module entitlements per tenant.
 * One document per tenant. Checked before granting access to modules.
 */
import { Schema, model, Document } from 'mongoose';

export interface ITenantFeatureFlags {
  admissions:    boolean;
  finance:       boolean;
  academics:     boolean;
  examResults:   boolean;
  attendance:    boolean;
  timetable:     boolean;
  communication: boolean;
  events:        boolean;
  leave:         boolean;
  certificates:  boolean;
  studentPortal: boolean;
  analytics:     boolean;
}

export interface ITenantFeature extends Document {
  tenantId: string;
  features: ITenantFeatureFlags;
  updatedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const FeatureFlagsSchema = new Schema<ITenantFeatureFlags>({
  admissions:    { type: Boolean, default: true  },
  finance:       { type: Boolean, default: true  },
  academics:     { type: Boolean, default: true  },
  examResults:   { type: Boolean, default: true  },
  attendance:    { type: Boolean, default: true  },
  timetable:     { type: Boolean, default: false },
  communication: { type: Boolean, default: true  },
  events:        { type: Boolean, default: false },
  leave:         { type: Boolean, default: false },
  certificates:  { type: Boolean, default: false },
  studentPortal: { type: Boolean, default: false },
  analytics:     { type: Boolean, default: false },
}, { _id: false });

const TenantFeatureSchema = new Schema<ITenantFeature>({
  tenantId:  { type: String, required: true },
  features:  { type: FeatureFlagsSchema, default: () => ({}) },
  updatedBy: { type: String },
}, { timestamps: true });

TenantFeatureSchema.index({ tenantId: 1 }, { unique: true });

export const TenantFeature = model<ITenantFeature>('TenantFeature', TenantFeatureSchema);
