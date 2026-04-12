import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';
import { ZodError } from 'zod';
import mongoose from 'mongoose';

interface AppError extends Error {
  statusCode: number;
  isOperational?: boolean;
  errors?: Record<string, unknown>;
}

export const errorHandler = (
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let errors = err.errors;

  // Log error stack in development
  if (process.env.NODE_ENV === 'development') {
    logger.error(`[${req.method}] ${req.path} >> ${err.stack}`);
  }

  // Handle different error types
  if (err instanceof ZodError) {
    statusCode = 400;
    message = 'Validation Error';
    errors = err.flatten();
  } else if (err instanceof mongoose.Error.CastError) {
    statusCode = 400;
    message = `Invalid ${err.path}: ${err.value}`;
  } else if (err instanceof mongoose.Error.ValidationError) {
    statusCode = 400;
    message = 'Validation Error';
    errors = Object.values(err.errors).reduce((acc: Record<string, string>, cur) => {
      acc[cur.path] = cur.message;
      return acc;
    }, {});
  } else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    message = 'Invalid token';
  } else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    message = 'Token expired';
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(errors && { errors }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
};

export const notFound = (req: Request, res: Response, next: NextFunction) => {
  const error = new Error(`Not found - ${req.method} ${req.originalUrl}`);
  (error as AppError).statusCode = 404;
  next(error);
};