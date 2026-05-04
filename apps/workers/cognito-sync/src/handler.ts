/**
 * Cognito PostConfirmation Trigger Lambda
 *
 * Fires automatically after a user:
 *   - Confirms their email (sign-up confirmation link / OTP)
 *   - Accepts an admin invite and sets their password
 *
 * Responsibility: ensure a matching AuthUser document exists in MongoDB with
 * the Cognito sub so that all downstream Lambda resolvers can look the user up.
 *
 * ⚠️  This Lambda MUST return the event unchanged — if it throws, Cognito
 *     blocks the confirmation and the user cannot log in.
 */

import { PostConfirmationTriggerEvent } from 'aws-lambda';
import { bootstrapDB, ensureDB, IdentityRepo } from '@vebgenix/db';


export const handler = async (
  event: PostConfirmationTriggerEvent,
  context: Record<string, unknown>,
): Promise<PostConfirmationTriggerEvent> => {
  bootstrapDB(context);
  try {
    await ensureDB();

    const { sub, email, phone_number: phone } = event.request.userAttributes;

    if (!sub || !email) {
      console.warn('[cognito-sync] Missing sub or email in userAttributes — skipping sync', event.request.userAttributes);
      return event;
    }

    // Upsert the AuthUser.
    // If a shell was pre-created by InviteStaff (matched by email), cognitoSub gets set.
    // If this is a self-sign-up, a fresh record is created.
    const authUser = await IdentityRepo.upsertByCognitoSub({ cognitoSub: sub, email, phone });

    console.log(`[cognito-sync] Synced AuthUser ${authUser._id} for Cognito sub ${sub} (${email})`);
  } catch (err) {
    // Log but never throw — a failure here must not block the user's sign-in
    console.error('[cognito-sync] Failed to sync user — will retry on next API call', err);
  }

  // Cognito requires returning the unmodified event
  return event;
};
