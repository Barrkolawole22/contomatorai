import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { env } from '../config/env';

interface TokenPayload {
  userId?: string;
  id?: string;
  email?: string;
  name?: string;
  role?: string;
  [key: string]: any;
}

export const generateToken = (
  payload: TokenPayload,
  expiresIn: string | number = env.JWT_EXPIRES_IN
): string => {
  const options: SignOptions = {
    expiresIn: expiresIn as any,
  };
  return jwt.sign(payload, env.JWT_SECRET, options);
};

export const generateTokenPair = (payload: TokenPayload) => {
  const accessToken = generateToken(payload, env.JWT_EXPIRES_IN);
  const refreshToken = generateToken(payload, env.JWT_REFRESH_EXPIRES_IN);
  return { accessToken, refreshToken };
};

export const verifyToken = (token: string, secret?: string): TokenPayload => {
  try {
    return jwt.verify(token, secret || env.JWT_SECRET) as JwtPayload;
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') throw new Error('Token has expired');
    if (error.name === 'JsonWebTokenError') throw new Error('Invalid token');
    throw new Error('Token verification failed');
  }
};

export const verifyAccessToken = (token: string) => verifyToken(token, env.JWT_SECRET);

export const verifyRefreshToken = (token: string) => {
  const refreshSecret = env.JWT_REFRESH_SECRET || env.JWT_SECRET;
  return verifyToken(token, refreshSecret);
};

export const decodeToken = (token: string): TokenPayload | null => {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch {
    return null;
  }
};

export const isTokenExpired = (token: string): boolean => {
  try {
    const decoded = decodeToken(token);
    if (!decoded?.exp) return true;
    return decoded.exp < Math.floor(Date.now() / 1000);
  } catch {
    return true;
  }
};

export const getTokenExpiration = (token: string): Date | null => {
  try {
    const decoded = decodeToken(token);
    if (!decoded?.exp) return null;
    return new Date(decoded.exp * 1000);
  } catch {
    return null;
  }
};

export const refreshAccessToken = (refreshToken: string): string => {
  try {
    const decoded = verifyRefreshToken(refreshToken);
    const { exp, iat, ...payload } = decoded;
    return generateToken(payload, env.JWT_EXPIRES_IN);
  } catch (error: any) {
    throw new Error(`Token refresh failed: ${error.message}`);
  }
};

export default {
  generateToken, generateTokenPair, verifyToken,
  verifyAccessToken, verifyRefreshToken, decodeToken,
  isTokenExpired, getTokenExpiration, refreshAccessToken,
};