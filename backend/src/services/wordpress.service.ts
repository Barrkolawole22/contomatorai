// backend/src/services/wordpress.service.ts - FIXED VERSION
import axios from 'axios';
import logger from '../config/logger';
import { ISite } from '../models/site.model';
import { IContent } from '../models/content.model';

interface WordPressConnectionResult {
  success: boolean;
  user?: {
    id: number;
    name: string;
    roles: string[];
  };
  wordpress_info?: {
    version: string;
    site_url: string;
    site_name: string;
    timezone: string;
    plugin_version?: string;
  };
  hasPlugin?: boolean;
  message?: string;
  error?: string;
  components_status?: {
    scheduler: boolean;
    bulk_publisher: boolean;
    analytics: boolean;
    authentication: boolean;
  };
  api_endpoints?: {
    test_connection: string;
    schedule: string;
    bulk_schedule: string;
    publish: string;
    analytics: string;
  };
}

interface PublishResponse {
  success: boolean;
  postId?: number;
  postUrl?: string;
  editUrl?: string;
  scheduleId?: number;
  operationId?: string;
  message?: string;
  error?: string;
}

class SimplifiedWordPressService {
  private readonly API_TIMEOUT = 15000;
  private readonly PLUGIN_NAMESPACE = 'ai-content-publisher/v1';
  
