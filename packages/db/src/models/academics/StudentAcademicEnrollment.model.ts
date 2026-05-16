import { Schema, model, Document, Types } from 'mongoose';

export type EnrollmentStatus = 'ACTIVE' | 'TRANSFERRED' | 'WITHDRAWN' | 'COMPLETED' | 'PROMOTED' | 'DETAINED' | 'LEFT';
export type NumberingStatus = 'PENDING' | 'ASSIGNED' | 'FROZEN';
export type JoiningType = 'FRESH' | 'LATERAL' | 'TRANSFER' | 'RE_ADMISSION' | 'PROMOTED';
export type PromotionEligibility = 'ELIGIBLE' | 'DETAINED' | 'ON_HOLD';

export interface IStudentAcademicEnrollment extends Document {
  tenantId: string;
  studentId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  campusId: Types.ObjectId;
  gradeId: Types.ObjectId;          // Class
  sectionId?: Types.ObjectId;
  programId?: Types.ObjectId;

  registrationNo?: string;
  registrationNoStatus: NumberingStatus;

  rollNo?: string;
  rollNoStatus: NumberingStatus;

  joiningDate: Date;
  joiningType: JoiningType;
  status: EnrollmentStatus;

  promotionEligibility?: PromotionEligibility;

  // Groups students sharing the same elective subject/language stream (e.g. 'HINDI')
  subjectGroupId?: string;

  // Promotion links — set when status becomes PROMOTED
  promotedFromEnrollmentId?: Types.ObjectId;
  promotedToEnrollmentId?: Types.ObjectId;

  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const StudentAcademicEnrollmentSchema = new Schema<IStudentAcademicEnrollment>(
  {
    tenantId:             { type: String, required: true },
    studentId:            { type: Schema.Types.ObjectId, required: true, ref: 'Student' },
    academicYearId:       { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    campusId:             { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    gradeId:              { type: Schema.Types.ObjectId, required: true, ref: 'Class' },
    sectionId:            { type: Schema.Types.ObjectId, ref: 'Section' },
    programId:            { type: Schema.Types.ObjectId, ref: 'Program' },

    registrationNo:       { type: String },
    registrationNoStatus: { type: String, enum: ['PENDING','ASSIGNED','FROZEN'], default: 'PENDING' },

    rollNo:               { type: String },
    rollNoStatus:         { type: String, enum: ['PENDING','ASSIGNED','FROZEN'], default: 'PENDING' },

    joiningDate:  { type: Date, required: true },
    joiningType:  { type: String, enum: ['FRESH','LATERAL','TRANSFER','RE_ADMISSION','PROMOTED'], default: 'FRESH' },
    status:       { type: String, enum: ['ACTIVE','TRANSFERRED','WITHDRAWN','COMPLETED','PROMOTED','DETAINED','LEFT'], default: 'ACTIVE' },

    promotionEligibility: { type: String, enum: ['ELIGIBLE', 'DETAINED', 'ON_HOLD'] },
    subjectGroupId:       { type: String },

    promotedFromEnrollmentId: { type: Schema.Types.ObjectId, ref: 'StudentAcademicEnrollment' },
    promotedToEnrollmentId:   { type: Schema.Types.ObjectId, ref: 'StudentAcademicEnrollment' },

    createdBy:    { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
  },
  { timestamps: true },
);

// Non-unique: one student can have multiple records per year (one per section transfer)
StudentAcademicEnrollmentSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1, status: 1 });
StudentAcademicEnrollmentSchema.index({ tenantId: 1, academicYearId: 1, campusId: 1, gradeId: 1, status: 1 });
StudentAcademicEnrollmentSchema.index({ tenantId: 1, academicYearId: 1, campusId: 1, gradeId: 1, sectionId: 1, status: 1 });
// Enforce uniqueness of assigned numbers within their scope
StudentAcademicEnrollmentSchema.index(
  { tenantId: 1, academicYearId: 1, campusId: 1, gradeId: 1, registrationNo: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE', registrationNo: { $exists: true } },
  },
);
StudentAcademicEnrollmentSchema.index(
  { tenantId: 1, academicYearId: 1, campusId: 1, gradeId: 1, sectionId: 1, rollNo: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'ACTIVE', rollNo: { $exists: true } },
  },
);

export const StudentAcademicEnrollment = model<IStudentAcademicEnrollment>(
  'StudentAcademicEnrollment',
  StudentAcademicEnrollmentSchema,
);
