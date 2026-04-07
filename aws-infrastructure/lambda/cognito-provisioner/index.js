"use strict";

const crypto = require("crypto");
const { getPrisma } = require("../shared/db");

function isUuid(v) {
  return (
    typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      v,
    )
  );
}

function normalizeEmail(email) {
  if (typeof email !== "string") return null;
  const e = email.trim().toLowerCase();
  if (!e || e.includes(" ")) return null;
  return e;
}

function randomTempPassword() {
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const digits = "0123456789";
  const all = lower + upper + digits;

  const pick = (alphabet) => alphabet[crypto.randomInt(0, alphabet.length)];
  const chars = [pick(upper), pick(lower), pick(digits)];
  for (let i = 0; i < 12; i++) chars.push(pick(all));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join("");
}

async function ensureCognitoUser({
  userPoolId,
  email,
  fullName,
  tenantId,
  role,
}) {
  const {
    CognitoIdentityProviderClient,
    AdminAddUserToGroupCommand,
    AdminCreateUserCommand,
    AdminGetUserCommand,
    AdminUpdateUserAttributesCommand,
    AdminEnableUserCommand,
  } = require("@aws-sdk/client-cognito-identity-provider");

  const client = new CognitoIdentityProviderClient({});

  const attrs = [
    { Name: "email", Value: email },
    ...(fullName ? [{ Name: "name", Value: fullName }] : []),
    ...(tenantId ? [{ Name: "custom:tenant_id", Value: tenantId }] : []),
    ...(role ? [{ Name: "custom:role", Value: role }] : []),
  ];

  let exists = false;
  try {
    await client.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      }),
    );
    exists = true;
  } catch (e) {
    exists = false;
  }

  if (!exists) {
    await client.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        TemporaryPassword: randomTempPassword(),
        MessageAction: "SUPPRESS",
        UserAttributes: attrs,
      }),
    );
  } else {
    await client.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: email,
        UserAttributes: attrs,
      }),
    );
    await client.send(
      new AdminEnableUserCommand({ UserPoolId: userPoolId, Username: email }),
    );
  }

  const groupName = typeof role === "string" ? role.toUpperCase() : null;
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
}

exports.handler = async (event) => {
  const batchItemFailures = [];
  const userPoolId = process.env.USER_POOL_ID;

  if (!userPoolId) {
    throw new Error("USER_POOL_ID env var not set");
  }

  const prisma = await getPrisma();

  for (const record of event.Records ?? []) {
    try {
      const body = JSON.parse(record.body);
      const detail = body.detail ?? body;
      const detailType = body["detail-type"] ?? body.detailType ?? "Unknown";

      if (detailType !== "CognitoProvisionRequested") {
        console.warn(
          JSON.stringify({ messageId: record.messageId, detailType, skip: true }),
        );
        continue;
      }

      const authUserId = detail.authUserId ?? detail.userId;
      const membershipId = detail.membershipId ?? null;
      const emailFromEvent = normalizeEmail(detail.email);

      if (!isUuid(authUserId)) {
        throw new Error("Invalid payload: authUserId must be UUID");
      }
      if (membershipId !== null && !isUuid(membershipId)) {
        throw new Error("Invalid payload: membershipId must be UUID or null");
      }

      const user = await prisma.authUser.findUnique({
        where: { id: authUserId },
        select: { id: true, email: true, status: true },
      });
      if (!user) throw new Error("AuthUser not found");
      if (user.status !== "ACTIVE") throw new Error("AuthUser is not ACTIVE");

      const email = normalizeEmail(user.email);
      if (!email) throw new Error("AuthUser.email missing/invalid");
      if (emailFromEvent && emailFromEvent !== email) {
        throw new Error("Email mismatch between event and DB");
      }

      let tenantId = null;
      let role = null;
      let fullName = null;

      if (membershipId) {
        const membership = await prisma.tenantMembership.findUnique({
          where: { id: membershipId },
          select: {
            id: true,
            tenantId: true,
            role: true,
            primaryProfile: { select: { fullName: true } },
          },
        });
        if (!membership) throw new Error("TenantMembership not found");
        tenantId = membership.tenantId;
        role = membership.role || null;
        fullName = membership.primaryProfile?.fullName || null;
      }

      await ensureCognitoUser({ userPoolId, email, fullName, tenantId, role });

      console.log(
        JSON.stringify({
          messageId: record.messageId,
          authUserId,
          membershipId,
          email,
          tenantId,
          role,
          status: "OK",
        }),
      );
    } catch (err) {
      console.error(
        "CognitoProvisioner failed:",
        record.messageId,
        err && err.message ? err.message : String(err),
      );
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
