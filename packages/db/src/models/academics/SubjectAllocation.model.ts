/**
 * SubjectAllocation — a subject assigned to a section with a teacher for an academic year.
 */
import { Schema, model, Document } from 'mongoose';

export interface ISubjectAllocation extends Document {
  tenantId:       string;
  sectionId:      string;
  subjectId:      string;
  subjectName:    string;
  teacherId:      string;   // Employee profileId
  teacherName:    string;
  periodsPerWeek: number;
  academicYearId: string;
  isActive:       boolean;
  createdAt:      Date;
  updatedAt:      Date;
}

const SubjectAllocationSchema = new Schema<ISubjectAllocation>({
  tenantId:       { type: String, required: true },
  sectionId:      { type: String, required: true },
  subjectId:      { type: String, required: true },
  subjectName:    { type: String, required: true },
  teacherId:      { type: String, required: true },
  teacherName:    { type: String, required: true },
  periodsPerWeek: { type: Number, default: 5 },
  academicYearId: { type: String, required: true },
  isActive:       { type: Boolean, default: true },
}, { timestamps: true });

SubjectAllocationSchema.index({ tenantId: 1 });
SubjectAllocationSchema.index({ tenantId: 1, createdAt: -1 });
SubjectAllocationSchema.index({ tenantId: 1, sectionId: 1, academicYearId: 1 });
SubjectAllocationSchema.index({ tenantId: 1, sectionId: 1, subjectId: 1, academicYearId: 1 }, { unique: true });
SubjectAllocationSchema.index({ tenantId: 1, teacherId: 1, academicYearId: 1 });

export const SubjectAllocation = model<ISubjectAllocation>('SubjectAllocation', SubjectAllocationSchema);
