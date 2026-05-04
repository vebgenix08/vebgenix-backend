import { Schema, model, Document, Types } from 'mongoose';

export type EnquiryStatus = 'NEW' | 'CONTACTED' | 'CONVERTED' | 'CLOSED';

export interface IEnquiry extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  academicYearId?: Types.ObjectId;
  studentName: string;
  email?: string;
  phone: string;
  programId?: Types.ObjectId;
  programName?: string;
  status: EnquiryStatus;
  source?: string;
  notes?: string;
  assignedTo?: Types.ObjectId;
  followUpDate?: Date;
  createdBy?: Types.ObjectId;  // optional — not present on public form submissions
  createdAt: Date;
  updatedAt: Date;
}

const EnquirySchema = new Schema<IEnquiry>(
  {
    tenantId:      { type: String, required: true },
    campusId:      { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    academicYearId:{ type: Schema.Types.ObjectId, ref: 'AcademicYear' },
    studentName:   { type: String, required: true },
    email:         { type: String },
    phone:         { type: String, required: true },
    programId:     { type: Schema.Types.ObjectId },
    programName:   { type: String },
    status:        { type: String, enum: ['NEW','CONTACTED','CONVERTED','CLOSED'], default: 'NEW' },
    source:        { type: String },
    notes:         { type: String },
    assignedTo:    { type: Schema.Types.ObjectId, ref: 'Profile' },
    followUpDate:  { type: Date },
    createdBy:     { type: Schema.Types.ObjectId, ref: 'Profile' },   // absent on public form submissions
  },
  { timestamps: true }
);

EnquirySchema.index({ tenantId: 1 });
EnquirySchema.index({ tenantId: 1, createdAt: -1 });
EnquirySchema.index({ tenantId: 1, status: 1 });
EnquirySchema.index({ tenantId: 1, phone: 1 });
EnquirySchema.index({ tenantId: 1, email: 1 });
EnquirySchema.index({ tenantId: 1, campusId: 1, status: 1 });

export const Enquiry = model<IEnquiry>('Enquiry', EnquirySchema);
