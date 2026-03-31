"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });

const {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
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
  if (!email) throw new Error("Usage: node scripts/cognito-get-user.js <email>");

  const userPoolId = process.env.USER_POOL_ID;
  if (!userPoolId) throw new Error("USER_POOL_ID not set in server/.env");

  const client = new CognitoIdentityProviderClient({});
  try {
    const out = await client.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: email }),
    );
    console.log(JSON.stringify({ ok: true, userPoolId, email, out }, null, 2));
  } catch (e) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          userPoolId,
          email,
          errorName: e?.name,
          message: e?.message,
          code: e?.Code,
          $metadata: e?.$metadata,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

