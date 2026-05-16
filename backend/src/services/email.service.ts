// backend/src/services/email.service.ts
import { env } from '../config/env';
import logger from '../config/logger';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';

const baseTemplate = (content: string) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ContomatorAI</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background-color:#2563eb;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">ContomatorAI</h1>
              <p style="margin:4px 0 0;color:#bfdbfe;font-size:13px;">AI-Powered Content Automation</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                &copy; ${new Date().getFullYear()} ContomatorAI. All rights reserved.
              </p>
              <p style="margin:8px 0 0;color:#94a3b8;font-size:12px;">
                If you did not request this email, you can safely ignore it.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const primaryButton = (url: string, text: string) => `
  <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr>
      <td style="background-color:#2563eb;border-radius:6px;">
        <a href="${url}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
          ${text}
        </a>
      </td>
    </tr>
  </table>
`;

const fallbackLink = (url: string) => `
  <p style="margin:16px 0 0;font-size:13px;color:#94a3b8;">
    Or copy and paste this link into your browser:<br/>
    <a href="${url}" style="color:#2563eb;word-break:break-all;">${url}</a>
  </p>
`;

const sendEmail = async (to: string, subject: string, html: string) => {
  if (!env.BREVO_API_KEY) {
    logger.error('BREVO_API_KEY is not defined. Email sending skipped.');
    return;
  }

  if (!env.EMAIL_FROM) {
    logger.error('EMAIL_FROM is not defined. Email sending skipped.');
    return;
  }

  const payload = {
    sender: {
      name: env.EMAIL_FROM_NAME || 'ContomatorAI',
      email: env.EMAIL_FROM,
    },
    to: [{ email: to }],
    subject,
    htmlContent: html,
  };

  try {
    const response = await fetch(BREVO_API_URL, {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': env.BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json() as { message?: string };
      logger.error(`Brevo API error for ${to}:`, error);
      throw new Error(`Brevo API error: ${error.message || response.statusText}`);
    }

    const result = await response.json() as { messageId?: string };
    logger.info(`Email sent successfully to ${to}: messageId ${result.messageId || 'unknown'}`);
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error);
    throw new Error('Email sending failed');
  }
};

export const sendVerificationEmail = async (to: string, token: string) => {
  const verificationUrl = `${env.FRONTEND_URL}/auth/verify-email?token=${token}`;

  const content = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:22px;font-weight:700;">Verify your email address</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">
      Thanks for signing up for ContomatorAI! To get started, please verify your email address by clicking the button below.
    </p>
    <p style="margin:0 0 4px;color:#64748b;font-size:14px;">This link expires in <strong>24 hours</strong>.</p>
    ${primaryButton(verificationUrl, 'Verify Email Address')}
    ${fallbackLink(verificationUrl)}
  `;

  await sendEmail(to, 'Verify your ContomatorAI email address', baseTemplate(content));
};

export const sendPasswordResetEmail = async (to: string, token: string) => {
  const resetUrl = `${env.FRONTEND_URL}/auth/reset-password?token=${token}`;

  const content = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:22px;font-weight:700;">Reset your password</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">
      We received a request to reset the password for your ContomatorAI account. Click the button below to choose a new password.
    </p>
    <p style="margin:0 0 4px;color:#64748b;font-size:14px;">This link expires in <strong>1 hour</strong>.</p>
    <table cellpadding="0" cellspacing="0" style="margin:24px 0;">
      <tr>
        <td style="background-color:#dc2626;border-radius:6px;">
          <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:6px;">
            Reset Password
          </a>
        </td>
      </tr>
    </table>
    ${fallbackLink(resetUrl)}
    <p style="margin:24px 0 0;padding:16px;background-color:#fef2f2;border-radius:6px;color:#991b1b;font-size:13px;">
      If you did not request a password reset, please ignore this email. Your password will remain unchanged.
    </p>
  `;

  await sendEmail(to, 'Reset your ContomatorAI password', baseTemplate(content));
};

export const sendWelcomeEmail = async (to: string, name: string) => {
  const dashboardUrl = `${env.FRONTEND_URL}/dashboard`;

  const content = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:22px;font-weight:700;">Welcome to ContomatorAI, ${name}! 🎉</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">
      Your email has been verified and your account is ready. You now have access to AI-powered content automation tools to supercharge your workflow.
    </p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;background-color:#f8fafc;border-radius:8px;padding:20px;">
      <tr>
        <td>
          <p style="margin:0 0 12px;color:#1e293b;font-size:14px;font-weight:600;">What you can do with ContomatorAI:</p>
          <p style="margin:0 0 8px;color:#64748b;font-size:14px;">✅ &nbsp;Generate AI-powered blog posts and articles</p>
          <p style="margin:0 0 8px;color:#64748b;font-size:14px;">✅ &nbsp;Publish directly to WordPress</p>
          <p style="margin:0 0 8px;color:#64748b;font-size:14px;">✅ &nbsp;Schedule content in advance</p>
          <p style="margin:0;color:#64748b;font-size:14px;">✅ &nbsp;Track usage and word credits</p>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 4px;color:#64748b;font-size:14px;">You start with <strong>1,000 free word credits</strong>. Head to your dashboard to get started.</p>
    ${primaryButton(dashboardUrl, 'Go to Dashboard')}
  `;

  await sendEmail(to, `Welcome to ContomatorAI, ${name}!`, baseTemplate(content));
};

export const sendPasswordChangedEmail = async (to: string, name: string) => {
  const loginUrl = `${env.FRONTEND_URL}/login`;

  const content = `
    <h2 style="margin:0 0 8px;color:#1e293b;font-size:22px;font-weight:700;">Password changed successfully</h2>
    <p style="margin:0 0 16px;color:#64748b;font-size:15px;line-height:1.6;">
      Hi ${name}, your ContomatorAI account password was recently changed.
    </p>
    <p style="margin:0 0 24px;padding:16px;background-color:#fef2f2;border-radius:6px;color:#991b1b;font-size:14px;">
      ⚠️ &nbsp;If you did not make this change, please reset your password immediately and contact support.
    </p>
    ${primaryButton(loginUrl, 'Go to Login')}
  `;

  await sendEmail(to, 'Your ContomatorAI password has been changed', baseTemplate(content));
};

const emailService = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
  sendWelcomeEmail,
  sendPasswordChangedEmail,
};

export default emailService;