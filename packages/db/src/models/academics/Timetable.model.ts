/**
 * Timetable — weekly period schedule for a section/class.
 * One document per (tenantId, campusId, academicYearId, classId).
 * Replacing the timetable = overwrite the slots array (replaceSectionTimetable).
 */
import { Schema, model, Document } from 'mongoose';

export type DayOfWeek = 'MON' | 'TUE' | 'WED' | 'THU' | 'FRI' | 'SAT' | 'SUN';

export interface ITimetableSlot {
  day:        DayOfWeek;
  period:     number;      // 1-based period index
  subjectId:  string;
  subjectName:string;
  teacherId:  string;      // Employee profileId
  teacherName:string;
  roomId?:    string;
  startTime:  string;      // "09:00"
  endTime:    string;      // "09:45"
}

export interface ITimetable extends Document {
  tenantId:       string;
  campusId:       string;
  academicYearId: string;
  classId:        string;  // section / class identifier
  className:      string;
  slots:          ITimetableSlot[];
  updatedBy:      string;  // profileId
  createdAt:      Date;
  updatedAt:      Date;
}

const SlotSchema = new Schema<ITimetableSlot>({
  day:         { type: String, enum: ['MON','TUE','WED','THU','FRI','SAT','SUN'], required: true },
  period:      { type: Number, required: true },
  subjectId:   { type: String, required: true },
  subjectName: { type: String, required: true },
  teacherId:   { type: String, required: true },
  teacherName: { type: String, required: true },
  roomId:      { type: String },
  startTime:   { type: String, required: true },
  endTime:     { type: String, required: true },
}, { _id: false });

const TimetableSchema = new Schema<ITimetable>({
  tenantId:       { type: String, required: true },
  campusId:       { type: String, required: true },
  academicYearId: { type: String, required: true },
  classId:        { type: String, required: true },
  className:      { type: String, required: true },
  slots:          [SlotSchema],
  updatedBy:      { type: String, required: true },
}, { timestamps: true });

TimetableSchema.index({ tenantId: 1 });
TimetableSchema.index({ tenantId: 1, createdAt: -1 });
// One timetable per class per academic year
TimetableSchema.index({ tenantId: 1, academicYearId: 1, classId: 1 }, { unique: true });
// Teacher workload: find all classes a teacher is assigned to
TimetableSchema.index({ tenantId: 1, 'slots.teacherId': 1, academicYearId: 1 });

export const Timetable = model<ITimetable>('Timetable', TimetableSchema);
