import { SQSEvent } from 'aws-lambda';
import { bootstrapDB } from '@vebgenix/db';
import { processJobsWorkerRecord } from './job';

export const handler = async (event: SQSEvent, context: Record<string, unknown>): Promise<void> => {
  bootstrapDB(context);
  const results = await Promise.allSettled(event.Records.map(processJobsWorkerRecord));
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`[jobs-worker] ${failed.length} jobs failed:`, failed);
    throw new Error(`${failed.length} jobs failed`);
  }
};
