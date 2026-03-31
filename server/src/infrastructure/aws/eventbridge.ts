import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";

let _client: EventBridgeClient | null = null;

function getClient(): EventBridgeClient {
  if (_client) return _client;
  _client = new EventBridgeClient({});
  return _client;
}

export async function publishEventBridgeEvent(input: {
  detailType: string;
  source: string;
  detail: Record<string, any>;
}): Promise<boolean> {
  const busName = process.env.EVENT_BUS_NAME;
  if (!busName) {
    console.warn(
      `[EventBridge] EVENT_BUS_NAME not set; skipping publish ${input.detailType}`,
    );
    return false;
  }

  const client = getClient();
  await client.send(
    new PutEventsCommand({
      Entries: [
        {
          EventBusName: busName,
          Source: input.source,
          DetailType: input.detailType,
          Detail: JSON.stringify(input.detail),
        },
      ],
    }),
  );

  return true;
}
