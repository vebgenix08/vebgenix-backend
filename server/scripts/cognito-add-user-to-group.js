"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const {
  CognitoIdentityProviderClient,
  AdminAddUserToGroupCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

function normalizeEmail(v) {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (!e || e.includes(" ")) return null;
  return e;
}

async function main() {
  const emailArg = process.argv[2];
  const roleArg = process.argv[3];

  const email = normalizeEmail(emailArg);
  if (!email || !roleArg) {
    throw new Error(
      "Usage: node scripts/cognito-add-user-to-group.js <email> <roleGroupName>",
    );
  }

  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) throw new Error("USER_POOL_ID not set in server/.env");

  const groupName = String(roleArg).toUpperCase();
  const client = new CognitoIdentityProviderClient({});
  await client.send(
    new AdminAddUserToGroupCommand({
      UserPoolId: userPoolId,
      Username: email,
      GroupName: groupName,
    }),
  );

  console.log(JSON.stringify({ ok: true, email, userPoolId, groupName }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

