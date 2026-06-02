import { SQSEvent } from 'aws-lambda';
import { processEmailJobs } from './job';

export const handler = async (event: SQSEvent): Promise<void> => processEmailJobs(event);
