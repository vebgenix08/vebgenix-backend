import { Schema, model, Document } from 'mongoose';

export type AnnouncementStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type AnnouncementTargetGroup = 'ALL' | 'STAFF' | 'TEACHERS' | 'STUDENTS' | 'PARENTS';

export interface IAnnouncement extends Document {
  tenantId:     string;
  campusId?:    string;
  academicYearId?: string;
  title:        string;
  content:      string;
  targetGroups: AnnouncementTargetGroup[];
  status:       AnnouncementStatus;
  publishedAt?: Date;
  createdBy:    string;   // profileId
  createdAt:    Date;
  updatedAt:    Date;
}

const AnnouncementSchema = new Schema<IAnnouncement>({
  tenantId:     { type: String, required: true },
  campusId:     { type: String },
  academicYearId:{ type: String },
  title:        { type: String, required: true },
  content:      { type: String, required: true },
  targetGroups: [{ type: String, enum: ['ALL','STAFF','TEACHERS','STUDENTS','PARENTS'] }],
  status:       { type: String, enum: ['DRAFT','PUBLISHED','ARCHIVED'], default: 'DRAFT' },
  publishedAt:  { type: Date },
  createdBy:    { type: String, required: true },
}, { timestamps: true });

AnnouncementSchema.index({ tenantId: 1 });
AnnouncementSchema.index({ tenantId: 1, createdAt: -1 });
AnnouncementSchema.index({ tenantId: 1, status: 1, createdAt: -1 });
AnnouncementSchema.index({ tenantId: 1, campusId: 1 });
AnnouncementSchema.index({ tenantId: 1, campusId: 1, academicYearId: 1 });

export const Announcement = model<IAnnouncement>('Announcement', AnnouncementSchema);
