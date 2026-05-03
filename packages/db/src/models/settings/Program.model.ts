import { Schema, model, Document } from 'mongoose';

export type ProgramType = 'DEGREE' | 'DIPLOMA' | 'CERTIFICATE' | 'PG' | 'PHD' | 'SCHOOL';

export interface IProgram extends Document {
  tenantId: string;
  campusId: string;
  name: string;           // e.g. "Bachelor of Technology"
  code: string;           // e.g. "B.TECH"
  type: ProgramType;
  durationYears: number;
  totalSeats?: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const ProgramSchema = new Schema<IProgram>({
  tenantId:     { type: String, required: true },
  campusId:     { type: String, required: true },
  name:         { type: String, required: true },
  code:         { type: String, required: true },
  type:         { type: String, enum: ['DEGREE','DIPLOMA','CERTIFICATE','PG','PHD','SCHOOL'], required: true },
  durationYears:{ type: Number, required: true },
  totalSeats:   { type: Number },
  isActive:     { type: Boolean, default: true },
}, { timestamps: true });

ProgramSchema.index({ tenantId: 1 });
ProgramSchema.index({ tenantId: 1, createdAt: -1 });
ProgramSchema.index({ tenantId: 1, campusId: 1 });
ProgramSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export const Program = model<IProgram>('Program', ProgramSchema);
