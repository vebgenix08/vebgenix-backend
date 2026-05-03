import { Schema, model, Document, Types } from 'mongoose';

export type ExamStatus = 'DRAFT' | 'PUBLISHED' | 'ONGOING' | 'COMPLETED' | 'RESULTS_PUBLISHED';

export interface IMarksEntry {
  studentId: Types.ObjectId;
  marksObtained: number;
  maxMarks: number;
  grade?: string;
  remarks?: string;
  isAbsent: boolean;
}

export interface IExam extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  classId: Types.ObjectId;
  sectionId?: Types.ObjectId;
  subjectId?: Types.ObjectId;
  name: string;
  examDate?: Date;
  maxMarks: number;
  passingMarks: number;
  status: ExamStatus;
  marksEntries: IMarksEntry[];
  publishedAt?: Date;
  publishedBy?: Types.ObjectId;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExamSchema = new Schema<IExam>(
  {
    tenantId:      { type: String, required: true },
    campusId:      { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    academicYearId:{ type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    classId:       { type: Schema.Types.ObjectId, required: true },
    sectionId:     { type: Schema.Types.ObjectId },
    subjectId:     { type: Schema.Types.ObjectId },
    name:          { type: String, required: true },
    examDate:      { type: Date },
    maxMarks:      { type: Number, required: true },
    passingMarks:  { type: Number, required: true },
    status:        { type: String, enum: ['DRAFT','PUBLISHED','ONGOING','COMPLETED','RESULTS_PUBLISHED'], default: 'DRAFT' },
    marksEntries: [{
      studentId:     { type: Schema.Types.ObjectId, required: true, ref: 'Student' },
      marksObtained: { type: Number, required: true },
      maxMarks:      { type: Number, required: true },
      grade:         String,
      remarks:       String,
      isAbsent:      { type: Boolean, default: false },
    }],
    publishedAt:  { type: Date },
    publishedBy:  { type: Schema.Types.ObjectId, ref: 'Profile' },
    createdBy:    { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
  },
  { timestamps: true }
);

ExamSchema.index({ tenantId: 1 });
ExamSchema.index({ tenantId: 1, createdAt: -1 });
ExamSchema.index({ tenantId: 1, academicYearId: 1, classId: 1 });
ExamSchema.index({ tenantId: 1, status: 1 });
ExamSchema.index({ tenantId: 1, campusId: 1, academicYearId: 1 });

export const Exam = model<IExam>('Exam', ExamSchema);
