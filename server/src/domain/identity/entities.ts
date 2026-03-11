export type UserID = string;
export type TenantID = string;
export type CampusID = string;
export type RoleID = string;

export enum MembershipStatus {
  INVITED = 'INVITED',
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

export interface User {
  id: UserID;
  email: string;
  fullName: string;
  isPlatformAdmin: boolean;
}

export interface Role {
  id: RoleID;
  name: string;
  isSystem: boolean;
  permissions: Set<string>;
}

export interface Membership {
  id: string;
  tenantId: TenantID;
  userId: UserID;
  status: MembershipStatus;
  roles: Role[];
  campusScope: Set<CampusID>; // Empty set means ALL campuses access if isAllCampuses is true? 
  // Better: Explicit flag
  isAllCampuses: boolean;
  isPrimaryOwner: boolean;
}

export interface AuthContext {
  user: User;
  membership?: Membership;
  permissions: Set<string>;
  allowedCampusIds: Set<CampusID>; // Empty if all access? Or explicit flag?
  hasAllCampusesAccess: boolean;
}
