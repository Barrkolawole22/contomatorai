// backend/src/middleware/admin.middleware.ts
import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

export interface IAuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    [key: string]: any;
  };
}

/**
 * Middleware to check if user is an admin or super_admin.
 * Must be used after authMiddleware.
 */
export const adminMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const authReq = req as IAuthRequest;

    if (!authReq.user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
    }

    const userRole = authReq.user.role?.toLowerCase();
    if (userRole !== 'admin' && userRole !== 'super_admin') {
      return res.status(403).json({
        success: false,
        message: 'Admin access required. This action requires administrator privileges.',
      });
    }

    next();
  } catch (error: any) {
    logger.error('Admin middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authorization check failed',
      error: error.message,
    });
  }
};