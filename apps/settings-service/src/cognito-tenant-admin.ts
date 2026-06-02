type CognitoLikeClient = {
  send(command: unknown): Promise<any>;
};

type CognitoCommandCtor = new (input: any) => unknown;

type AdminUserInput = {
  email: string;
  fullName: string;
  tenantId?: string;
  role?: string;
  phone?: string;
};

type CreateUserOptions = AdminUserInput & {
  userPoolId: string;
  tempPassword?: string;
  suppressMessage?: boolean;
};

type UpdateUserOptions = AdminUserInput & {
  userPoolId: string;
  username?: string;
};

type InviteTenantContext = {
  tenantId?: string;
  tenantSlug?: string;
  tenantName?: string;
  role?: string;
};

function normalizeTenantSlug(value?: string | null): string | null {
  const slug = String(value ?? '').trim().toLowerCase();
  return slug || null;
}

function normalizePublicBaseUrl(value?: string | null): string | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname.startsWith('127.') ||
      hostname.startsWith('192.168.')
    ) {
      return null;
    }
    return parsed.origin.replace(/\/$/, '');
  } catch {
    return null;
  }
}

function resolveInviteBaseUrl(context?: InviteTenantContext): string {
  const tenantSlug = normalizeTenantSlug(context?.tenantSlug);
  if (tenantSlug) {
    return `https://${tenantSlug}.vebgenix.com`;
  }

  const configured = normalizePublicBaseUrl(process.env.APP_BASE_URL);
  return configured ?? 'https://app.vebgenix.com';
}

export function generateTempPassword(): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!?';
  const all = upper + lower + digits + symbols;
  let pwd = upper[Math.floor(Math.random() * upper.length)]
    + lower[Math.floor(Math.random() * lower.length)]
    + digits[Math.floor(Math.random() * digits.length)]
    + symbols[Math.floor(Math.random() * symbols.length)];
  for (let i = 0; i < 8; i++) pwd += all[Math.floor(Math.random() * all.length)];
  return pwd.split('').sort(() => Math.random() - 0.5).join('');
}

export async function sendInviteEmail(
  toEmail: string,
  fullName: string,
  tempPassword: string,
  context?: InviteTenantContext,
): Promise<void> {
  const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');
  const ses = new SESClient({ region: process.env.COGNITO_REGION ?? 'ap-south-1' });
  const appBaseUrl = resolveInviteBaseUrl(context);
  const params = new URLSearchParams({
    email: toEmail,
    token: tempPassword,
  });
  if (context?.tenantId) params.set('tenantId', context.tenantId);
  if (context?.tenantSlug) params.set('tenant', context.tenantSlug);
  if (context?.tenantName) params.set('tenantName', context.tenantName);
  if (context?.role) params.set('role', context.role);
  const link = `${appBaseUrl}/invite/accept?${params.toString()}`;
  const fromEmail = process.env.INVITE_FROM_EMAIL ?? 'contact@vebgenix.com';
  const firstName = fullName.split(' ')[0] || fullName;

  await ses.send(new SendEmailCommand({
    Source: fromEmail,
    Destination: { ToAddresses: [toEmail] },
    Message: {
      Subject: { Data: 'You\'ve been invited to Vebgenix — Activate your account' },
      Body: {
        Html: {
          Data: `<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;background:#f4f6f9;margin:0;padding:40px 0">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)">
    <tr><td style="background:#1a56db;padding:32px 40px;text-align:center">
      <h1 style="color:#fff;margin:0;font-size:24px;font-weight:700">Vebgenix</h1>
    </td></tr>
    <tr><td style="padding:40px">
      <h2 style="color:#111827;margin:0 0 12px">Hello ${firstName},</h2>
      <p style="color:#374151;font-size:15px;line-height:1.6;margin:0 0 24px">
        You've been invited to join <strong>Vebgenix</strong> as a tenant administrator.<br>
        Click the button below to activate your account and set your password.
      </p>
      <div style="text-align:center;margin:32px 0">
        <a href="${link}" style="background:#1a56db;color:#fff;text-decoration:none;padding:14px 32px;border-radius:8px;font-size:16px;font-weight:600;display:inline-block">
          Activate My Account
        </a>
      </div>
      <p style="color:#6b7280;font-size:13px;line-height:1.5;margin:24px 0 0">
        This link is valid for 7 days. If you didn't expect this invitation, you can safely ignore this email.
      </p>
    </td></tr>
    <tr><td style="background:#f9fafb;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb">
      <p style="color:#9ca3af;font-size:12px;margin:0">© 2025 Vebgenix. All rights reserved.</p>
    </td></tr>
  </table>
  </td></tr></table>
</body>
</html>`,
        },
        Text: {
          Data: `Hello ${firstName},\n\nYou've been invited to Vebgenix as a tenant administrator.\n\nActivate your account here:\n${link}\n\nThis link is valid for 7 days.\n\nVebgenix Team`,
        },
      },
    },
  }));
}

function cognitoErrorName(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  const raw = 'name' in error ? String((error as { name?: unknown }).name ?? '') : '';
  return raw;
}

function cognitoErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return '';
  if ('message' in error) return String((error as { message?: unknown }).message ?? '');
  return '';
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

function shouldIgnoreMissingGroup(error: unknown): boolean {
  const name = cognitoErrorName(error);
  const message = cognitoErrorMessage(error).toLowerCase();
  if (!message.includes('group')) return false;
  return name === 'ResourceNotFoundException' || name === 'InvalidParameterException';
}

