import { Schema, model, Document } from 'mongoose';

export type SubjectType = 'CORE' | 'ELECTIVE' | 'LAB' | 'LANGUAGE' | 'ACTIVITY';

export interface ISubject extends Document {
  tenantId:      string;
  campusId:      string;
  code:          string;
  name:          string;
  type:          SubjectType;
  creditsOrPeriods: number;
  isActive:      boolean;
  createdAt:     Date;
  updatedAt:     Date;
}

const SubjectSchema = new Schema<ISubject>({
  tenantId:         { type: String, required: true },
  campusId:         { type: String, required: true },
  code:             { type: String, required: true },
  name:             { type: String, required: true },
  type:             { type: String, enum: ['CORE','ELECTIVE','LAB','LANGUAGE','ACTIVITY'], default: 'CORE' },
  creditsOrPeriods: { type: Number, default: 1 },
  isActive:         { type: Boolean, default: true },
}, { timestamps: true });

SubjectSchema.index({ tenantId: 1 });
SubjectSchema.index({ tenantId: 1, createdAt: -1 });
SubjectSchema.index({ tenantId: 1, campusId: 1 });
SubjectSchema.index({ tenantId: 1, code: 1 }, { unique: true });

export const Subject = model<ISubject>('Subject', SubjectSchema);
