import { Schema, model, Document, Types } from 'mongoose';

export type StaffType = 'PRINCIPAL' | 'VICE_PRINCIPAL' | 'DEAN' | 'HOD' | 'TEACHER' | 'LECTURER' | 'LAB_FACULTY' | 'ADMIN_STAFF' | 'SUPPORT_STAFF' | 'OTHER';
export type EmploymentType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'VISITING';
export type StaffCategory = 'TEACHING' | 'NON_TEACHING';

export interface IEmployee extends Document {
  tenantId: string;
  campusId: Types.ObjectId;
  profileId: Types.ObjectId;
  authUserId: Types.ObjectId;
  employeeCode: string;
  fullName: string;
  email: string;
  phone?: string;
  designation?: string;
  department?: string;
  staffType: StaffType;
  staffCategory: StaffCategory;
  employmentType: EmploymentType;
  joiningDate?: Date;
  isActive: boolean;
  reportingManagerId?: Types.ObjectId;
  photoUrl?: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    tenantId:          { type: String, required: true },
    campusId:          { type: Schema.Types.ObjectId, required: true, ref: 'Campus' },
    profileId:         { type: Schema.Types.ObjectId, required: true, ref: 'Profile' },
    authUserId:        { type: Schema.Types.ObjectId, required: true, ref: 'AuthUser' },
    employeeCode:      { type: String, required: true },
    fullName:          { type: String, required: true },
    email:             { type: String, required: true },
    phone:             { type: String },
    designation:       { type: String },
    department:        { type: String },
    staffType:         { type: String, enum: ['PRINCIPAL','VICE_PRINCIPAL','DEAN','HOD','TEACHER','LECTURER','LAB_FACULTY','ADMIN_STAFF','SUPPORT_STAFF','OTHER'], required: true },
    staffCategory:     { type: String, enum: ['TEACHING','NON_TEACHING'], required: true },
    employmentType:    { type: String, enum: ['FULL_TIME','PART_TIME','CONTRACT','VISITING'], default: 'FULL_TIME' },
    joiningDate:       { type: Date },
    isActive:          { type: Boolean, default: true },
    reportingManagerId:{ type: Schema.Types.ObjectId, ref: 'Employee' },
    photoUrl:          { type: String },
  },
  { timestamps: true }
);

EmployeeSchema.index({ tenantId: 1 });
EmployeeSchema.index({ tenantId: 1, createdAt: -1 });
EmployeeSchema.index({ tenantId: 1, employeeCode: 1 }, { unique: true });
EmployeeSchema.index({ tenantId: 1, profileId: 1 }, { unique: true });
EmployeeSchema.index({ tenantId: 1, campusId: 1, isActive: 1 });
EmployeeSchema.index({ tenantId: 1, staffType: 1 });

export const Employee = model<IEmployee>('Employee', EmployeeSchema);
