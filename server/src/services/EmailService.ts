import nodemailer from 'nodemailer';
import * as dotenv from 'dotenv';

dotenv.config();

/**
 * Email Service
 * Sends emails using existing SMTP credentials
 * 
 * RULES:
 * - Never send plaintext passwords
 * - Always send password setup/reset links
 * - Email failure does NOT rollback DB transactions
 * - Return inviteSent:false on failure
 */

interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
  from: string;
}

class EmailService {
  private transporter: nodemailer.Transporter | null = null;
  private config: EmailConfig | null = null;

  constructor() {
    this.initializeTransporter();
  }

  private initializeTransporter() {
    const {
      SMTP_HOST,
      SMTP_PORT,
      SMTP_EMAIL,
      SMTP_APP_PASSWORD,
      SMTP_FROM
    } = process.env;

    if (!SMTP_HOST || !SMTP_PORT || !SMTP_EMAIL || !SMTP_APP_PASSWORD) {
      console.warn('[EmailService] SMTP credentials not configured. Emails will not be sent.');
      return;
    }

    this.config = {
      host: SMTP_HOST,
      port: parseInt(SMTP_PORT, 10),
      secure: parseInt(SMTP_PORT, 10) === 465,
      auth: {
        user: SMTP_EMAIL,
        pass: SMTP_APP_PASSWORD
      },
      from: SMTP_FROM || SMTP_EMAIL
    };

    this.transporter = nodemailer.createTransport(this.config);
  }

  /**
   * Send invite email with Supabase-generated link
   */
  async sendInviteEmail(
    email: string,
    inviteLink: string,
    tenantName?: string,
    tenantLoginUrl?: string
  ): Promise<boolean> {
    if (!this.transporter) {
      console.warn('[EmailService] SMTP not configured. Skipping email.');
      return false;
    }

    try {
      const subject = tenantName 
        ? `You've been invited to ${tenantName}` 
        : `You've been invited to EduManage`;

      const loginLinkHtml = tenantLoginUrl 
        ? `<p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; color: #666; font-size: 14px;">
             After setting up your account, you can login at:<br>
             <a href="${tenantLoginUrl}" style="color: #4F46E5;">${tenantLoginUrl}</a>
           </p>`
        : '';

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Welcome to EduManage!</h2>
          <p>You've been invited to join ${tenantName || 'an organization'} as an administrator.</p>
          <p>Click the button below to set up your password and get started:</p>
          <div style="margin: 30px 0;">
            <a href="${inviteLink}" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Set Up Your Account
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            This link will expire in 24 hours. If you didn't expect this invitation, you can safely ignore this email.
          </p>
          <p style="color: #666; font-size: 14px;">
            Or copy and paste this link into your browser:<br>
            <a href="${inviteLink}">${inviteLink}</a>
          </p>
          ${loginLinkHtml}
        </div>
      `;

      await this.transporter.sendMail({
        from: this.config!.from,
        to: email,
        subject,
        html
      });

      console.log(`[EmailService] ✅ Invite email sent successfully to ${email}`);
      return true;
    } catch (error: any) {
      console.error('[EmailService] ❌ Failed to send invite email to', email);
      console.error('[EmailService] Error details:', {
        message: error.message,
        code: error.code,
        command: error.command,
        response: error.response,
        responseCode: error.responseCode
      });
      return false;
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(
    email: string,
    resetLink: string
  ): Promise<boolean> {
    if (!this.transporter) {
      console.warn('[EmailService] SMTP not configured. Skipping email.');
      return false;
    }

    try {
      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Reset Your Password</h2>
          <p>We received a request to reset your password. Click the button below to create a new password:</p>
          <div style="margin: 30px 0;">
            <a href="${resetLink}" 
               style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">
            This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.
          </p>
          <p style="color: #666; font-size: 14px;">
            Or copy and paste this link into your browser:<br>
            <a href="${resetLink}">${resetLink}</a>
          </p>
        </div>
      `;

      await this.transporter.sendMail({
        from: this.config!.from,
        to: email,
        subject: 'Reset Your Password',
        html
      });

      console.log(`[EmailService] Password reset email sent to ${email}`);
      return true;
    } catch (error: any) {
      console.error('[EmailService] Failed to send reset email:', error.message);
      return false;
    }
  }

  /**
   * Check if SMTP is configured
   */
  isConfigured(): boolean {
    return this.transporter !== null;
  }
}

// Export class for manual instantiation
export { EmailService };

// Export singleton instance
export const emailService = new EmailService();
