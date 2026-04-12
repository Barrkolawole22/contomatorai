import jwt from 'jsonwebtoken';
import { env } from '../config/env';

interface TokenPayload {
  id: string;
  email: string;
  name: string;
  role: string;
}

export const generateTokens = (payload: TokenPayload) => {
  const accessToken = jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: (env.JWT_EXPIRES_IN || '7d') as any,
  });

  const refreshSecret = env.JWT_REFRESH_SECRET || env.JWT_SECRET;
  const refreshToken = jwt.sign(payload, refreshSecret, {
    expiresIn: (env.JWT_REFRESH_EXPIRES_IN || '30d') as any,
  });

  return { accessToken, refreshToken };
};

export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    return jwt.verify(token, env.JWT_SECRET) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid access token');
  }
};

export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    const refreshSecret = env.JWT_REFRESH_SECRET || env.JWT_SECRET;
    return jwt.verify(token, refreshSecret) as TokenPayload;
  } catch (error) {
    throw new Error('Invalid refresh token');
  }
};

export const decodeToken = (token: string): TokenPayload | null => {
  try {
    return jwt.decode(token) as TokenPayload;
  } catch (error) {
    return null;
  }
};