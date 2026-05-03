/**
 * FeeAssignment — links a fee structure to a student for a specific academic year.
 * One assignment per student per academic year. Amount can be revised.
 */
import { Schema, model, Document } from 'mongoose';

export type FeeAssignmentStatus = 'ACTIVE' | 'WAIVED' | 'REVISED';

export interface IFeeAssignment extends Document {
  tenantId:        string;
  studentId:       string;
  feeStructureId:  string;
  academicYearId:  string;
  classId?:        string;
  totalAmount:     number;
  discountAmount:  number;
  netAmount:       number;
  discountReason?: string;
  status:          FeeAssignmentStatus;
  assignedBy:      string;   // profileId
  createdAt:       Date;
  updatedAt:       Date;
}

const FeeAssignmentSchema = new Schema<IFeeAssignment>({
  tenantId:       { type: String, required: true },
  studentId:      { type: String, required: true },
  feeStructureId: { type: String, required: true },
  academicYearId: { type: String, required: true },
  classId:        { type: String },
  totalAmount:    { type: Number, required: true },
  discountAmount: { type: Number, default: 0 },
  netAmount:      { type: Number, required: true },
  discountReason: { type: String },
  status:         { type: String, enum: ['ACTIVE','WAIVED','REVISED'], default: 'ACTIVE' },
  assignedBy:     { type: String, required: true },
}, { timestamps: true });

FeeAssignmentSchema.index({ tenantId: 1 });
FeeAssignmentSchema.index({ tenantId: 1, createdAt: -1 });
FeeAssignmentSchema.index({ tenantId: 1, studentId: 1, academicYearId: 1 }, { unique: true });
FeeAssignmentSchema.index({ tenantId: 1, academicYearId: 1, classId: 1 });
FeeAssignmentSchema.index({ tenantId: 1, feeStructureId: 1 });

export const FeeAssignment = model<IFeeAssignment>('FeeAssignment', FeeAssignmentSchema);
