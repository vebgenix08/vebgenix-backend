/**
 * Template — document/email/certificate templates per tenant.
 * E.g.: admission letter, fee receipt, ID card, marksheet.
 */
import { Schema, model, Document } from 'mongoose';

export type TemplateType = 'EMAIL' | 'DOCUMENT' | 'CERTIFICATE' | 'ID_CARD' | 'REPORT_CARD';
export type TemplateStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

interface ITemplateVersion {
  version:   number;
  content:   string;          // HTML / Handlebars template
  variables: string[];        // e.g. ['studentName', 'grade']
  publishedAt?: Date;
  publishedBy?: string;       // profileId
}

export interface ITemplate extends Document {
  tenantId:       string;
  name:           string;
  type:           TemplateType;
  status:         TemplateStatus;
  currentVersion: number;
  versions:       ITemplateVersion[];
  createdBy:      string;     // profileId
  createdAt:      Date;
  updatedAt:      Date;
}

const TemplateVersionSchema = new Schema<ITemplateVersion>({
  version:     { type: Number, required: true },
  content:     { type: String, required: true },
  variables:   [{ type: String }],
  publishedAt: { type: Date },
  publishedBy: { type: String },
}, { _id: false });

const TemplateSchema = new Schema<ITemplate>({
  tenantId:       { type: String, required: true },
  name:           { type: String, required: true },
  type:           { type: String, enum: ['EMAIL','DOCUMENT','CERTIFICATE','ID_CARD','REPORT_CARD'], required: true },
  status:         { type: String, enum: ['DRAFT','PUBLISHED','ARCHIVED'], default: 'DRAFT' },
  currentVersion: { type: Number, default: 0 },
  versions:       [TemplateVersionSchema],
  createdBy:      { type: String, required: true },
}, { timestamps: true });

TemplateSchema.index({ tenantId: 1 });
TemplateSchema.index({ tenantId: 1, createdAt: -1 });
TemplateSchema.index({ tenantId: 1, name: 1 }, { unique: true });   // unique name per tenant
TemplateSchema.index({ tenantId: 1, type: 1, status: 1 });

export const Template = model<ITemplate>('Template', TemplateSchema);
