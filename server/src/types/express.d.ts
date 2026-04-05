import { Request } from "express";

declare global {
  namespace Express {
    interface Request {
      tenant?: {
        tenantId: string;
        slug: string | null;
        name: string;
      };
      campus?: {
        campusId: string;
        campusType: "SCHOOL" | "PU";
        name: string;
      };
      // User is already likely extended elsewhere or we can add it here to be safe
      user?: {
        id: string;
        email: string;
        fullName?: string;
        role: string;
        allCampusesAccess: boolean;
      };
    }
  }
}

export {};

