// backend/src/routes/profile.routes.ts
import express from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { authMiddleware } from '../middleware/auth.middleware';
import {
  getProfile,
  updateProfile,
  uploadAvatar,
  changePassword,
  deleteAccount,
  exportUserData,
  updatePreferences,
  getLoginHistory
} from '../controllers/profile.controller';

const router = express.Router();

// Apply authentication to all profile routes
router.use(authMiddleware);

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, `avatar-${(req as any).user?.id}-${uniqueSuffix}${extension}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  }
});

// =============================================
// PROFILE ROUTES
// =============================================

// Get user profile
router.get('/', getProfile);

// Update user profile
router.put('/', updateProfile);

// Upload avatar
router.post('/avatar', upload.single('avatar'), uploadAvatar);

// Update preferences
router.put('/preferences', updatePreferences);

// Get login history
router.get('/login-history', getLoginHistory);

// Export user data
router.get('/export', exportUserData);

// Delete account
router.delete('/', deleteAccount);

// Error handling middleware for multer
router.use((error: any, req: any, res: any, next: any) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.'
      });
    }
  }
  
  if (error.message === 'Invalid file type. Only images are allowed.') {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  console.error('Profile route error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error'
  });
});

export default router;