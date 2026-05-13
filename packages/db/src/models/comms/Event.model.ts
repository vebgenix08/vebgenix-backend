import { Schema, model, Document } from 'mongoose';

export interface IEvent extends Document {
  tenantId:    string;
  campusId?:   string;
  academicYearId?: string;
  title:       string;
  description?: string;
  startDate:   Date;
  endDate:     Date;
  venue?:      string;
  isPublic:    boolean;
  createdBy:   string;
  createdAt:   Date;
  updatedAt:   Date;
}

const EventSchema = new Schema<IEvent>({
  tenantId:    { type: String, required: true },
  campusId:    { type: String },
  academicYearId: { type: String },
  title:       { type: String, required: true },
  description: { type: String },
  startDate:   { type: Date, required: true },
  endDate:     { type: Date, required: true },
  venue:       { type: String },
  isPublic:    { type: Boolean, default: true },
  createdBy:   { type: String, required: true },
}, { timestamps: true });

EventSchema.index({ tenantId: 1 });
EventSchema.index({ tenantId: 1, createdAt: -1 });
EventSchema.index({ tenantId: 1, startDate: 1 });
EventSchema.index({ tenantId: 1, campusId: 1 });
EventSchema.index({ tenantId: 1, campusId: 1, academicYearId: 1 });

export const Event = model<IEvent>('Event', EventSchema);
