// backend/src/middleware/admin.middleware.ts
import { Request, Response, NextFunction } from 'express';

// Extend Request to include user
export interface IAuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    [key: string]: any;
  };
}

/**
 * Middleware to check if user is an admin
 * Must be used after authMiddleware
 */
export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authReq = req as IAuthRequest;

    // Check if user exists (from authMiddleware)
    if (!authReq.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    // Check if user is admin (handle both lowercase and uppercase)
    const userRole = authReq.user.role?.toLowerCase();
    if (userRole !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required. This action requires administrator privileges.',
      });
    }

    // User is admin, proceed
    next();
  } catch (error: any) {
    console.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authorization check failed',
      error: error.message,
    });
  }
};

console.log('✅ Admin middleware loaded successfully');