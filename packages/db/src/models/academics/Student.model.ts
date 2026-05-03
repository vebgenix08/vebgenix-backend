import { Schema, model, Document, Types } from 'mongoose';

export type StudentStatus = 'ACTIVE' | 'INACTIVE' | 'GRADUATED' | 'TRANSFERRED' | 'DROPPED';

export interface IGuardian {
  name: string;
  relation: string;
  phone: string;
  email?: string;
  authUserId?: Types.ObjectId;
}

export interface IStudent extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  academicYearId: Types.ObjectId;
  applicationId?: Types.ObjectId;
  registrationNumber: string;
  fullName: string;
  dateOfBirth?: Date;
  gender?: string;
  email?: string;
  phone?: string;
  photoUrl?: string;
  address?: string;
  classId?: Types.ObjectId;
  sectionId?: Types.ObjectId;
  programId?: Types.ObjectId;
  status: StudentStatus;
  authUserId?: Types.ObjectId;
  guardians: IGuardian[];
  createdAt: Date;
  updatedAt: Date;
}

const StudentSchema = new Schema<IStudent>(
  {
    tenantId:           { type: String, required: true },
    campusId:           { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    academicYearId:     { type: Schema.Types.ObjectId, required: true, ref: 'AcademicYear' },
    applicationId:      { type: Schema.Types.ObjectId, ref: 'Application' },
    registrationNumber: { type: String, required: true },
    fullName:           { type: String, required: true },
    dateOfBirth:        { type: Date },
    gender:             { type: String },
    email:              { type: String },
    phone:              { type: String },
    photoUrl:           { type: String },
    address:            { type: String },
    classId:            { type: Schema.Types.ObjectId },
    sectionId:          { type: Schema.Types.ObjectId },
    programId:          { type: Schema.Types.ObjectId },
    status:             { type: String, enum: ['ACTIVE','INACTIVE','GRADUATED','TRANSFERRED','DROPPED'], default: 'ACTIVE' },
    authUserId:         { type: Schema.Types.ObjectId, ref: 'AuthUser' },
    guardians: [{
      name:       { type: String, required: true },
      relation:   { type: String, required: true },
      phone:      { type: String, required: true },
      email:      String,
      authUserId: Schema.Types.ObjectId,
    }],
  },
  { timestamps: true }
);

StudentSchema.index({ tenantId: 1 });
StudentSchema.index({ tenantId: 1, createdAt: -1 });
StudentSchema.index({ tenantId: 1, registrationNumber: 1 }, { unique: true });
StudentSchema.index({ tenantId: 1, campusId: 1, status: 1 });
StudentSchema.index({ tenantId: 1, classId: 1, sectionId: 1 });
StudentSchema.index({ tenantId: 1, email: 1 });

export const Student = model<IStudent>('Student', StudentSchema);
