import { Profile } from '@vebgenix/db';
import { AppError } from '@vebgenix/errors';
import type { AuthContext } from '@vebgenix/auth';

export async function handleImpersonation(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
): Promise<unknown> {
  switch (operation) {
    case 'impersonateUser':
    case 'POST:/api/platform/impersonate': {
      if (!ctx.isPlatformAdmin) throw new AppError('FORBIDDEN', 'Platform admin only');
      const targetUserId = args.userId as string;
      const targetProfile = await Profile.findOne({ _id: targetUserId }).lean() as unknown as Record<string, unknown> | null;
      if (!targetProfile) throw new AppError('NOT_FOUND', 'Target user not found');
      console.warn(`[IMPERSONATION] Platform admin ${ctx.userId} impersonating ${targetUserId}`);
      return { targetProfile, note: 'Use Cognito Admin APIs to obtain token for this user' };
    }
    default:
      return undefined;
  }
}
