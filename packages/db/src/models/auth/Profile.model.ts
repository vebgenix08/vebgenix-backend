import { Schema, model, Document, Types } from 'mongoose';

export type PersonaRole = 'SUPER_ADMIN' | 'TENANT_ADMIN' | 'STAFF' | 'STUDENT' | 'PARENT';
export type CampusScope = 'ALL' | 'SPECIFIC';

export interface IRoleAssignment {
  roleId: Types.ObjectId;
  roleName: string;
  permissions: string[];
}

export interface ICampusAccess {
  campusId: Types.ObjectId;
  campusName: string;
}

export interface IProfile extends Document {
  tenantId: string;
  authUserId: Types.ObjectId;
  email: string;
  fullName: string;
  phone?: string;
  photoUrl?: string;
  personaRole: PersonaRole;
  isActive: boolean;
  isAllCampuses: boolean;
  isPrimaryOwner: boolean;
  campusAccess: ICampusAccess[];
  roles: IRoleAssignment[];
  employeeId?: Types.ObjectId;
  studentId?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ProfileSchema = new Schema<IProfile>(
  {
    tenantId:       { type: String, required: true },
    authUserId:     { type: Schema.Types.ObjectId, required: true, ref: 'AuthUser' },
    email:          { type: String, required: true },
    fullName:       { type: String, required: true },
    phone:          { type: String },
    photoUrl:       { type: String },
    personaRole:    { type: String, enum: ['SUPER_ADMIN','TENANT_ADMIN','STAFF','STUDENT','PARENT'], required: true },
    isActive:       { type: Boolean, default: true },
    isAllCampuses:  { type: Boolean, default: false },
    isPrimaryOwner: { type: Boolean, default: false },
    campusAccess:   [{ campusId: Schema.Types.ObjectId, campusName: String }],
    roles:          [{ roleId: Schema.Types.ObjectId, roleName: String, permissions: [String] }],
    employeeId:     { type: Schema.Types.ObjectId, ref: 'Employee' },
    studentId:      { type: Schema.Types.ObjectId, ref: 'Student' },
  },
  { timestamps: true }
);

ProfileSchema.index({ tenantId: 1 });
ProfileSchema.index({ tenantId: 1, createdAt: -1 });
ProfileSchema.index({ tenantId: 1, authUserId: 1 }, { unique: true });
ProfileSchema.index({ tenantId: 1, email: 1 });
ProfileSchema.index({ tenantId: 1, personaRole: 1 });
ProfileSchema.index({ tenantId: 1, isActive: 1 });

export const Profile = model<IProfile>('Profile', ProfileSchema);
