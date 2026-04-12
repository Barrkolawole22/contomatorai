// backend/src/middleware/auth.middleware.ts - FIXED VERSION
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import User from '../models/user.model';

// FIX: Export interface for use in controllers
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

interface JwtPayload {
  userId: string;
  iat?: number;
  exp?: number;
  iss?: string;
}

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Access token is required',
      });
      return;
    }

    const token = authHeader.substring(7);

    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Access token is required',
      });
      return;
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({
          success: false,
          message: 'Token has expired',
          code: 'TOKEN_EXPIRED',
        });
        return;
      }

      if (error instanceof jwt.JsonWebTokenError) {
        res.status(401).json({
          success: false,
          message: 'Invalid token',
          code: 'INVALID_TOKEN',
        });
        return;
      }

      throw error;
    }

    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
      return;
    }

    if (user.status === 'inactive' || user.status === 'suspended') {
      res.status(401).json({
        success: false,
        message: 'Account is inactive or suspended',
        code: 'ACCOUNT_INACTIVE',
      });
      return;
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role || 'user',
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication',
    });
  }
};

export const authenticateToken = authMiddleware;

export const optionalAuthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.substring(7);
    if (!token) return next();

    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayload;
      const user = await User.findById(decoded.userId).select('-password');

      if (user && user.status === 'active') {
        req.user = {
          id: user._id.toString(),
          email: user.email,
          name: user.name,
          role: user.role || 'user',
        };
      }
    } catch (error) {
      console.log('Optional auth failed:', error instanceof Error ? error.message : 'Unknown error');
    }

    next();
  } catch (error) {
    console.error('Optional auth middleware error:', error);
    next();
  }
};

export const requireRole = (roles: string | string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        message: 'Authentication required',
      });
      return;
    }

    const userRole = (req.user as any)?.role;
    const allowedRoles = Array.isArray(roles) ? roles : [roles];

    if (!allowedRoles.includes(userRole)) {
      res.status(403).json({
        success: false,
        message: 'Insufficient permissions',
        required: allowedRoles,
        current: userRole,
      });
      return;
    }

    next();
  };
};

export const requireAdmin = requireRole(['admin', 'super_admin']);
export const requireSuperAdmin = requireRole('super_admin');
export const requireModeratorOrAdmin = requireRole(['moderator', 'admin', 'super_admin']);

export default authMiddleware;