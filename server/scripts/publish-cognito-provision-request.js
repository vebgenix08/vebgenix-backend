"use strict";

require("dotenv").config({ path: require("path").resolve(__dirname, "../.env") });
const { EventBridgeClient, PutEventsCommand } = require("@aws-sdk/client-eventbridge");

async function main() {
  const authUserId = process.argv[2];
  const membershipId = process.argv[3] || null;

  if (!authUserId) {
    throw new Error("Usage: node scripts/publish-cognito-provision-request.js <authUserId> [membershipId]");
  }

  const bus = process.env.EVENT_BUS_NAME;
  if (!bus) throw new Error("EVENT_BUS_NAME not set in server/.env");

  const client = new EventBridgeClient({});
  await client.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: bus,
          Source: "vebgenix.dev",
          DetailType: "CognitoProvisionRequested",
          Detail: JSON.stringify({ authUserId, membershipId }),
        },
      ],
    }),
  );

  console.log(JSON.stringify({ ok: true, authUserId, membershipId, bus }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

