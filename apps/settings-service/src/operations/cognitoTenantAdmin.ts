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
};

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
    Username: options.email,
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
