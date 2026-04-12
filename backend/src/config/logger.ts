import winston from 'winston';
import 'winston-daily-rotate-file';
import { env } from './env';

// Define log format
const logFormat = winston.format.printf(
  ({ timestamp, level, message, stack }) => {
    const logMessage = `${timestamp} [${level}]: ${stack || message}`;
    return env.NODE_ENV === 'development' 
      ? logMessage
      : logMessage.replace(/\n/g, ' ');
  }
);

// Configure colors
winston.addColors({
  error: 'red',
  warn: 'yellow',
  info: 'cyan',
  debug: 'white',
  http: 'magenta'
});

// Create transports array
const transports: winston.transport[] = [
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      env.NODE_ENV === 'development' 
        ? winston.format.cli()
        : winston.format.simple()
    )
  })
];

if (env.NODE_ENV !== 'test') {
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: 'logs/application-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      level: 'info',
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      )
    }),
    new winston.transports.DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '90d',
      level: 'error',
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json()
      )
    })
  );
}

// Create logger
const logger = winston.createLogger({
  level: env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    winston.format.errors({ stack: true }),
    env.NODE_ENV === 'production' 
      ? winston.format.json()
      : winston.format.combine(logFormat)
  ),
  transports,
  handleExceptions: true,
  handleRejections: true
});

// HTTP logger
export const httpLogger = winston.createLogger({
  level: 'http',
  transports: [
    new winston.transports.DailyRotateFile({
      filename: 'logs/http-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

export default logger;