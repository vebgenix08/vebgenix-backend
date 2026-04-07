"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const {
  CognitoIdentityProviderClient,
  AdminListGroupsForUserCommand,
} = require("@aws-sdk/client-cognito-identity-provider");

function normalizeEmail(v) {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (!e || e.includes(" ")) return null;
  return e;
}

async function main() {
  const emailArg = process.argv[2];
  const email = normalizeEmail(emailArg);
  if (!email) throw new Error("Usage: node scripts/cognito-list-user-groups.js <email>");

  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) throw new Error("USER_POOL_ID not set in server/.env");

  const client = new CognitoIdentityProviderClient({});
  const out = await client.send(
    new AdminListGroupsForUserCommand({
      UserPoolId: userPoolId,
      Username: email,
    }),
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        email,
        userPoolId,
        groups: (out.Groups || []).map((g) => g.GroupName),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

