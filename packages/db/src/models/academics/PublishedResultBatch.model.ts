import { Schema, model, Document } from 'mongoose';
import crypto from 'crypto';

export type ResultBatchStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface IPublishedResultBatch extends Document {
  tenantId:       string;
  campusId:       string;
  academicYearId: string;
  examId?:        string;
  title:          string;
  description?:   string;
  fileKey?:       string;   // S3 key of uploaded results file
  publicToken:    string;   // Random token for public URL (no auth required)
  status:         ResultBatchStatus;
  publishedAt?:   Date;
  publishedBy?:   string;
  createdBy:      string;
  createdAt:      Date;
  updatedAt:      Date;
}

const PublishedResultBatchSchema = new Schema<IPublishedResultBatch>({
  tenantId:       { type: String, required: true },
  campusId:       { type: String, required: true },
  academicYearId: { type: String, required: true },
  examId:         { type: String },
  title:          { type: String, required: true },
  description:    { type: String },
  fileKey:        { type: String },
  publicToken:    { type: String, default: () => crypto.randomBytes(24).toString('hex') },
  status:         { type: String, enum: ['DRAFT','PUBLISHED','ARCHIVED'], default: 'DRAFT' },
  publishedAt:    { type: Date },
  publishedBy:    { type: String },
  createdBy:      { type: String, required: true },
}, { timestamps: true });

PublishedResultBatchSchema.index({ tenantId: 1 });
PublishedResultBatchSchema.index({ tenantId: 1, createdAt: -1 });
PublishedResultBatchSchema.index({ tenantId: 1, academicYearId: 1, status: 1 });
PublishedResultBatchSchema.index({ publicToken: 1 }, { unique: true });  // public lookup

export const PublishedResultBatch = model<IPublishedResultBatch>('PublishedResultBatch', PublishedResultBatchSchema);
