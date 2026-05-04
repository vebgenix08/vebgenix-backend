import { Schema, model, Document, Types } from 'mongoose';

export type ApplicationStatus =
  | 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'ENROLLED' | 'WITHDRAWN';

export interface IApplicationDocument {
  type: string;
  url: string;
  key: string;
  uploadedAt: Date;
}

export interface IApplicationReview {
  reviewedBy: Types.ObjectId;
  reviewedAt: Date;
  decision: 'APPROVED' | 'REJECTED';
  remarks?: string;
}

export interface IApplication extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  enquiryId?: Types.ObjectId;
  academicYearId: Types.ObjectId;
  programId?: Types.ObjectId;
  applicationNumber: string;
  status: ApplicationStatus;
  studentName: string;
  dateOfBirth?: Date;
  gender?: string;
  email?: string;
  phone: string;
  address?: string;
  guardianName?: string;
  guardianPhone?: string;
  guardianRelation?: string;
  documents: IApplicationDocument[];
  reviews: IApplicationReview[];
  stageHistory: { stage: string; at: Date }[];
  customFields?: Record<string, unknown>;
  submittedAt?:     Date;
  approvedAt?:      Date;
  approvedBy?:      Types.ObjectId;
  rejectedAt?:      Date;
  rejectedBy?:      Types.ObjectId;
  rejectionReason?: string;
  createdBy:        Types.ObjectId;
  createdAt:        Date;
  updatedAt:        Date;
}

const ApplicationSchema = new Schema<IApplication>(
  {
    tenantId:         { type: String, required: true },
    campusId:         { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    enquiryId:        { type: Schema.Types.ObjectId, ref: 'Enquiry' },
    academicYearId:   { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    programId:        { type: Schema.Types.ObjectId },
    applicationNumber:{ type: String, required: true },
    status:           { type: String, enum: ['DRAFT','SUBMITTED','UNDER_REVIEW','APPROVED','REJECTED','ENROLLED','WITHDRAWN'], default: 'DRAFT' },
    studentName:      { type: String, required: true },
    dateOfBirth:      { type: Date },
    gender:           { type: String },
    email:            { type: String },
    phone:            { type: String, required: true },
    address:          { type: String },
    guardianName:     { type: String },
    guardianPhone:    { type: String },
    guardianRelation: { type: String },
    documents: [{
      type:       String,
      url:        String,
      key:        String,
      uploadedAt: { type: Date, default: Date.now },
    }],
    reviews: [{
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'Profile' },
      reviewedAt: Date,
      decision:   { type: String, enum: ['APPROVED','REJECTED'] },
      remarks:    String,
    }],
    stageHistory:  [{ stage: String, at: Date }],
    customFields:  { type: Schema.Types.Mixed },
    submittedAt:     { type: Date },
    approvedAt:      { type: Date },
    approvedBy:      { type: Schema.Types.ObjectId, ref: 'Profile' },
    rejectedAt:      { type: Date },
    rejectedBy:      { type: Schema.Types.ObjectId, ref: 'Profile' },
    rejectionReason: { type: String },
    createdBy:       { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
  },
  { timestamps: true }
);

ApplicationSchema.index({ tenantId: 1 });
ApplicationSchema.index({ tenantId: 1, applicationNumber: 1 }, { unique: true });
ApplicationSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
ApplicationSchema.index({ tenantId: 1, enquiryId: 1 });
ApplicationSchema.index({ tenantId: 1, campusId: 1, status: 1 });
ApplicationSchema.index({ tenantId: 1, phone: 1 });
ApplicationSchema.index({ tenantId: 1, email: 1 });

export const Application = model<IApplication>('Application', ApplicationSchema);
