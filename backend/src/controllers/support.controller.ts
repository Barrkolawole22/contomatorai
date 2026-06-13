// backend/src/controllers/support.controller.ts
import { Request, Response } from 'express';
import Ticket from '../models/ticket.model';
import {
  sendSupportTicketNotification,
  sendTicketConfirmationEmail,
} from '../services/email.service';
import logger from '../config/logger';

export const createTicket = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, subject, message, category } = req.body;

    if (!name || !email || !subject || !message) {
      res.status(400).json({
        success: false,
        message: 'Name, email, subject, and message are required.',
      });
      return;
    }

    const ticket = await Ticket.create({ name, email, subject, message, category });

    // Send notification to support inbox (fire-and-forget — don't fail the request if email fails)
    sendSupportTicketNotification(ticket).catch((err) =>
      logger.error('Failed to send support notification email:', err)
    );

    // Send confirmation to the user
    sendTicketConfirmationEmail(email, name, ticket.ticketNumber, subject).catch((err) =>
      logger.error('Failed to send ticket confirmation email:', err)
    );

    res.status(201).json({
      success: true,
      message: 'Your support ticket has been submitted. We will get back to you shortly.',
      ticketNumber: ticket.ticketNumber,
    });
  } catch (error: any) {
    logger.error('Error creating support ticket:', error);

    if (error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        message: Object.values(error.errors)
          .map((e: any) => e.message)
          .join(', '),
      });
      return;
    }

    res.status(500).json({
      success: false,
      message: 'Failed to submit your ticket. Please try again.',
    });
  }
};
