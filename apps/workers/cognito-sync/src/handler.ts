import { PostConfirmationTriggerEvent } from 'aws-lambda';
import { processCognitoSyncJob } from './job';

export const handler = async (
  event: PostConfirmationTriggerEvent,
  context: Record<string, unknown>,
): Promise<PostConfirmationTriggerEvent> => processCognitoSyncJob(event, context);
