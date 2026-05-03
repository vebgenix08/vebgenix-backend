import { Types } from 'mongoose';
import { AuthUser } from '../models/auth/AuthUser.model';
import { Profile, IProfile } from '../models/auth/Profile.model';

export const IdentityRepo = {
  // ── AuthUser ──────────────────────────────────────────────────────────────

  async findAuthUserByEmail(email: string) {
    return AuthUser.findOne({ email: email.toLowerCase() });
  },

  async findAuthUserById(id: string) {
    return AuthUser.findById(id);
  },

  async findAuthUserByCognitoSub(sub: string) {
    return AuthUser.findOne({ cognitoSub: sub });
  },

  /**
   * Upsert an AuthUser by cognitoSub.
   * Called by the PostConfirmation trigger Lambda and by buildContext's lazy-sync path.
   * Uses email as a secondary match so a pre-created record (from an invite) gets linked.
   */
  async upsertByCognitoSub(data: { cognitoSub: string; email: string; phone?: string }) {
    return AuthUser.findOneAndUpdate(
      { $or: [{ cognitoSub: data.cognitoSub }, { email: data.email.toLowerCase() }] },
      {
        $set: {
          cognitoSub: data.cognitoSub,
          email:      data.email.toLowerCase(),
          ...(data.phone ? { phone: data.phone } : {}),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
  },

  /** Create a shell AuthUser (no cognitoSub yet) when pre-registering an invited user. */
  async createAuthUser(data: { email: string; cognitoSub?: string; phone?: string }) {
    return AuthUser.create({ ...data, email: data.email.toLowerCase() });
  },

  // ── Profile ───────────────────────────────────────────────────────────────

  async findProfileByAuthUserId(tenantId: string, authUserId: string): Promise<IProfile | null> {
    return Profile.findOne({ tenantId, authUserId: new Types.ObjectId(authUserId) });
  },

  async findProfileById(tenantId: string, profileId: string): Promise<IProfile | null> {
    return Profile.findOne({ tenantId, _id: new Types.ObjectId(profileId) });
  },

  async listProfiles(tenantId: string, filters: Record<string, unknown> = {}) {
    return Profile.find({ tenantId, ...filters }).sort({ createdAt: -1 });
  },

  async createProfile(data: Partial<IProfile>) {
    return Profile.create(data);
  },

  async updateProfile(tenantId: string, profileId: string, update: Partial<IProfile>) {
    return Profile.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(profileId) },
      { $set: update },
      { new: true },
    );
  },

  async deactivateProfile(tenantId: string, profileId: string) {
    return Profile.findOneAndUpdate(
      { tenantId, _id: new Types.ObjectId(profileId) },
      { $set: { isActive: false } },
      { new: true },
    );
  },
};
