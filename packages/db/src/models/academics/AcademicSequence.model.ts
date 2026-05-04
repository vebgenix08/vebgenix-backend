import { Schema, model, Document } from 'mongoose';

export interface IAcademicSequence extends Document {
  tenantId: string;
  scope: string;   // e.g. 'APPLICATION', 'ADMISSION'
  key: string;     // e.g. '25-26'
  value: number;
  createdAt: Date;
  updatedAt: Date;
}

const AcademicSequenceSchema = new Schema<IAcademicSequence>(
  {
    tenantId: { type: String, required: true },
    scope:    { type: String, required: true },
    key:      { type: String, required: true },
    value:    { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

AcademicSequenceSchema.index({ tenantId: 1, scope: 1, key: 1 }, { unique: true });

export const AcademicSequence = model<IAcademicSequence>('AcademicSequence', AcademicSequenceSchema);
