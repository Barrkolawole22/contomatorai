// backend/src/services/email.service.ts
import nodemailer from 'nodemailer';
import { env } from '../config/env';
import logger from '../config/logger';

// 1. Create a Nodemailer Transporter
// This is the object that can send emails
const transporter = nodemailer.createTransport({
  host: env.EMAIL_HOST,
  port: env.EMAIL_PORT,
  secure: env.EMAIL_SECURE, // true for port 465, false for other ports
  service: env.EMAIL_SERVICE || undefined,
  auth: {
    user: env.EMAIL_USER,
    pass: env.EMAIL_PASS,
  },
});

// 2. Verify transporter connection on startup (optional but recommended)
if (env.NODE_ENV !== 'test') {
  transporter.verify((error, success) => {
    if (error) {
      logger.error('Email transporter verification failed:', error);
    } else {
      logger.info('Email transporter is configured and ready to send emails.');
    }
  });
}

/**
 * A generic function to send an email
 * @param to Recipient's email address
 * @param subject The subject line
 * @param html The HTML content of the email
 */
const sendEmail = async (to: string, subject: string, html: string) => {
  if (!env.EMAIL_FROM) {
    logger.error('EMAIL_FROM is not defined. Email sending skipped.');
    // In production, you might want to throw an error
    // For now, we'll just log and return to avoid breaking flows
    return;
  }

  // ======================================================
  // === MODIFICATION START: Use Name and Address
  // ======================================================
  const mailOptions = {
    from: {
      name: env.EMAIL_FROM_NAME || 'ContentAI Pro',
      address: env.EMAIL_FROM,
    },
    to,
    subject,
    html,
  };
  // ======================================================
  // === MODIFICATION END
  // ======================================================

  try {
    const info = await transporter.sendMail(mailOptions);
    logger.info(`Email sent successfully to ${to}: ${info.messageId}`);
  } catch (error) {
    logger.error(`Failed to send email to ${to}:`, error);
    throw new Error('Email sending failed');
  }
};

/**
 * Sends a registration verification email
 * @param to Recipient's email address
 * @param token The verification token
 */
export const sendVerificationEmail = async (to: string, token: string) => {
  // Use the FRONTEND_URL from your env.ts
  const verificationUrl = `${env.FRONTEND_URL}/auth/verify-email?token=${token}`;
  
  const subject = 'Welcome to ContentAI Pro! Please Verify Your Email';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Welcome to ContentAI Pro!</h2>
      <p>Thank you for registering. Please click the link below to verify your email address:</p>
      <p>
        <a href="${verificationUrl}" style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Verify Email
        </a>
      </p>
      <p>If you did not create an account, please ignore this email.</p>
      <p>Link: <a href="${verificationUrl}">${verificationUrl}</a></p>
    </div>
  `;

  await sendEmail(to, subject, html);
};

/**
 * Sends a password reset email
 * @param to Recipient's email address
 * @param token The password reset token
 */
export const sendPasswordResetEmail = async (to: string, token: string) => {
  // Use the FRONTEND_URL from your env.ts
  const resetUrl = `${env.FRONTEND_URL}/auth/reset-password?token=${token}`;

  const subject = 'ContentAI Pro - Password Reset Request';
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2>Password Reset Request</h2>
      <p>You are receiving this email because you (or someone else) requested a password reset for your account.</p>
      <p>Please click the link below to set a new password:</p>
      <p>
        <a href="${resetUrl}" style="background-color: #dc3545; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
          Reset Password
        </a>
      </p>
      <p>This link will expire in 1 hour.</p>
      <p>If you did not request this, please ignore this email and your password will remain unchanged.</p>
      <p>Link: <a href="${resetUrl}">${resetUrl}</a></p>
    </div>
  `;

  await sendEmail(to, subject, html);
};

// Export as a service object
const emailService = {
  sendEmail,
  sendVerificationEmail,
  sendPasswordResetEmail,
};

export default emailService;