  async simpleTest(apiUrl: string, username: string, applicationPassword: string): Promise<WordPressConnectionResult> {
    try {
      console.log('=== SIMPLE WORDPRESS TEST ===');
      console.log('Testing URL:', apiUrl);
      console.log('Username:', username);
      console.log('Password provided:', !!applicationPassword);
      console.log('Password length:', applicationPassword?.length || 0);
      
      const authString = Buffer.from(`${username}:${applicationPassword}`).toString('base64');
      console.log('Auth string created, length:', authString.length);
      
      const testUrl = `${apiUrl}/users/me`;
      console.log('Calling WordPress API:', testUrl);
      
      const response = await axios.get(testUrl, {
        headers: {
          'Authorization': `Basic ${authString}`,
          'Content-Type': 'application/json',
          'User-Agent': 'ContentAI-WordPress-Integration/1.0',
        },
        timeout: this.API_TIMEOUT,
        httpsAgent: new (require('https').Agent)({
          rejectUnauthorized: true,
          secureProtocol: 'TLSv1_2_method'
        })
      });
      
      console.log('SUCCESS! Response status:', response.status);
      console.log('User ID:', response.data.id);
      console.log('User name:', response.data.name);
      console.log('User roles:', response.data.roles);
      
      let siteInfo = null;
      try {
        const siteUrl = apiUrl.replace('/wp-json/wp/v2', '');
        const siteResponse = await axios.get(`${siteUrl}/wp-json/`, { timeout: 5000 });
        siteInfo = siteResponse.data;
        console.log('Site info retrieved successfully');
      } catch (siteError) {
        console.log('Could not fetch site info, continuing without it');
      }

      return {
        success: true,
        user: {
          id: response.data.id,
          name: response.data.name,
          roles: response.data.roles || ['subscriber']
        },
        wordpress_info: {
          version: siteInfo?.description || 'WordPress',
          site_url: apiUrl.replace('/wp-json/wp/v2', ''),
          site_name: siteInfo?.name || 'WordPress Site',
          timezone: 'UTC'
        },
        hasPlugin: false,
        message: 'Connection successful via WordPress REST API'
      };
      
    } catch (error: any) {
      console.error('WORDPRESS CONNECTION FAILED!');
      console.error('Error status:', error.response?.status);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      if (error.response?.data) {
        console.error('WordPress error data:', JSON.stringify(error.response.data, null, 2));
      }
      
      let errorMessage = 'Connection test failed';
      
      if (error.code === 'ERR_SSL_SSLV3_ALERT_BAD_RECORD_MAC' || error.code?.includes('SSL')) {
        errorMessage = 'SSL connection error. This may be temporary - please try again in a moment.';
      } else if (error.code === 'ECONNREFUSED') {
        errorMessage = 'Cannot connect to WordPress site. Check the URL and ensure WordPress is running.';
      } else if (error.code === 'ENOTFOUND') {
        errorMessage = 'WordPress site not found. Please check the URL.';
      } else if (error.code === 'ETIMEDOUT') {
        errorMessage = 'Connection timeout. WordPress site is taking too long to respond.';
      } else if (error.response?.status === 401) {
        errorMessage = 'Invalid credentials. Check username and application password.';
      } else if (error.response?.status === 403) {
        errorMessage = 'Permission denied. User does not have sufficient permissions to access WordPress REST API.';
      } else if (error.response?.status === 404) {
        errorMessage = 'WordPress REST API not found. Ensure pretty permalinks are enabled in WordPress Settings.';
      } else if (error.response?.status === 429) {
        errorMessage = 'Rate limit exceeded. Please wait before trying again.';
      }
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async testConnection(site: ISite): Promise<WordPressConnectionResult> {
    return this.simpleTest(site.apiUrl, site.username, site.applicationPassword);
  }

  async validateCredentials(
    apiUrl: string,
    username: string,
    applicationPassword: string
  ): Promise<WordPressConnectionResult> {
    try {
      if (!apiUrl || !username || !applicationPassword) {
        return {
          success: false,
          error: 'Missing required parameters: apiUrl, username, and applicationPassword are all required'
        };
      }

      try {
        new URL(apiUrl);
      } catch (urlError) {
        return {
          success: false,
          error: 'Invalid API URL format'
        };
      }

      return this.simpleTest(apiUrl, username, applicationPassword);

    } catch (error: any) {
      logger.error('Error validating WordPress credentials:', error);
      return {
        success: false,
        error: error.message || 'Unknown error occurred during validation'
      };
    }
  }

  async publishContent(
    site: ISite,
    content: IContent,
    options: {
      status?: 'publish' | 'draft' | 'private';
      publishDate?: Date;
      categories?: string[];
      tags?: string[];
      featuredImage?: string;
    } = {}
  ): Promise<PublishResponse> {
    try {
      logger.info(`Publishing content "${content.title}" to ${site.url}`);

      const authString = Buffer.from(`${site.username}:${site.applicationPassword}`).toString('base64');
      
      const postData: any = {
        title: content.title,
        content: content.content,
        status: options.status || 'publish',
        excerpt: content.excerpt || '',
        meta: {
          ai_content_id: content._id?.toString(),
          ai_keyword: content.keyword,
          ai_generated: content.aiGenerated || true
        }
      };

      // FIX: Handle categories with type guard
      if (options.categories && options.categories.length > 0) {
        const categoryIds = await this.getCategoryIds(site, options.categories);
        if (categoryIds.length > 0) {
          postData['categories'] = categoryIds;
          logger.info(`Publishing with ${categoryIds.length} categories`);
        }
      }

      // FIX: Handle tags with type guard
      if (options.tags && options.tags.length > 0) {
        logger.info(`Processing ${options.tags.length} tags: ${JSON.stringify(options.tags)}`);
        const tagIds = await this.getTagIds(site, options.tags);
        if (tagIds.length > 0) {
          postData['tags'] = tagIds;
          logger.info(`Publishing with ${tagIds.length} tag IDs: ${JSON.stringify(tagIds)}`);
        } else {
          logger.warn('No valid tag IDs found, publishing without tags');
        }
      }

      logger.info(`Publishing post data: ${JSON.stringify({ 
        title: postData.title, 
        status: postData.status, 
        categories: postData.categories,
        tags: postData.tags 
      })}`);

      const response = await axios.post(
        `${site.apiUrl}/posts`,
        postData,
        {
          headers: {
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/json',
          },
          timeout: this.API_TIMEOUT
        }
      );

      logger.info(`Successfully published post with ID: ${response.data.id}`);

      return {
        success: true,
        postId: response.data.id,
        postUrl: response.data.link,
        editUrl: `${site.url}/wp-admin/post.php?post=${response.data.id}&action=edit`,
        message: 'Post published successfully'
      };

    } catch (error: any) {
      logger.error(`Error publishing content to ${site.url}:`, error);
      
      if (error.response?.data) {
        logger.error('WordPress API error details:', JSON.stringify(error.response.data, null, 2));
      }
      
      const errorMessage = error.response?.data?.message || error.message || 'Publishing failed';
      
      return {
        success: false,
        error: errorMessage
      };
    }
  }

  async scheduleContent(
    site: ISite,
    content: IContent,
    publishDate: Date,
    options: {
      categories?: string[];
      tags?: string[];
    } = {}
  ): Promise<PublishResponse> {
    try {
      logger.info(`Scheduling content "${content.title}" for ${publishDate.toISOString()}`);

      const authString = Buffer.from(`${site.username}:${site.applicationPassword}`).toString('base64');
      
      const postData: any = {
        title: content.title,
        content: content.content,
        status: 'future',
        date: publishDate.toISOString(),
        excerpt: content.excerpt || '',
        meta: {
          ai_content_id: content._id?.toString(),
          ai_keyword: content.keyword,
          ai_generated: content.aiGenerated || true
        }
      };

      // FIX: Handle categories with type guard
      if (options.categories && options.categories.length > 0) {
        const categoryIds = await this.getCategoryIds(site, options.categories);
        if (categoryIds.length > 0) {
          postData['categories'] = categoryIds;
        }
      }

      // FIX: Handle tags with type guard
      if (options.tags && options.tags.length > 0) {
        const tagIds = await this.getTagIds(site, options.tags);
        if (tagIds.length > 0) {
          postData['tags'] = tagIds;
          logger.info(`Scheduling with ${tagIds.length} tags`);
        }
      }

      const response = await axios.post(
        `${site.apiUrl}/posts`,
        postData,
        {
          headers: {
            'Authorization': `Basic ${authString}`,
            'Content-Type': 'application/json',
          },
          timeout: this.API_TIMEOUT
        }
      );

      return {
        success: true,
        postId: response.data.id,
        postUrl: response.data.link,
        message: 'Post scheduled successfully'
      };

    } catch (error: any) {
      logger.error(`Error scheduling content:`, error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Scheduling failed'
      };
    }
  }

  async getSiteTaxonomies(site: ISite): Promise<{
    success: boolean;
    categories: Array<{ id: number; name: string; slug: string; count: number }>;
    tags: Array<{ id: number; name: string; slug: string; count: number }>;
    error?: string;
  }> {
    try {
      const authString = Buffer.from(`${site.username}:${site.applicationPassword}`).toString('base64');
      
      const [categoriesResponse, tagsResponse] = await Promise.all([
        axios.get(`${site.apiUrl}/categories?per_page=100`, {
          headers: { 'Authorization': `Basic ${authString}` },
          timeout: 10000
        }),
        axios.get(`${site.apiUrl}/tags?per_page=100`, {
          headers: { 'Authorization': `Basic ${authString}` },
          timeout: 10000
        })
      ]);

      return {
        success: true,
        categories: categoriesResponse.data.map((cat: any) => ({
          id: cat.id,
          name: cat.name,
          slug: cat.slug,
          count: cat.count || 0
        })),
        tags: tagsResponse.data.map((tag: any) => ({
          id: tag.id,
          name: tag.name,
          slug: tag.slug,
          count: tag.count || 0
        }))
      };

    } catch (error: any) {
      logger.error('Error fetching taxonomies:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to fetch taxonomies',
        categories: [],
        tags: []
      };
    }
  }

  async getRecentPosts(site: ISite, limit = 10): Promise<Array<{
    id: number;
    title: string;
    excerpt: string;
    date: string;
    modified: string;
    link: string;
    status: string;
    categories: number[];
    tags: number[];
    author: string;
  }>> {
    try {
      const authString = Buffer.from(`${site.username}:${site.applicationPassword}`).toString('base64');
      
      const response = await axios.get(
        `${site.apiUrl}/posts?per_page=${limit}&_embed`,
        {
          headers: {
            'Authorization': `Basic ${authString}`,
          },
          timeout: 10000
        }
      );

      return response.data.map((post: any) => ({
        id: post.id,
        title: post.title.rendered,
        excerpt: post.excerpt.rendered,
        date: post.date,
        modified: post.modified,
        link: post.link,
        status: post.status,
        categories: post.categories,
        tags: post.tags,
        author: post._embedded?.author?.[0]?.name || '',
      }));

    } catch (error: any) {
      logger.error('Error fetching WordPress posts:', error);
      throw new Error(`Failed to fetch posts from WordPress: ${error.response?.data?.message || error.message}`);
    }
  }

  private async getCategoryIds(site: ISite, categoryNames: string[]): Promise<number[]> {
    try {
      const taxonomies = await this.getSiteTaxonomies(site);
      if (taxonomies.success) {
        return categoryNames
          .map(name => {
            const category = taxonomies.categories.find(
              (cat: any) => cat.name.toLowerCase() === name.toLowerCase()
            );
            return category ? category.id : null;
          })
          .filter((id): id is number => id !== null);
      }
      return [];
    } catch (error) {
      logger.error('Error getting category IDs:', error);
      return [];
    }
  }

  private async getTagIds(site: ISite, tagNames: string[]): Promise<number[]> {
    try {
      const authString = Buffer.from(`${site.username}:${site.applicationPassword}`).toString('base64');
      const tagIds: number[] = [];

      for (const tagName of tagNames) {
        if (!tagName || !tagName.trim()) {
          logger.warn('Skipping empty tag name');
          continue;
        }

        try {
          const searchResponse = await axios.get(
            `${site.apiUrl}/tags?search=${encodeURIComponent(tagName.trim())}`,
            {
              headers: { 'Authorization': `Basic ${authString}` },
              timeout: 5000
            }
          );

          const exactMatch = searchResponse.data.find(
            (tag: any) => tag.name.toLowerCase() === tagName.trim().toLowerCase()
          );

          if (exactMatch) {
            tagIds.push(exactMatch.id);
            logger.info(`Found existing tag: "${tagName}" (ID: ${exactMatch.id})`);
          } else {
            logger.info(`Tag "${tagName}" not found, creating...`);
            const createResponse = await axios.post(
              `${site.apiUrl}/tags`,
              { name: tagName.trim() },
              {
                headers: {
                  'Authorization': `Basic ${authString}`,
                  'Content-Type': 'application/json'
                },
                timeout: 5000
              }
            );

            tagIds.push(createResponse.data.id);
            logger.info(`Created new tag: "${tagName}" (ID: ${createResponse.data.id})`);
          }
        } catch (tagError: any) {
          logger.error(`Error processing tag "${tagName}":`, tagError.message);
          if (tagError.response?.data) {
            logger.error('Tag error details:', JSON.stringify(tagError.response.data, null, 2));
          }
        }
      }

      logger.info(`Successfully processed ${tagIds.length} tags out of ${tagNames.length} requested`);
      return tagIds;

    } catch (error: any) {
      logger.error('Error getting tag IDs:', error);
      return [];
    }
  }

  async getCategories(site: ISite): Promise<Array<{
    id: number;
    name: string;
    slug: string;
    count: number;
  }>> {
    try {
      const taxonomies = await this.getSiteTaxonomies(site);
      return taxonomies.categories;
    } catch (error: any) {
      logger.error('Error fetching WordPress categories:', error);
      throw new Error(`Failed to fetch categories from WordPress: ${error.message}`);
    }
  }

  async getTags(site: ISite): Promise<Array<{
    id: number;
    name: string;
    slug: string;
    count: number;
  }>> {
    try {
      const taxonomies = await this.getSiteTaxonomies(site);
      return taxonomies.tags;
    } catch (error: any) {
      logger.error('Error fetching WordPress tags:', error);
      throw new Error(`Failed to fetch tags from WordPress: ${error.message}`);
    }
  }
}

export default new SimplifiedWordPressService();