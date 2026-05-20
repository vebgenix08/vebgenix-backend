import { Schema, model, Document, Types } from 'mongoose';

export type ManualFeeAccountStatus = 'UNPAID' | 'PARTIAL' | 'PAID';

export interface IManualStudentFeeAccount extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  academicYearId: Types.ObjectId;

  admissionNo: string;
  registrationNo?: string;
  studentName: string;
  studentDob?: Date;

  gradeId: Types.ObjectId;
  sectionId?: Types.ObjectId;

  feeScheduleId: Types.ObjectId;
  feeStructureId: Types.ObjectId;

  totalAmount: number;
  paidAmount: number;
  balanceAmount: number;

  status: ManualFeeAccountStatus;

  linkedStudentId?: Types.ObjectId;
  linkedAt?: Date;

  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ManualStudentFeeAccountSchema = new Schema<IManualStudentFeeAccount>(
  {
    tenantId:        { type: String, required: true },
    campusId:        { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    academicYearId:  { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },

    admissionNo:     { type: String, required: true },
    registrationNo:  { type: String },
    studentName:     { type: String, required: true },
    studentDob:      { type: Date },

    gradeId:         { type: Schema.Types.ObjectId, required: true, ref: 'Class' },
    sectionId:       { type: Schema.Types.ObjectId, ref: 'Section' },

    feeScheduleId:   { type: Schema.Types.ObjectId, ref: 'FeeSchedule' },
    feeStructureId:  { type: Schema.Types.ObjectId, required: true, ref: 'FeeStructure' },

    totalAmount:     { type: Number, required: true, default: 0 },
    paidAmount:      { type: Number, required: true, default: 0 },
    balanceAmount:   { type: Number, required: true, default: 0 },

    status:          { type: String, enum: ['UNPAID', 'PARTIAL', 'PAID'], default: 'UNPAID' },

    linkedStudentId: { type: Schema.Types.ObjectId, ref: 'Student' },
    linkedAt:        { type: Date },

    createdBy:       { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
  },
  { timestamps: true },
);

ManualStudentFeeAccountSchema.index({ tenantId: 1 });
ManualStudentFeeAccountSchema.index({ tenantId: 1, createdAt: -1 });
ManualStudentFeeAccountSchema.index({ tenantId: 1, academicYearId: 1, status: 1 });
ManualStudentFeeAccountSchema.index({ tenantId: 1, linkedStudentId: 1 }, { sparse: true });
ManualStudentFeeAccountSchema.index(
  { tenantId: 1, academicYearId: 1, admissionNo: 1, feeScheduleId: 1 },
  { unique: true },
);

export const ManualStudentFeeAccount = model<IManualStudentFeeAccount>(
  'ManualStudentFeeAccount',
  ManualStudentFeeAccountSchema,
  'manual_student_fee_accounts',
);
