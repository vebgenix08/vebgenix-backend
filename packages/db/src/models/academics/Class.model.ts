/**
 * Class — a grade/year level within a program.
 * e.g.: "Grade 10", "Year 1", "Semester 1 — B.Tech CS"
 */
import { Schema, model, Document } from 'mongoose';

export interface IClass extends Document {
  tenantId:   string;
  campusId:   string;
  programId?: string;
  name:       string;   // "Grade 10" / "Year 1"
  code:       string;   // "G10" / "Y1"
  year?:      number;   // year number within program (1-indexed)
  isActive:   boolean;
  createdAt:  Date;
  updatedAt:  Date;
}

const ClassSchema = new Schema<IClass>({
  tenantId:  { type: String, required: true },
  campusId:  { type: String, required: true },
  programId: { type: String },
  name:      { type: String, required: true },
  code:      { type: String, required: true },
  year:      { type: Number },
  isActive:  { type: Boolean, default: true },
}, { timestamps: true });

ClassSchema.index({ tenantId: 1 });
ClassSchema.index({ tenantId: 1, createdAt: -1 });
ClassSchema.index({ tenantId: 1, campusId: 1 });
ClassSchema.index({ tenantId: 1, code: 1 }, { unique: true });
ClassSchema.index({ tenantId: 1, programId: 1 });

export const Class = model<IClass>('Class', ClassSchema);
