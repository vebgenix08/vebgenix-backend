import { Types } from 'mongoose';

export interface AuthRole {
  roleId: Types.ObjectId;
  roleName: string;
  permissions: string[];
}

export interface AuthMembership {
  tenantId: string;
  profileId: string;
  isAllCampuses: boolean;
  isPrimaryOwner: boolean;
  campusIds: string[];
  personaRole?: string;
  roles: AuthRole[];
}

export interface AuthContext {
  userId: string;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
  membership?: AuthMembership;
  memberships?: AuthMembership[];
  permissions: Set<string>;
  allowedCampusIds: Set<string>;
}
