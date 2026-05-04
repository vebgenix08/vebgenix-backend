import { SQSEvent, SQSRecord } from 'aws-lambda';
import * as nodemailer from 'nodemailer';

interface EmailJob {
  type: 'INVITE' | 'WELCOME' | 'ENQUIRY_ACK' | 'ADMISSION_APPROVED' | 'ADMISSION_REJECTED' | 'GENERIC';
  to: string;
  subject?: string;
  body?: string;
  templateData?: Record<string, string>;
}

function createTransport() {
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST ?? 'smtp.gmail.com',
    port:   Number(process.env.SMTP_PORT ?? 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD ?? process.env.SMTP_PASS,
    },
  });
}

function buildEmailContent(job: EmailJob): { subject: string; html: string } {
  const appName = process.env.APP_NAME ?? 'Vebgenix';
  const baseUrl = process.env.APP_BASE_URL ?? '';

  switch (job.type) {
    case 'WELCOME':
      return {
        subject: `Welcome to ${appName}`,
        html: `<p>Welcome to ${appName}! Your account has been created.</p>
               <p><a href="${baseUrl}/login">Login here</a></p>`,
      };
    case 'INVITE':
      return {
        subject: `You've been invited to ${appName}`,
        html: `<p>You have been invited to join ${appName}.</p>
               <p>Login link: <a href="${baseUrl}/login">${baseUrl}/login</a></p>`,
      };
    case 'ENQUIRY_ACK':
      return {
        subject: `Thank you for your enquiry — ${appName}`,
        html: `<p>Dear ${job.templateData?.studentName ?? 'Applicant'},</p>
               <p>Thank you for your enquiry. We will get back to you soon.</p>`,
      };
    case 'ADMISSION_APPROVED':
      return {
        subject: `Congratulations! Your admission is approved — ${appName}`,
        html: `<p>Dear ${job.templateData?.studentName ?? 'Applicant'},</p>
               <p>Your admission application has been approved. Please login to complete enrollment.</p>`,
      };
    case 'ADMISSION_REJECTED':
      return {
        subject: `Admission application update — ${appName}`,
        html: `<p>Dear ${job.templateData?.studentName ?? 'Applicant'},</p>
               <p>We regret to inform you that your application has not been approved at this time.</p>`,
      };
    default:
      return {
        subject: job.subject ?? `Message from ${appName}`,
        html: job.body ?? '',
      };
  }
}

async function processRecord(record: SQSRecord): Promise<void> {
  const job: EmailJob = JSON.parse(record.body);
  const { subject, html } = buildEmailContent(job);
  const transport = createTransport();

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? `"${process.env.APP_NAME ?? 'Vebgenix'}" <noreply@vebgenix.com>`,
    to:   job.to,
    subject,
    html,
  });

  console.log(`[email-worker] Sent ${job.type} to ${job.to}`);
}

export const handler = async (event: SQSEvent): Promise<void> => {
  const results = await Promise.allSettled(event.Records.map(processRecord));
  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length > 0) {
    console.error(`[email-worker] ${failed.length} messages failed:`, failed);
    throw new Error(`${failed.length} messages failed to send`);
  }
};
