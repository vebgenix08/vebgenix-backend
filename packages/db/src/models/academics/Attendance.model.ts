import { Schema, model, Document, Types } from 'mongoose';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';

export interface IAttendance extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  studentId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId?: Types.ObjectId;
  subjectId?: Types.ObjectId;
  date: Date;
  status: AttendanceStatus;
  remarks?: string;
  markedBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const AttendanceSchema = new Schema<IAttendance>(
  {
    tenantId:  { type: String, required: true },
    campusId:  { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    studentId: { type: Schema.Types.ObjectId, required: true, ref: 'Student' },
    classId:   { type: Schema.Types.ObjectId, required: true },
    sectionId: { type: Schema.Types.ObjectId },
    subjectId: { type: Schema.Types.ObjectId },
    date:      { type: Date, required: true },
    status:    { type: String, enum: ['PRESENT','ABSENT','LATE','EXCUSED'], required: true },
    remarks:   { type: String },
    markedBy:  { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
  },
  { timestamps: true }
);

AttendanceSchema.index({ tenantId: 1 });
AttendanceSchema.index({ tenantId: 1, createdAt: -1 });
AttendanceSchema.index({ tenantId: 1, studentId: 1, date: 1 }, { unique: true });
AttendanceSchema.index({ tenantId: 1, classId: 1, date: 1 });
AttendanceSchema.index({ tenantId: 1, campusId: 1, date: 1 });

export const Attendance = model<IAttendance>('Attendance', AttendanceSchema);
