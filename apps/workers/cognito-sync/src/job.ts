import { ensureDB, IdentityRepo, bootstrapDB } from '@vebgenix/db';
import { PostConfirmationTriggerEvent } from 'aws-lambda';
import { getUserAttributes } from './worker-utils';

export async function processCognitoSyncJob(
  event: PostConfirmationTriggerEvent,
  context: Record<string, unknown>,
): Promise<PostConfirmationTriggerEvent> {
  bootstrapDB(context);
  try {
    await ensureDB();
    const { sub, email, phone_number: phone } = getUserAttributes(event);
    if (!sub || !email) {
      console.warn('[cognito-sync] Missing sub or email in userAttributes — skipping sync', event.request.userAttributes);
      return event;
    }
    const authUser = await IdentityRepo.upsertByCognitoSub({ cognitoSub: sub, email, phone });
    console.log(`[cognito-sync] Synced AuthUser ${authUser._id} for Cognito sub ${sub} (${email})`);
  } catch (err) {
    console.error('[cognito-sync] Failed to sync user — will retry on next API call', err);
  }
  return event;
}
