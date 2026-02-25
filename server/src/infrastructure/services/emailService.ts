import nodemailer from 'nodemailer';

export class EmailService {
  static async sendMail(to: string, subject: string, body: string): Promise<void> {
    
    // Log for debugging/development
    console.log(`\n--- [EMAIL SEND ATTEMPT] ---`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    
    // Check if SMTP configuration exists
    const smtpHost = process.env.SMTP_HOST;
    const smtpUser = process.env.SMTP_USER || process.env.SMTP_EMAIL;
    const smtpPass = process.env.SMTP_PASSWORD || process.env.SMTP_APP_PASSWORD;
    const smtpPort = Number(process.env.SMTP_PORT) || 587;

    if (!smtpHost || !smtpUser || !smtpPass) {
        console.warn("⚠️ SMTP Configuration missing (SMTP_HOST, SMTP_USER/EMAIL, SMTP_PASSWORD/APP_PASSWORD). Email will ONLY be logged to console.");
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
            from: `"${process.env.APP_NAME || 'Vagentix'}" <${smtpUser}>`,
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
