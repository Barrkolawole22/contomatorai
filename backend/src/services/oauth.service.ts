// backend/src/services/oauth.service.ts
import axios from 'axios';
import crypto from 'crypto';
import OAuthToken from '../models/oauth-token.model';
import Site from '../models/site.model';
import logger from '../config/logger';

interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  userInfoEndpoint: string;
}

interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface WordPressUserInfo {
  id: number;
  username: string;
  email: string;
  roles: string[];
  capabilities: string[];
}

class OAuthService {
  private config: OAuthConfig;

  constructor() {
    this.config = {
      clientId: process.env.WORDPRESS_OAUTH_CLIENT_ID || 'contentai-pro',
      clientSecret: process.env.WORDPRESS_OAUTH_CLIENT_SECRET || '',
      redirectUri: `${process.env.APP_URL}/oauth/callback`,
      authorizationEndpoint: '/oauth/authorize',
      tokenEndpoint: '/oauth/token',
      userInfoEndpoint: '/wp-json/wp/v2/users/me'
    };
  }

  /**
   * Generate OAuth authorization URL
   */
  generateAuthUrl(siteUrl: string, userId: string, stateData?: any): string {
    const state = this.generateState(userId, stateData);
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: 'global',
      state: state
    });

    return `${siteUrl}${this.config.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Generate secure state parameter
   */
  private generateState(userId: string, data: any = {}): string {
    const stateData = {
      userId,
      timestamp: Date.now(),
      ...data
    };
    
    const stateString = JSON.stringify(stateData);
    const hmac = crypto.createHmac('sha256', this.config.clientSecret);
    hmac.update(stateString);
    const signature = hmac.digest('hex');
    
    return Buffer.from(JSON.stringify({ data: stateData, sig: signature })).toString('base64');
  }

  /**
   * Verify state parameter
   */
  verifyState(state: string): any {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
      const hmac = crypto.createHmac('sha256', this.config.clientSecret);
      hmac.update(JSON.stringify(decoded.data));
      const signature = hmac.digest('hex');
      
      if (signature !== decoded.sig) {
        throw new Error('Invalid state signature');
      }
      
      // Check if state is expired (5 minutes)
      if (Date.now() - decoded.data.timestamp > 300000) {
        throw new Error('State expired');
      }
      
      return decoded.data;
    } catch (error) {
      throw new Error('Invalid state parameter');
    }
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(siteUrl: string, code: string): Promise<OAuthTokenResponse> {
    try {
      const response = await axios.post(
        `${siteUrl}${this.config.tokenEndpoint}`,
        new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: this.config.redirectUri
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('OAuth token exchange failed:', error.response?.data || error.message);
      throw new Error(`Token exchange failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Get WordPress user info using access token
   */
  async getUserInfo(siteUrl: string, accessToken: string): Promise<WordPressUserInfo> {
    try {
      const response = await axios.get(
        `${siteUrl}${this.config.userInfoEndpoint}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          },
          timeout: 5000
        }
      );

      return {
        id: response.data.id,
        username: response.data.username,
        email: response.data.email,
        roles: response.data.roles || [],
        capabilities: response.data.capabilities || []
      };
    } catch (error: any) {
      logger.error('Failed to get user info:', error.response?.data || error.message);
      throw new Error(`Failed to get user info: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Save OAuth tokens to database
   */
  async saveTokens(
    userId: string, 
    siteData: any, 
    tokenResponse: OAuthTokenResponse, 
    userInfo: WordPressUserInfo
  ) {
    const expiresAt = new Date(Date.now() + (tokenResponse.expires_in * 1000));
    
    // Check if token already exists for this site
    const existingToken = await OAuthToken.findOne({ 
      userId, 
      siteUrl: siteData.url 
    });

    if (existingToken) {
      existingToken.accessToken = tokenResponse.access_token;
      existingToken.refreshToken = tokenResponse.refresh_token;
      existingToken.expiresAt = expiresAt;
      existingToken.wpUserEmail = userInfo.email;
      existingToken.wpUserRoles = userInfo.roles;
      await existingToken.save();
      return existingToken;
    }

    // Create new site record if it doesn't exist
    let site = await Site.findOne({ url: siteData.url, owner: userId });
    if (!site) {
      site = new Site({
        name: siteData.name || userInfo.username + "'s Site",
        url: siteData.url,
        apiUrl: `${siteData.url}/wp-json`,
        username: userInfo.username,
        owner: userId,
        isActive: true,
        connectionType: 'oauth'
      });
      await site.save();
    }

    // Create OAuth token record
    const oauthToken = new OAuthToken({
      userId,
      siteId: site._id,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenType: tokenResponse.token_type,
      expiresAt,
      scope: tokenResponse.scope ? tokenResponse.scope.split(' ') : [],
      siteUrl: siteData.url,
      siteName: site.name,
      wpUserId: userInfo.id,
      wpUserEmail: userInfo.email,
      wpUserRoles: userInfo.roles
    });

    await oauthToken.save();
    return oauthToken;
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string, siteUrl: string): Promise<OAuthTokenResponse> {
    try {
      const response = await axios.post(
        `${siteUrl}${this.config.tokenEndpoint}`,
        new URLSearchParams({
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          },
          timeout: 10000
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Token refresh failed:', error.response?.data || error.message);
      throw new Error(`Token refresh failed: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Validate OAuth token and refresh if needed
   */
  async validateToken(userId: string, siteUrl: string): Promise<string> {
    const oauthToken = await OAuthToken.findOne({ 
      userId, 
      siteUrl,
      isActive: true 
    });

    if (!oauthToken) {
      throw new Error('No OAuth token found for this site');
    }

    // Check if token is expired or about to expire (5 minutes buffer)
    if (oauthToken.expiresAt.getTime() - Date.now() < 300000) {
      if (oauthToken.refreshToken) {
        try {
          const newTokens = await this.refreshToken(oauthToken.refreshToken, siteUrl);
          oauthToken.accessToken = newTokens.access_token;
          oauthToken.refreshToken = newTokens.refresh_token || oauthToken.refreshToken;
          oauthToken.expiresAt = new Date(Date.now() + (newTokens.expires_in * 1000));
          await oauthToken.save();
        } catch (error) {
          oauthToken.isActive = false;
          await oauthToken.save();
          throw new Error('Token refresh failed, please reconnect');
        }
      } else {
        oauthToken.isActive = false;
        await oauthToken.save();
        throw new Error('Token expired and no refresh token available');
      }
    }

    return oauthToken.accessToken;
  }
}

export default new OAuthService();