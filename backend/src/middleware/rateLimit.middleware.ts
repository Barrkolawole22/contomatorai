import rateLimit, { RateLimitRequestHandler } from 'express-rate-limit';
import { Request, Response } from 'express';

// Extend Request interface to include rateLimit
interface RateLimitRequest extends Request {
  rateLimit?: {
    limit: number;
    current: number;
    remaining: number;
    resetTime: Date;
  };
}

// General rate limiting middleware
export const rateLimitMiddleware: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  // Custom handler for when rate limit is exceeded
  handler: (req: RateLimitRequest, res: Response) => {
    const resetTime = req.rateLimit?.resetTime ? Math.round(req.rateLimit.resetTime.getTime() / 1000) : undefined;
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      ...(resetTime && { retryAfter: resetTime }),
    });
  },
});

// Stricter rate limiting for authentication endpoints
export const authRateLimitMiddleware: RateLimitRequestHandler = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 auth requests per windowMs
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip successful requests
  skipSuccessfulRequests: true,
  handler: (req: RateLimitRequest, res: Response) => {
    const resetTime = req.rateLimit?.resetTime ? Math.round(req.rateLimit.resetTime.getTime() / 1000) : undefined;
    res.status(429).json({
      success: false,
      message: 'Too many authentication attempts from this IP, please try again later.',
      ...(resetTime && { retryAfter: resetTime }),
    });
  },
});

// Password reset rate limiting
export const passwordResetRateLimitMiddleware: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // limit each IP to 3 password reset requests per hour
  message: {
    success: false,
    message: 'Too many password reset attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: RateLimitRequest, res: Response) => {
    const resetTime = req.rateLimit?.resetTime ? Math.round(req.rateLimit.resetTime.getTime() / 1000) : undefined;
    res.status(429).json({
      success: false,
      message: 'Too many password reset attempts from this IP, please try again later.',
      ...(resetTime && { retryAfter: resetTime }),
    });
  },
});

// Email verification rate limiting
export const emailVerificationRateLimitMiddleware: RateLimitRequestHandler = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 verification requests per hour
  message: {
    success: false,
    message: 'Too many email verification attempts, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req: RateLimitRequest, res: Response) => {
    const resetTime = req.rateLimit?.resetTime ? Math.round(req.rateLimit.resetTime.getTime() / 1000) : undefined;
    res.status(429).json({
      success: false,
      message: 'Too many email verification attempts from this IP, please try again later.',
      ...(resetTime && { retryAfter: resetTime }),
    });
  },
});

export default rateLimitMiddleware;