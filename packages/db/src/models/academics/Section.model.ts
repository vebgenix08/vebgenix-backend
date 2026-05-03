/**
 * Section — a class section (division) in an academic year.
 * e.g.: "10A", "10B", "MBA-Finance-A"
 */
import { Schema, model, Document } from 'mongoose';

export interface ISection extends Document {
  tenantId:       string;
  campusId:       string;
  classId:        string;
  academicYearId: string;
  name:           string;   // "A", "B", "Section-1"
  displayName:    string;   // "Grade 10 — A"
  capacity:       number;
  classTeacherId?: string;  // Employee profileId of class teacher/incharge
  isActive:       boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

const SectionSchema = new Schema<ISection>({
  tenantId:       { type: String, required: true },
  campusId:       { type: String, required: true },
  classId:        { type: String, required: true },
  academicYearId: { type: String, required: true },
  name:           { type: String, required: true },
  displayName:    { type: String, required: true },
  capacity:       { type: Number, default: 40 },
  classTeacherId: { type: String },
  isActive:       { type: Boolean, default: true },
}, { timestamps: true });

SectionSchema.index({ tenantId: 1 });
SectionSchema.index({ tenantId: 1, createdAt: -1 });
SectionSchema.index({ tenantId: 1, academicYearId: 1 });
SectionSchema.index({ tenantId: 1, classId: 1, academicYearId: 1 });
SectionSchema.index({ tenantId: 1, classId: 1, academicYearId: 1, name: 1 }, { unique: true });

export const Section = model<ISection>('Section', SectionSchema);
