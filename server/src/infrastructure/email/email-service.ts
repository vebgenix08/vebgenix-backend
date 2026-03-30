import * as nodemailer from 'nodemailer';

export class EmailService {
  private static transporter: nodemailer.Transporter;

  private static getTransporter() {
    if (!this.transporter) {
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false, // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    }
    return this.transporter;
  }

  static async sendInviteEmail(
    to: string,
    token: string,
    type: "STAFF" | "STUDENT" | "GUARDIAN",
    opts?: { userId?: string },
  ) {
    const base = process.env.FRONTEND_URL || "https://app.vebgenix.com";
    const userId = opts?.userId;
    const qs = new URLSearchParams();
    qs.set("token", token);
    qs.set("email", to);
    if (userId) qs.set("uid", userId);
    const link = `${base}/invite/accept?${qs.toString()}`;
    const subject = `Welcome to Vebgenix - Complete your ${type.toLowerCase()} account setup`;
    
    console.log(`[EmailService] Sending ${type} invite to ${to} with link: ${link}`);

    if (!process.env.SMTP_HOST) {
      console.warn('[EmailService] SMTP not configured. Email not sent.');
      return;
    }

    try {
      await this.getTransporter().sendMail({
        from: process.env.SMTP_FROM || '"Vebgenix" <noreply@vebgenix.com>',
        to,
        subject,
        html: `
          <p>You have been invited to Vebgenix.</p>
          <p>Use the one-time invite code below to activate your account and set your password:</p>
          <a href="${link}">${link}</a>
          <p style="margin-top: 14px;">Invite code (paste into Invite Code field):</p>
          <p style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; background: #f3f4f6; padding: 10px 12px; border-radius: 6px; display: inline-block;">${token}</p>
          ${userId ? `<p style="margin-top: 14px; color: #6b7280; font-size: 12px;">User ID: ${userId}</p>` : ""}
          <p>This code expires in 60 minutes.</p>
        `,
      });
      console.log(`[EmailService] Email sent successfully to ${to}`);
    } catch (error) {
      console.error('[EmailService] Failed to send email:', error);
      // Don't throw, just log. We don't want to rollback the transaction if email fails (or maybe we do?)
      // For now, fail soft.
    }
  }
}
