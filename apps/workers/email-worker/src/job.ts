import { SQSEvent, SQSRecord } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { buildEmailContent } from './worker-utils';

const ses = new SESClient({ region: process.env.AWS_REGION ?? 'ap-south-1' });

async function processRecord(record: SQSRecord): Promise<void> {
  const job = JSON.parse(record.body);
  const { subject, html } = buildEmailContent(job);
  const from = process.env.SES_FROM_ADDRESS ?? `"${process.env.APP_NAME ?? 'Vebgenix'}" <noreply@vebgenix.com>`;
  await ses.send(new SendEmailCommand({
    Source: from,
    Destination: { ToAddresses: [job.to] },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  }));
  console.log(`[email-worker] Sent ${job.type} to ${job.to}`);
}

export async function processEmailJobs(event: SQSEvent): Promise<void> {
  const results = await Promise.allSettled(event.Records.map(processRecord));
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`[email-worker] ${failed.length} messages failed:`, failed);
    throw new Error(`${failed.length} messages failed to send`);
  }
}
