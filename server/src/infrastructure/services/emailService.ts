import nodemailer from 'nodemailer';

export const emailService = {
  async sendInviteEmail(to: string, inviteLink: string, tenantName: string = 'Our Organization', loginUrl: string = `${process.env.FRONTEND_URL || 'https://app.vebgenix.com'}/login`): Promise<boolean> {
      try {
          const subject = `You've been invited to join ${tenantName}`;
          const body = `
            <h2>Welcome to ${tenantName}</h2>
            <p>You have been invited to join our ERP system.</p>
            <p>Please click the link below to set up your account:</p>
            <a href="${inviteLink}" style="display:inline-block;padding:10px 20px;background:#007bff;color:white;text-decoration:none;border-radius:5px;">Accept Invite</a>
            <p>Or verify your login at: <a href="${loginUrl}">${loginUrl}</a></p>
          `;
          await EmailService.sendMail(to, subject, body);
          return true;
      } catch (e) {
          console.error("Failed to send invite email", e);
          return false;
      }
  }
};

export class EmailService {
  static async sendMail(to: string, subject: string, body: string): Promise<void> {
    
    // Log for debugging/development
    console.log(`\n--- [EMAIL SEND ATTEMPT] ---`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    
    // Check if SMTP configuration exists
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER;
    const smtpPass = process.env.SMTP_PASS;
    const smtpPort = Number(process.env.SMTP_PORT) || 587;

    if (!smtpHost || !smtpUser || !smtpPass) {
        console.warn("⚠️ SMTP Configuration missing (SMTP_HOST, SMTP_USER, SMTP_PASS). Email will ONLY be logged to console.");
        console.log(`Body (Snippet): ${body.substring(0, 500)}...`);
        console.log(`-------------------------\n`);
        return;
    }

    try {
        const transporter = nodemailer.createTransport({
            host: smtpHost,
            port: smtpPort,
            secure: smtpPort === 465, // true for 465, false for other ports
            auth: {
                user: smtpUser,
                pass: smtpPass,
            },
        });

        await transporter.sendMail({
            from: `"${process.env.APP_NAME || 'Vagentix'}" <${process.env.SMTP_FROM || smtpUser}>`,
            to,
            subject,
            html: body,
        });

        console.log("✅ Email sent successfully via SMTP.");
    } catch (error: any) {
        console.error("❌ Failed to send email via SMTP:", error);
        // Fallback log
        console.log(`Body (Snippet): ${body.substring(0, 500)}...`);
    }
    console.log(`-------------------------\n`);
  }
}
