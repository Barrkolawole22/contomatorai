// backend/src/models/oauth-token.model.ts
import mongoose, { Document, Schema } from 'mongoose';

export interface IOAuthToken extends Document {
  userId: mongoose.Types.ObjectId;
  siteId: mongoose.Types.ObjectId;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt: Date;
  scope: string[];
  siteUrl: string;
  siteName: string;
  wpUserId: number;
  wpUserEmail: string;
  wpUserRoles: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const OAuthTokenSchema = new Schema({
  userId: { 
    type: Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  siteId: { 
    type: Schema.Types.ObjectId, 
    ref: 'Site', 
    required: true 
  },
  accessToken: { 
    type: String, 
    required: true 
  },
  refreshToken: { 
    type: String 
  },
  tokenType: { 
    type: String, 
    default: 'bearer' 
  },
  expiresAt: { 
    type: Date, 
    required: true 
  },
  scope: [{ 
    type: String 
  }],
  siteUrl: { 
    type: String, 
    required: true 
  },
  siteName: { 
    type: String, 
    required: true 
  },
  wpUserId: { 
    type: Number, 
    required: true 
  },
  wpUserEmail: { 
    type: String, 
    required: true 
  },
  wpUserRoles: [{ 
    type: String 
  }],
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, {
  timestamps: true
});

// Index for faster queries
OAuthTokenSchema.index({ userId: 1, siteId: 1 });
OAuthTokenSchema.index({ accessToken: 1 });

export default mongoose.model<IOAuthToken>('OAuthToken', OAuthTokenSchema);