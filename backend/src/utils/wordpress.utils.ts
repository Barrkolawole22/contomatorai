import axios, { AxiosResponse } from 'axios';
import logger from '../config/logger';

export interface WordPressConfig {
  url: string;
  username: string;
  applicationPassword: string;
}

export interface WordPressPost {
  id?: number;
  title: {
    rendered?: string;
    raw?: string;
  };
  content: {
    rendered?: string;
    raw?: string;
  };
  excerpt?: {
    rendered?: string;
    raw?: string;
  };
  status: 'publish' | 'draft' | 'future' | 'private';
  categories?: number[];
  tags?: number[];
  featured_media?: number;
  slug?: string;
  meta?: {
    _yoast_wpseo_title?: string;
    _yoast_wpseo_metadesc?: string;
  };
  date?: string;
  date_gmt?: string;
}

export interface WordPressCategory {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
}

export interface WordPressTag {
  id: number;
  name: string;
  slug: string;
  description: string;
  count: number;
}

export interface WordPressMedia {
  id: number;
  title: { rendered: string };
  source_url: string;
  alt_text: string;
  media_type: string;
  mime_type: string;
}

export class WordPressUtils {
  private config: WordPressConfig;
  private baseURL: string;
  private authHeader: string;

  constructor(config: WordPressConfig) {
    this.config = config;
    this.baseURL = `${config.url.replace(/\/$/, '')}/wp-json/wp/v2`;
    this.authHeader = `Basic ${Buffer.from(
      `${config.username}:${config.applicationPassword}`
    ).toString('base64')}`;
  }

  // Test connection to WordPress site
  async testConnection(): Promise<{ success: boolean; message: string; data?: any }> {
    try {
      const response = await axios.get(`${this.baseURL}/users/me`, {
        headers: {
          Authorization: this.authHeader,
        },
        timeout: 10000,
      });

      return {
        success: true,
        message: 'Connection successful',
        data: {
          user: response.data.name,
          roles: response.data.roles,
          site: this.config.url,
        },
      };
    } catch (error: any) {
      logger.error('WordPress connection test failed:', error);
      
      if (error.response?.status === 401) {
        return {
          success: false,
          message: 'Authentication failed. Please check your credentials.',
        };
      } else if (error.response?.status === 404) {
        return {
          success: false,
          message: 'WordPress REST API not found. Please check the site URL.',
        };
      } else if (error.code === 'ENOTFOUND') {
        return {
          success: false,
          message: 'Site not found. Please check the URL.',
        };
      } else {
        return {
          success: false,
          message: error.message || 'Connection failed',
        };
      }
    }
  }