function buildAttributes(input: AdminUserInput, includeCustomAttributes: boolean) {
  const attributes = [
    { Name: 'email', Value: input.email },
    { Name: 'name', Value: input.fullName },
    { Name: 'email_verified', Value: 'true' },
    ...(input.phone ? [{ Name: 'phone_number', Value: input.phone }] : []),
  ];

  if (includeCustomAttributes) {
    if (input.tenantId) {
      attributes.push({ Name: 'custom:tenantId', Value: input.tenantId });
    }
    if (input.role) {
      attributes.push({ Name: 'custom:role', Value: input.role });
    }
  }

  return attributes;
}

export async function createTenantAdminUser(
  cognito: CognitoLikeClient,
  AdminCreateUserCommand: CognitoCommandCtor,
  options: CreateUserOptions,
) {
  const baseInput: Record<string, unknown> = {
    UserPoolId: options.userPoolId,
    Username: options.email,
    UserAttributes: buildAttributes(options, true),
  };

  if (options.tempPassword) {
    baseInput.TemporaryPassword = options.tempPassword;
  } else {
    baseInput.DesiredDeliveryMediums = ['EMAIL'];
  }

  if (options.suppressMessage) {
    baseInput.MessageAction = 'SUPPRESS';
  }

  try {
    return await cognito.send(new AdminCreateUserCommand(baseInput));
  } catch (error) {
    if (!shouldRetryWithoutCustomAttributes(error)) throw error;
    return cognito.send(new AdminCreateUserCommand({
      ...baseInput,
      UserAttributes: buildAttributes(options, false),
    }));
  }
}

export async function updateTenantAdminUserAttributes(
  cognito: CognitoLikeClient,
  AdminUpdateUserAttributesCommand: CognitoCommandCtor,
  options: UpdateUserOptions,
) {
  const baseInput = {
    UserPoolId: options.userPoolId,
    Username: options.username ?? options.email,
    UserAttributes: buildAttributes(options, true),
  };

  try {
    return await cognito.send(new AdminUpdateUserAttributesCommand(baseInput));
  } catch (error) {
    if (!shouldRetryWithoutCustomAttributes(error)) throw error;
    return cognito.send(new AdminUpdateUserAttributesCommand({
      ...baseInput,
      UserAttributes: buildAttributes(options, false),
    }));
  }
}

export async function addUserToGroupIfAvailable(
  cognito: CognitoLikeClient,
  AdminAddUserToGroupCommand: CognitoCommandCtor,
  userPoolId: string,
  email: string,
  groupName: string,
) {
  try {
    return await cognito.send(new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: email,
      GroupName: groupName,
    }));
  } catch (error) {
    if (shouldIgnoreMissingGroup(error)) return null;
    throw error;
  }
}

export async function setTenantAdminTemporaryPassword(
  cognito: CognitoLikeClient,
  AdminSetUserPasswordCommand: CognitoCommandCtor,
  AdminGetUserCommand: CognitoCommandCtor,
  userPoolId: string,
  usernameOrEmail: string,
  tempPassword: string,
) {
  const apply = async (username: string) => cognito.send(new AdminSetUserPasswordCommand({
    UserPoolId: userPoolId,
    Username: username,
    Password: tempPassword,
    Permanent: false,
  }));

  try {
    await apply(usernameOrEmail);
    return { username: usernameOrEmail, existed: true };
  } catch (error) {
    if (cognitoErrorName(error) !== 'UserNotFoundException') throw error;
  }

  try {
    const user = await cognito.send(new AdminGetUserCommand({
      UserPoolId: userPoolId,
      Username: usernameOrEmail,
    }));
    const resolvedUsername = String(user?.Username ?? '').trim();
    if (resolvedUsername) {
      await apply(resolvedUsername);
      return { username: resolvedUsername, existed: true };
    }
  } catch (error) {
    if (cognitoErrorName(error) !== 'UserNotFoundException') throw error;
  }

  return { username: usernameOrEmail, existed: false };
}

export async function resolveTenantAdminUsername(
  cognito: CognitoLikeClient,
  AdminGetUserCommand: CognitoCommandCtor,
  ListUsersCommand: CognitoCommandCtor,
  userPoolId: string,
  options: {
    preferredUsername?: string;
    email: string;
  },
) {
  const candidates = [
    String(options.preferredUsername ?? '').trim(),
    String(options.email ?? '').trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const user = await cognito.send(new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: candidate,
      }));
      const resolvedUsername = String(user?.Username ?? candidate).trim();
      if (resolvedUsername) {
        return {
          username: resolvedUsername,
          source: candidate === options.preferredUsername ? 'preferred' : 'email',
        };
      }
    } catch (error) {
      if (cognitoErrorName(error) !== 'UserNotFoundException') throw error;
    }
  }

  const email = String(options.email ?? '').trim();
  if (!email) return null;

  const listResponse = await cognito.send(new ListUsersCommand({
    UserPoolId: userPoolId,
    Filter: `email = "${email.replace(/(["\\])/g, '\\$1')}"`,
    Limit: 1,
  }));
  const matchedUser = Array.isArray(listResponse?.Users) ? listResponse.Users[0] : null;
  const resolvedUsername = String(matchedUser?.Username ?? '').trim();
  if (!resolvedUsername) return null;

  return {
    username: resolvedUsername,
    source: 'list-users',
  };
}
