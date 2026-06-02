export function resolvePublicBaseUrl() {
  const raw = String(process.env.APP_BASE_URL ?? '').trim();
  if (!raw) return 'https://app.vebgenix.com';
  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.startsWith('127.') || hostname.startsWith('192.168.')) {
      return 'https://app.vebgenix.com';
    }
    return parsed.origin.replace(/\/$/, '');
  } catch {
    return 'https://app.vebgenix.com';
  }
}

export function buildEmailContent(job: { type: string; subject?: string; body?: string; templateData?: Record<string, string> }) {
  const appName = process.env.APP_NAME ?? 'Vebgenix';
  const baseUrl = resolvePublicBaseUrl();
  switch (job.type) {
    case 'WELCOME':
      return { subject: `Welcome to ${appName}`, html: `<p>Welcome to ${appName}! Your account has been created.</p><p><a href="${baseUrl}/login">Login here</a></p>` };
    case 'INVITE':
      return { subject: `You've been invited to ${appName}`, html: `<p>You have been invited to join ${appName}.</p><p>Login link: <a href="${baseUrl}/login">${baseUrl}/login</a></p>` };
    case 'ENQUIRY_ACK':
      return { subject: `Thank you for your enquiry — ${appName}`, html: `<p>Dear ${job.templateData?.studentName ?? 'Applicant'},</p><p>Thank you for your enquiry. We will get back to you soon.</p>` };
    case 'ADMISSION_APPROVED':
      return { subject: `Congratulations! Your admission is approved — ${appName}`, html: `<p>Dear ${job.templateData?.studentName ?? 'Applicant'},</p><p>Your admission application has been approved. Please login to complete enrollment.</p>` };
    case 'ADMISSION_REJECTED':
      return { subject: `Admission application update — ${appName}`, html: `<p>Dear ${job.templateData?.studentName ?? 'Applicant'},</p><p>We regret to inform you that your application has not been approved at this time.</p>` };
    default:
      return { subject: job.subject ?? `Message from ${appName}`, html: job.body ?? '' };
  }
}
