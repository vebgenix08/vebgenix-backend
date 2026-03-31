import {
  CognitoIdentityProviderClient,
  AdminConfirmSignUpCommand,
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminGetUserCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  type AttributeType,
} from "@aws-sdk/client-cognito-identity-provider";
import crypto from "crypto";

let _client: CognitoIdentityProviderClient | null = null;

function getClient(): CognitoIdentityProviderClient {
  if (_client) return _client;
  _client = new CognitoIdentityProviderClient({});
  return _client;
}

function randomTempPassword(): string {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const all = lower + upper + digits;
  const pick = (alphabet: string) =>
    alphabet[crypto.randomInt(0, alphabet.length)];

  const chars = [pick(upper), pick(lower), pick(digits)];
  for (let i = 0; i < 12; i++) chars.push(pick(all));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

export async function ensureCognitoUser(input: {
  email: string;
  fullName?: string | null;
  tenantId?: string | null;
  role?: string | null;
}): Promise<{ ok: boolean; code?: string; errorName?: string }> {
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) return { ok: false, code: "COGNITO_CONFIG_MISSING" };

  const email = String(input.email).trim().toLowerCase();
  if (!email || email.includes(" ")) return { ok: false, code: "INVALID_EMAIL" };

  const client = getClient();

  try {
    await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
    );
    const groupName = input.role ? String(input.role).toUpperCase() : null;
    if (groupName) {
      try {
        await client.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: userPoolId,
            Username: email,
            GroupName: groupName,
          }),
        );
      } catch (_) {
      }
    }
    return { ok: true };
  } catch (e: any) {
    const name = e?.name || e?.Code;
    if (name !== "UserNotFoundException") {
      return { ok: false, code: "COGNITO_GET_USER_FAILED", errorName: name };
    }
  }

  const attrs: AttributeType[] = [
    { Name: "email", Value: email },
    { Name: "email_verified", Value: "true" },
    ...(input.fullName ? [{ Name: "name", Value: input.fullName }] : []),
    ...(input.tenantId ? [{ Name: "custom:tenant_id", Value: input.tenantId }] : []),
    ...(input.role ? [{ Name: "custom:role", Value: input.role }] : []),
  ];

  try {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        TemporaryPassword: randomTempPassword(),
        MessageAction: "SUPPRESS",
        UserAttributes: attrs,
      }),
    );

    const groupName = input.role ? String(input.role).toUpperCase() : null;
    if (groupName) {
      try {
        await client.send(
          new AdminAddUserToGroupCommand({
            UserPoolId: userPoolId,
            Username: email,
            GroupName: groupName,
          }),
        );
      } catch (_) {
      }
    }
    return { ok: true };
  } catch (e: any) {
    const name = e?.name || e?.Code;
    if (name === "NotAuthorizedException") {
      return { ok: false, code: "COGNITO_NOT_AUTHORIZED", errorName: name };
    }
    if (name === "AccessDeniedException") {
      return { ok: false, code: "COGNITO_ACCESS_DENIED", errorName: name };
    }
    if (name === "ResourceNotFoundException") {
      return { ok: false, code: "COGNITO_RESOURCE_NOT_FOUND", errorName: name };
    }
    if (name === "InvalidParameterException") {
      return { ok: false, code: "COGNITO_INVALID_PARAMETER", errorName: name };
    }
    if (name === "UnrecognizedClientException") {
      return { ok: false, code: "AWS_CREDENTIALS_INVALID", errorName: name };
    }
    if (name === "CredentialsProviderError") {
      return { ok: false, code: "AWS_CREDENTIALS_MISSING", errorName: name };
    }
    return { ok: false, code: "COGNITO_CREATE_USER_FAILED", errorName: name };
  }
}

export async function setCognitoPasswordAndVerify(input: {
  email: string;
  newPassword: string;
}): Promise<{ ok: boolean; code?: string; errorName?: string }> {
  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) return { ok: false, code: "COGNITO_CONFIG_MISSING" };

  const email = String(input.email).trim().toLowerCase();
  if (!email || email.includes(" ")) return { ok: false, code: "INVALID_EMAIL" };

  const client = getClient();

  try {
    await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
    );
  } catch (e: any) {
    const name = e?.name || e?.Code;
    if (name === "UserNotFoundException") {
      return { ok: false, code: "COGNITO_USER_NOT_FOUND", errorName: name };
    }
    if (name === "NotAuthorizedException") {
      return { ok: false, code: "COGNITO_NOT_AUTHORIZED", errorName: name };
    }
    if (name === "AccessDeniedException") {
      return { ok: false, code: "COGNITO_ACCESS_DENIED", errorName: name };
    }
    if (name === "ResourceNotFoundException") {
      return { ok: false, code: "COGNITO_RESOURCE_NOT_FOUND", errorName: name };
    }
    if (name === "InvalidParameterException") {
      return { ok: false, code: "COGNITO_INVALID_PARAMETER", errorName: name };
    }
    if (name === "TooManyRequestsException") {
      return { ok: false, code: "COGNITO_THROTTLED", errorName: name };
    }
    if (name === "UnrecognizedClientException") {
      return { ok: false, code: "AWS_CREDENTIALS_INVALID", errorName: name };
    }
    if (name === "CredentialsProviderError") {
      return { ok: false, code: "AWS_CREDENTIALS_MISSING", errorName: name };
    }
    return { ok: false, code: "COGNITO_GET_USER_FAILED", errorName: name };
  }

  await client.send(
    new AdminSetUserPasswordCommand({
      UserPoolId: userPoolId,
      Username: email,
      Password: input.newPassword,
      Permanent: true,
    }),
  );

  const attrs: AttributeType[] = [{ Name: "email_verified", Value: "true" }];
  await client.send(
    new AdminUpdateUserAttributesCommand({
      UserPoolId: userPoolId,
      Username: email,
      UserAttributes: attrs,
    }),
  );

  try {
    await client.send(new AdminConfirmSignUpCommand({ UserPoolId: userPoolId, Username: email }));
  } catch (_) {
  }

  return { ok: true };
}
