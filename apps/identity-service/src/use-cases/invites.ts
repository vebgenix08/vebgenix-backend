import { AppError } from '@vebgenix/errors';
import { IdentityRepo, Profile } from '@vebgenix/db';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminCreateUserCommandInput,
  AdminGetUserCommand,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import type { AuthContext } from '@vebgenix/auth';
import type { ResolveTenantId } from '../identity-utils';

const cognitoClient = new CognitoIdentityProviderClient({});

function cognitoErrorName(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  return 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';
}

function cognitoErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  return 'message' in error ? String((error as { message?: unknown }).message ?? '') : '';
}

function shouldRetryWithoutCustomAttributes(error: unknown): boolean {
  const name = cognitoErrorName(error);
  const message = cognitoErrorMessage(error).toLowerCase();
  if (name !== 'InvalidParameterException') return false;
  return (
    message.includes('custom:tenantid') ||
    message.includes('custom:role') ||
    message.includes('custom attribute') ||
    message.includes('custom attributes')
  );
}

export function buildInviteUserAttributes(input: {
  email: string;
  fullName: string;
  tenantId: string;
}, includeCustomAttributes: boolean) {
  const attributes = [
    { Name: 'email', Value: input.email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'name', Value: input.fullName },
  ];

  if (includeCustomAttributes) {
    attributes.push({ Name: 'custom:tenantId', Value: input.tenantId });
  }

  return attributes;
}

export async function ensureInvitedStaffCognitoUser(input: {
  userPoolId: string;
  email: string;
  fullName: string;
  tenantId: string;
}) {
  const baseInput: AdminCreateUserCommandInput = {
    UserPoolId: input.userPoolId,
    Username: input.email,
    UserAttributes: buildInviteUserAttributes(input, true),
    DesiredDeliveryMediums: ['EMAIL'],
    ForceAliasCreation: false,
  };

  try {
    await cognitoClient.send(new AdminCreateUserCommand(baseInput));
    return;
  } catch (error) {
    if (error instanceof UsernameExistsException) {
      return;
    }

    if (shouldRetryWithoutCustomAttributes(error)) {
      try {
        await cognitoClient.send(new AdminCreateUserCommand({
          ...baseInput,
          UserAttributes: buildInviteUserAttributes(input, false),
        }));
        return;
      } catch (retryError) {
        if (retryError instanceof UsernameExistsException) {
          return;
        }
        throw retryError;
      }
    }

    throw error;
  }
}

export async function cognitoUserExists(userPoolId: string, email: string) {
  try {
    await cognitoClient.send(new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: email,
    }));
    return true;
  } catch {
    return false;
  }
}

async function acceptInvite(args: Record<string, unknown>) {
  const token = args.token as string;
  if (!token) throw new AppError('BAD_REQUEST', 'token is required');
  const authUser = await IdentityRepo.findAuthUserByEmail(token);
  if (!authUser) {
    const profileById = await Profile.findById(token).lean() as unknown as Record<string, unknown> | null;
    if (!profileById) throw new AppError('NOT_FOUND', 'Invalid or expired invite token');
    return {
      success:        true,
      email:          profileById.email as string,
      isExistingUser: !!(authUser),
    };
  }
  const isExistingUser = !!authUser.cognitoSub;
  return {
    success: true,
    email:   authUser.email,
    isExistingUser,
  };
}

export async function handleInvites(
  operation: string,
  args: Record<string, unknown>,
  ctx: AuthContext,
  resolveTenantId: ResolveTenantId,
): Promise<unknown> {
  void ctx;
  void resolveTenantId;
  switch (operation) {
    case 'acceptInvite':
    case 'POST:/api/auth/accept-invite':
      return acceptInvite(args);
    default:
      return undefined;
  }
}