  // Create a new post
  async createPost(postData: WordPressPost): Promise<WordPressPost> {
    try {
      const response: AxiosResponse<WordPressPost> = await axios.post(
        `${this.baseURL}/posts`,
        postData,
        {
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`WordPress post created: ${response.data.id}`);
      return response.data;
    } catch (error: any) {
      logger.error('Error creating WordPress post:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to create WordPress post'
      );
    }
  }

  // Update an existing post
  async updatePost(postId: number, postData: Partial<WordPressPost>): Promise<WordPressPost> {
    try {
      const response: AxiosResponse<WordPressPost> = await axios.post(
        `${this.baseURL}/posts/${postId}`,
        postData,
        {
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`WordPress post updated: ${postId}`);
      return response.data;
    } catch (error: any) {
      logger.error('Error updating WordPress post:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to update WordPress post'
      );
    }
  }

  // Get post by ID
  async getPost(postId: number): Promise<WordPressPost> {
    try {
      const response: AxiosResponse<WordPressPost> = await axios.get(
        `${this.baseURL}/posts/${postId}`,
        {
          headers: {
            Authorization: this.authHeader,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Error fetching WordPress post:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to fetch WordPress post'
      );
    }
  }

  // Delete a post
  async deletePost(postId: number): Promise<boolean> {
    try {
      await axios.delete(`${this.baseURL}/posts/${postId}`, {
        headers: {
          Authorization: this.authHeader,
        },
      });

      logger.info(`WordPress post deleted: ${postId}`);
      return true;
    } catch (error: any) {
      logger.error('Error deleting WordPress post:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to delete WordPress post'
      );
    }
  }

  // Get all categories
  async getCategories(): Promise<WordPressCategory[]> {
    try {
      const response: AxiosResponse<WordPressCategory[]> = await axios.get(
        `${this.baseURL}/categories`,
        {
          headers: {
            Authorization: this.authHeader,
          },
          params: {
            per_page: 100,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Error fetching WordPress categories:', error);
      throw new Error('Failed to fetch categories');
    }
  }

  // Create a new category
  async createCategory(name: string, description?: string): Promise<WordPressCategory> {
    try {
      const response: AxiosResponse<WordPressCategory> = await axios.post(
        `${this.baseURL}/categories`,
        {
          name,
          description: description || '',
        },
        {
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`WordPress category created: ${response.data.name}`);
      return response.data;
    } catch (error: any) {
      logger.error('Error creating WordPress category:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to create category'
      );
    }
  }

  // Get all tags
  async getTags(): Promise<WordPressTag[]> {
    try {
      const response: AxiosResponse<WordPressTag[]> = await axios.get(
        `${this.baseURL}/tags`,
        {
          headers: {
            Authorization: this.authHeader,
          },
          params: {
            per_page: 100,
          },
        }
      );

      return response.data;
    } catch (error: any) {
      logger.error('Error fetching WordPress tags:', error);
      throw new Error('Failed to fetch tags');
    }
  }

  // Create a new tag
  async createTag(name: string, description?: string): Promise<WordPressTag> {
    try {
      const response: AxiosResponse<WordPressTag> = await axios.post(
        `${this.baseURL}/tags`,
        {
          name,
          description: description || '',
        },
        {
          headers: {
            Authorization: this.authHeader,
            'Content-Type': 'application/json',
          },
        }
      );

      logger.info(`WordPress tag created: ${response.data.name}`);
      return response.data;
    } catch (error: any) {
      logger.error('Error creating WordPress tag:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to create tag'
      );
    }
  }

  // Upload media file
  async uploadMedia(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string
  ): Promise<WordPressMedia> {
    try {
      const response: AxiosResponse<WordPressMedia> = await axios.post(
        `${this.baseURL}/media`,
        fileBuffer,
        {
          headers: {
            Authorization: this.authHeader,
            'Content-Type': mimeType,
            'Content-Disposition': `attachment; filename="${filename}"`,
          },
        }
      );

      logger.info(`WordPress media uploaded: ${response.data.id}`);
      return response.data;
    } catch (error: any) {
      logger.error('Error uploading WordPress media:', error);
      throw new Error(
        error.response?.data?.message || 'Failed to upload media'
      );
    }
  }

  // Get site information
  async getSiteInfo(): Promise<any> {
    try {
      const response = await axios.get(`${this.config.url}/wp-json`, {
        timeout: 5000,
      });

      return {
        name: response.data.name,
        description: response.data.description,
        url: response.data.home,
        gmt_offset: response.data.gmt_offset,
        timezone_string: response.data.timezone_string,
      };
    } catch (error: any) {
      logger.error('Error fetching WordPress site info:', error);
      throw new Error('Failed to fetch site information');
    }
  }

  // Find or create category by name
  async findOrCreateCategory(name: string): Promise<WordPressCategory> {
    try {
      const categories = await this.getCategories();
      const existingCategory = categories.find(
        cat => cat.name.toLowerCase() === name.toLowerCase()
      );

      if (existingCategory) {
        return existingCategory;
      }

      return await this.createCategory(name);
    } catch (error: any) {
      logger.error('Error finding/creating category:', error);
      throw error;
    }
  }

  // Find or create tag by name
  async findOrCreateTag(name: string): Promise<WordPressTag> {
    try {
      const tags = await this.getTags();
      const existingTag = tags.find(
        tag => tag.name.toLowerCase() === name.toLowerCase()
      );

      if (existingTag) {
        return existingTag;
      }

      return await this.createTag(name);
    } catch (error: any) {
      logger.error('Error finding/creating tag:', error);
      throw error;
    }
  }

  // Get posts with pagination
  async getPosts(params: {
    page?: number;
    per_page?: number;
    status?: string;
    search?: string;
  } = {}): Promise<{
    posts: WordPressPost[];
    totalPages: number;
    total: number;
  }> {
    try {
      const response: AxiosResponse<WordPressPost[]> = await axios.get(
        `${this.baseURL}/posts`,
        {
          headers: {
            Authorization: this.authHeader,
          },
          params: {
            page: params.page || 1,
            per_page: params.per_page || 10,
            status: params.status || 'any',
            search: params.search || '',
          },
        }
      );

      return {
        posts: response.data,
        totalPages: parseInt(response.headers['x-wp-totalpages'] || '1'),
        total: parseInt(response.headers['x-wp-total'] || '0'),
      };
    } catch (error: any) {
      logger.error('Error fetching WordPress posts:', error);
      throw new Error('Failed to fetch posts');
    }
  }

  // Schedule a post for future publication
  async schedulePost(postData: WordPressPost, publishDate: Date): Promise<WordPressPost> {
    const scheduledPost = {
      ...postData,
      status: 'future' as const,
      date: publishDate.toISOString(),
    };

    return await this.createPost(scheduledPost);
  }

  // Convert content format for WordPress
  static formatContentForWordPress(content: string): string {
    // Convert common HTML entities and ensure proper formatting
    return content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Extract featured image from content
  static extractFeaturedImage(content: string): string | null {
    const imgRegex = /<img[^>]*src="([^"]*)"[^>]*>/i;
    const match = content.match(imgRegex);
    return match ? match[1] : null;
  }

  // Generate WordPress-compatible excerpt
  static generateExcerpt(content: string, maxLength: number = 155): string {
    const plainText = content
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (plainText.length <= maxLength) {
      return plainText;
    }

    const truncated = plainText.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    
    return lastSpace > 0 
      ? plainText.substring(0, lastSpace) + '...'
      : truncated + '...';
  }

  // Validate WordPress post data
  static validatePostData(postData: WordPressPost): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!postData.title?.raw && !postData.title?.rendered) {
      errors.push('Post title is required');
    }

    if (!postData.content?.raw && !postData.content?.rendered) {
      errors.push('Post content is required');
    }

    if (!['publish', 'draft', 'future', 'private'].includes(postData.status)) {
      errors.push('Invalid post status');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}