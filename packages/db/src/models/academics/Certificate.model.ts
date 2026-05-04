import { Schema, model, Document } from 'mongoose';

export type CertificateType   = 'TRANSFER' | 'BONAFIDE' | 'CHARACTER' | 'CONDUCT' | 'MIGRATION' | 'CUSTOM';
export type CertificateStatus = 'PENDING' | 'APPROVED' | 'ISSUED' | 'REJECTED';

export interface ICertificate extends Document {
  tenantId:   string;
  studentId:  string;
  type:       CertificateType;
  purpose?:   string;
  status:     CertificateStatus;
  issuedAt?:  Date;
  issuedBy?:  string;   // profileId
  templateId?: string;
  fileKey?:   string;   // S3 key of generated PDF
  remarks?:   string;
  createdAt:  Date;
  updatedAt:  Date;
}

const CertificateSchema = new Schema<ICertificate>({
  tenantId:   { type: String, required: true },
  studentId:  { type: String, required: true },
  type:       { type: String, enum: ['TRANSFER','BONAFIDE','CHARACTER','CONDUCT','MIGRATION','CUSTOM'], required: true },
  purpose:    { type: String },
  status:     { type: String, enum: ['PENDING','APPROVED','ISSUED','REJECTED'], default: 'PENDING' },
  issuedAt:   { type: Date },
  issuedBy:   { type: String },
  templateId: { type: String },
  fileKey:    { type: String },
  remarks:    { type: String },
}, { timestamps: true });

CertificateSchema.index({ tenantId: 1 });
CertificateSchema.index({ tenantId: 1, createdAt: -1 });
CertificateSchema.index({ tenantId: 1, studentId: 1 });
CertificateSchema.index({ tenantId: 1, status: 1, createdAt: -1 });

export const Certificate = model<ICertificate>('Certificate', CertificateSchema);
