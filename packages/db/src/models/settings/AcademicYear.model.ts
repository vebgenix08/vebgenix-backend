import { Schema, model, Document } from 'mongoose';

export interface IAcademicYear extends Document {
  tenantId: string;
  name: string;
  startDate: Date;
  endDate: Date;
  isCurrent: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AcademicYearSchema = new Schema<IAcademicYear>(
  {
    tenantId:  { type: String, required: true },
    name:      { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate:   { type: Date, required: true },
    isCurrent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

AcademicYearSchema.index({ tenantId: 1 });
AcademicYearSchema.index({ tenantId: 1, createdAt: -1 });
AcademicYearSchema.index({ tenantId: 1, name: 1 }, { unique: true });
AcademicYearSchema.index({ tenantId: 1, isCurrent: 1 });

export const AcademicYear = model<IAcademicYear>('AcademicYear', AcademicYearSchema);
