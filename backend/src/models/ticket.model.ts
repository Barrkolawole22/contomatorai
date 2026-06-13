// backend/src/models/ticket.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ITicket extends Document {
  name: string;
  email: string;
  subject: string;
  message: string;
  category: 'general' | 'billing' | 'technical' | 'wordpress' | 'account' | 'other';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  priority: 'low' | 'medium' | 'high';
  ticketNumber: string;
  createdAt: Date;
  updatedAt: Date;
}

const TicketSchema: Schema<ITicket> = new Schema<ITicket>(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      lowercase: true,
      trim: true,
      match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email'],
    },
    subject: {
      type: String,
      required: [true, 'Subject is required'],
      trim: true,
      maxlength: [200, 'Subject cannot exceed 200 characters'],
    },
    message: {
      type: String,
      required: [true, 'Message is required'],
      trim: true,
      maxlength: [5000, 'Message cannot exceed 5000 characters'],
    },
    category: {
      type: String,
      enum: ['general', 'billing', 'technical', 'wordpress', 'account', 'other'],
      default: 'general',
    },
    status: {
      type: String,
      enum: ['open', 'in_progress', 'resolved', 'closed'],
      default: 'open',
    },
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium',
    },
    ticketNumber: {
      type: String,
      unique: true,
    },
  },
  { timestamps: true }
);

// Auto-generate ticket number before save
TicketSchema.pre<ITicket>('save', function (next) {
  if (!this.ticketNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.ticketNumber = `TKT-${timestamp}-${random}`;
  }
  next();
});

TicketSchema.index({ email: 1 });
TicketSchema.index({ status: 1 });
TicketSchema.index({ createdAt: -1 });
TicketSchema.index({ ticketNumber: 1 });

const Ticket: Model<ITicket> =
  mongoose.models.Ticket || mongoose.model<ITicket>('Ticket', TicketSchema);

export default Ticket;
