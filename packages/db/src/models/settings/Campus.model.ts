import { Schema, model, Document } from 'mongoose';

export type CampusType = 'SCHOOL' | 'PU' | 'DEGREE' | 'POLYTECHNIC' | 'OTHER';

export interface ICampus extends Document {
  tenantId: string;
  name: string;
  code: string;
  type: CampusType;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  phone?: string;
  email?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CampusSchema = new Schema<ICampus>(
  {
    tenantId: { type: String, required: true },
    name:     { type: String, required: true },
    code:     { type: String, required: true },
    type:     { type: String, enum: ['SCHOOL','PU','DEGREE','POLYTECHNIC','OTHER'], required: true },
    address:  { type: String },
    city:     { type: String },
    state:    { type: String },
    country:  { type: String },
    phone:    { type: String },
    email:    { type: String },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CampusSchema.index({ tenantId: 1 });
CampusSchema.index({ tenantId: 1, createdAt: -1 });
CampusSchema.index({ tenantId: 1, code: 1 }, { unique: true });
CampusSchema.index({ tenantId: 1, isActive: 1 });

export const Campus = model<ICampus>('Campus', CampusSchema);
