// backend/src/models/systemSettings.model.ts
import mongoose, { Document, Schema, Model } from 'mongoose';

export interface ISystemSettings extends Document {
  siteName: string;
  siteDescription: string;
  adminEmail: string;
  timezone: string;
  language: string;
  features: {
    registration: boolean;
    emailVerification: boolean;
    adminPanel: boolean;
  };
  limits: {
    maxFileSize: number;
    rateLimitRequests: number;
    rateLimitWindow: number;
    defaultUserCredits: number;
    maxUserCredits: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface ISystemSettingsModel extends Model<ISystemSettings> {
  getInstance(): Promise<ISystemSettings>;
}

const systemSettingsSchema = new Schema<ISystemSettings>(
  {
    siteName:        { type: String, default: 'Content Automation SaaS' },
    siteDescription: { type: String, default: 'AI-powered content generation platform' },
    adminEmail:      { type: String, default: '' },
    timezone:        { type: String, default: 'UTC' },
    language:        { type: String, default: 'en' },
    features: {
      registration:      { type: Boolean, default: true },
      emailVerification: { type: Boolean, default: false },
      adminPanel:        { type: Boolean, default: true },
    },
    limits: {
      maxFileSize:        { type: Number, default: 10485760 },
      rateLimitRequests:  { type: Number, default: 100 },
      rateLimitWindow:    { type: Number, default: 900000 },
      defaultUserCredits: { type: Number, default: 10 },
      maxUserCredits:     { type: Number, default: 10000 },
    },
  },
  { timestamps: true }
);

// Singleton — only ever one document in this collection
systemSettingsSchema.statics.getInstance = async function (): Promise<ISystemSettings> {
  let settings = await this.findOne();
  if (!settings) {
    settings = await this.create({});
  }
  return settings;
};

const SystemSettings = (
  mongoose.models.SystemSettings as ISystemSettingsModel
) || mongoose.model<ISystemSettings, ISystemSettingsModel>('SystemSettings', systemSettingsSchema);

export default SystemSettings;
