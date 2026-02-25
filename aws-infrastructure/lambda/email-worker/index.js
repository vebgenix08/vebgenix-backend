'use strict';

const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

const sesClient = new SESClient({});
const FROM_EMAIL = process.env.FROM_EMAIL ?? 'noreply@vebgenix.com';
const STAGE      = process.env.STAGE ?? 'dev';

/**
 * EmailWorkerLambda — SQS batch consumer
 *
 * Triggered by EventBridge → SQS vebgenix-email-{stage}
 *
 * Supported event types (EventBridge DetailType):
 *   - AdmissionApproved    → congratulations email to student/parent
 *   - AdmissionRejected    → decline notice
 *   - UserWelcome          → onboarding email with temporary password instructions
 *   - PasswordReset        → password reset link forwarding
 *   - EnquiryReceived      → acknowledgement to enquiry submitter
 *
 * SQS batch item failures: returns { batchItemFailures } so failed items
 * are retried individually while successful ones are deleted from the queue.
 */
exports.handler = async (event) => {
  const batchItemFailures = [];

  for (const record of event.Records) {
    try {
      // EventBridge wraps payload in {"detail": {...}, "detail-type": "..."}
      const body = JSON.parse(record.body);
      const detail = body.detail ?? body;
      const detailType = body['detail-type'] ?? body.detailType ?? 'Unknown';

      console.log(JSON.stringify({ detailType, detail }));
      await routeEmail(detailType, detail);

    } catch (err) {
      console.error('Failed to process record:', record.messageId, err.message);
      // Report failure so SQS retries only this item
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};

// ── Router: maps EventBridge detailType → email template ────────────────────

async function routeEmail(detailType, detail) {
  switch (detailType) {
    case 'AdmissionApproved':
      return sendAdmissionApprovedEmail(detail);

    case 'AdmissionRejected':
      return sendAdmissionRejectedEmail(detail);

    case 'UserWelcome':
      return sendUserWelcomeEmail(detail);

    case 'EnquiryReceived':
      return sendEnquiryAckEmail(detail);

    default:
      console.warn(`EmailWorker: unhandled detailType "${detailType}" — skipping`);
  }
}

// ── Templates ────────────────────────────────────────────────────────────────

async function sendAdmissionApprovedEmail(detail) {
  const { studentName, tenantId, admissionId, notes } = detail;
  const recipientEmail = detail.studentEmail ?? detail.parentEmail;
  if (!recipientEmail) {
    console.warn('AdmissionApproved: no recipient email, skipping');
    return;
  }

  await ses({
    to: recipientEmail,
    subject: `Admission Approved — ${studentName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563EB;">Congratulations! 🎉</h2>
        <p>Dear <strong>${escHtml(studentName)}</strong>,</p>
        <p>We are pleased to inform you that your admission application has been <strong>approved</strong>.</p>
        ${notes ? `<p><em>Note from the admissions team:</em> ${escHtml(notes)}</p>` : ''}
        <p>The admissions team will contact you shortly with next steps regarding enrollment and fee payment.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6B7280; font-size: 13px;">Reference: ${admissionId}</p>
      </div>
    `,
  });
}

async function sendAdmissionRejectedEmail(detail) {
  const { studentName, admissionId, notes } = detail;
  const recipientEmail = detail.studentEmail ?? detail.parentEmail;
  if (!recipientEmail) return;

  await ses({
    to: recipientEmail,
    subject: `Admission Decision — ${studentName}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #374151;">Admission Update</h2>
        <p>Dear <strong>${escHtml(studentName)}</strong>,</p>
        <p>Thank you for submitting your application. After careful review, we regret to inform you
           that we are unable to offer admission at this time.</p>
        ${notes ? `<p><em>Feedback:</em> ${escHtml(notes)}</p>` : ''}
        <p>We encourage you to apply again in the next admission cycle.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #6B7280; font-size: 13px;">Reference: ${admissionId}</p>
      </div>
    `,
  });
}

async function sendUserWelcomeEmail(detail) {
  const { fullName, email, role, tenantName } = detail;
  if (!email) return;

  await ses({
    to: email,
    subject: `Welcome to ${escHtml(tenantName ?? 'Vebgenix')}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563EB;">Welcome, ${escHtml(fullName)}!</h2>
        <p>Your account has been created on <strong>${escHtml(tenantName ?? 'Vebgenix ERP')}</strong>.</p>
        <p><strong>Role:</strong> ${escHtml(role)}</p>
        <p>You will receive a separate email from AWS Cognito with your temporary password.
           Please log in and change your password on first sign-in.</p>
        <p>
          <a href="${STAGE === 'prod' ? 'https://app.vebgenix.com' : 'https://dev.vebgenix.com'}/login"
             style="display:inline-block;background:#2563EB;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">
            Sign in →
          </a>
        </p>
      </div>
    `,
  });
}

async function sendEnquiryAckEmail(detail) {
  const { fullName, email, gradeApplied, tenantName } = detail;
  if (!email) return;

  await ses({
    to: email,
    subject: `Enquiry Received — ${escHtml(tenantName ?? 'Vebgenix')}`,
    html: `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2563EB;">Thank you for your enquiry</h2>
        <p>Dear <strong>${escHtml(fullName)}</strong>,</p>
        <p>We have received your enquiry for grade <strong>${escHtml(gradeApplied)}</strong>
           at <strong>${escHtml(tenantName ?? 'our institution')}</strong>.</p>
        <p>Our admissions team will reach out within 2 business days.</p>
      </div>
    `,
  });
}

// ── SES helper ───────────────────────────────────────────────────────────────

async function ses({ to, subject, html }) {
  const toAddresses = Array.isArray(to) ? to : [to];
  await sesClient.send(new SendEmailCommand({
    Source: FROM_EMAIL,
    Destination: { ToAddresses: toAddresses },
    Message: {
      Subject: { Data: subject, Charset: 'UTF-8' },
      Body: { Html: { Data: html, Charset: 'UTF-8' } },
    },
  }));
  console.log(`Email sent to ${toAddresses.join(', ')}: "${subject}"`);
}

// Basic HTML escaping — prevents XSS in templates
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
