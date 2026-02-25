export type UserRole =
  | "ADMIN"
  | "ACCOUNTANT"
  | "STAFF"
  | "TEACHER"
  | "STUDENT"
  | "PARENT";

export type CampusScope = "SCHOOL" | "PU" | null;

export type PersonaRole =
  | "SUPER_ADMIN"
  | "TENANT_ADMIN"
  | "STAFF"
  | "STUDENT"
  | "PARENT";

export type StaffType =
  | "PRINCIPAL"
  | "HOD"
  | "TEACHER"
  | "ACCOUNTANT"
  | "CLERK"
  | "OTHER";

export interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  campusScope: CampusScope;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  tenantId?: string;
  allCampusesAccess?: boolean;
  // Phase 2+ fields (nullable until backfill runs)
  personaRole?: PersonaRole | null;
  staffType?: StaffType | null;
}

/** Permission context resolved after auth — attached as req.auth */
export interface AuthContext {
  profile: UserProfile;
  tenantId: string;
  personaRole?: PersonaRole | null;
  staffType?: StaffType | null;
  /** Tenant-wide permission keys (campusId = null grants) */
  tenantWideKeys: Set<string>;
  /** Per-campus permission keys: Map<campusId, Set<permissionKey>> */
  campusKeys: Map<string, Set<string>>;
  /** Flattened union of all keys — for /me API response only, NOT for server-side enforcement */
  permissions: string[];
}

// Augment Express Request
declare global {
  namespace Express {
    interface Request {
      user?: UserProfile;
      auth?: AuthContext;
    }
  }
}
