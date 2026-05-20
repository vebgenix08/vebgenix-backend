/**
 * AuthUser — the mirror of a Cognito user in MongoDB.
 *
 * Cognito owns authentication (passwords, MFA, token signing).
 * This document stores the application-level user record:
 *   - links back to Cognito via cognitoSub (the user's UUID in the User Pool)
 *   - tracks platform admin flag
 *   - is created/updated by the PostConfirmation Lambda trigger or lazily on first API call
 *
 * We deliberately do NOT store passwordHash here.
 */
import { Schema, model, Document } from 'mongoose';

export interface IAuthUser extends Document {
  cognitoSub: string;    // Cognito User Pool sub (UUID) — primary link
  email: string;
  phone?: string;
  isActive: boolean;
  isPlatformAdmin: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AuthUserSchema = new Schema<IAuthUser>(
  {
    cognitoSub:      { type: String, required: false },
    email:           { type: String, required: true },
    phone:           { type: String },
    isActive:        { type: Boolean, default: true },
    isPlatformAdmin: { type: Boolean, default: false },
  },
  { timestamps: true },
);

// cognitoSub is globally unique — one MongoDB record per Cognito user
AuthUserSchema.index({ cognitoSub: 1 }, { unique: true, sparse: true });
// Email is globally unique across all tenants (same Cognito account = one email)
AuthUserSchema.index({ email: 1 }, { unique: true });
// Optional phone
AuthUserSchema.index({ phone: 1 }, { unique: true, sparse: true });

export const AuthUser = model<IAuthUser>('AuthUser', AuthUserSchema);
