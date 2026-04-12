import logger from '../config/logger';
import { IContent } from '../models/content.model';
import { ISite } from '../models/site.model';

interface NotificationOptions {
  email?: boolean;
  push?: boolean;
  webhook?: boolean;
}

interface WebhookPayload {
  event: string;
  data: {
    contentId: string;
    siteId: string;
    userId: string;
    status: string;
    timestamp: Date;
    details?: any;
  };
}

class NotificationService {
  /**
   * Send publishing notification to user
   */
  async sendPublishingNotification(
    userId: string,
    content: IContent,
    site: ISite,
    status: 'published' | 'scheduled' | 'failed',
    options: NotificationOptions = { email: true }
  ): Promise<void> {
    try {
      const notification = {
        userId,
        type: 'publishing',
        status,
        content: {
          id: content._id,
          title: content.title,
          keyword: content.keyword,
        },
        site: {
          id: site._id,
          name: site.name,
          url: site.url,
        },
        timestamp: new Date(),
      };

      // Log the notification (you can replace this with actual notification logic)
      logger.info('Publishing notification:', notification);

      // Here you would implement actual notification sending:
      // - Email notifications
      // - Push notifications
      // - Webhook calls
      // - In-app notifications

      if (options.email) {
        await this.sendEmailNotification(notification);
      }

      if (options.push) {
        await this.sendPushNotification(notification);
      }

      if (options.webhook) {
        await this.sendWebhookNotification(notification);
      }

    } catch (error) {
      logger.error('Error sending publishing notification:', error);
      // Don't throw error - notifications shouldn't break the main flow
    }
  }

  /**
   * Send bulk operation notification
   */
  async sendBulkOperationNotification(
    userId: string,
    operationId: string,
    totalItems: number,
    processedItems: number,
    failedItems: number,
    status: 'completed' | 'failed' | 'partial'
  ): Promise<void> {
    try {
      const notification = {
        userId,
        type: 'bulk_operation',
        operationId,
        stats: {
          total: totalItems,
          processed: processedItems,
          failed: failedItems,
        },
        status,
        timestamp: new Date(),
      };

      logger.info('Bulk operation notification:', notification);

      // Implement actual notification logic here
      await this.sendEmailNotification(notification);

    } catch (error) {
      logger.error('Error sending bulk operation notification:', error);
    }
  }

  /**
   * Send content generation notification
   */
  async sendContentGenerationNotification(
    userId: string,
    content: IContent,
    status: 'completed' | 'failed'
  ): Promise<void> {
    try {
      const notification = {
        userId,
        type: 'content_generation',
        content: {
          id: content._id,
          title: content.title,
          keyword: content.keyword,
          wordCount: content.wordCount,
        },
        status,
        timestamp: new Date(),
      };

      logger.info('Content generation notification:', notification);

      // Implement actual notification logic here
      await this.sendEmailNotification(notification);

    } catch (error) {
      logger.error('Error sending content generation notification:', error);
    }
  }

  /**
   * Send system notification (admin alerts, etc.)
   */
  async sendSystemNotification(
    type: 'error' | 'warning' | 'info',
    message: string,
    details?: any
  ): Promise<void> {
    try {
      const notification = {
        type: 'system',
        level: type,
        message,
        details,
        timestamp: new Date(),
      };

      logger.info('System notification:', notification);

      // Implement actual notification logic here
      // Could send to admin dashboard, Slack, email, etc.

    } catch (error) {
      logger.error('Error sending system notification:', error);
    }
  }

  /**
   * Private method to send email notifications
   */
  private async sendEmailNotification(notification: any): Promise<void> {
    try {
      // Implement email sending logic here
      // You could use services like:
      // - SendGrid
      // - AWS SES
      // - Nodemailer
      // - Resend
      
      logger.debug('Email notification would be sent:', {
        to: `user_${notification.userId}@example.com`, // You'd get real email from user record
        subject: this.getEmailSubject(notification),
        notification,
      });

      // Example implementation:
      // await emailService.send({
      //   to: userEmail,
      //   subject: this.getEmailSubject(notification),
      //   template: this.getEmailTemplate(notification),
      //   data: notification,
      // });

    } catch (error) {
      logger.error('Error sending email notification:', error);
    }
  }

  /**
   * Private method to send push notifications
   */
  private async sendPushNotification(notification: any): Promise<void> {
    try {
      // Implement push notification logic here
      // You could use services like:
      // - Firebase Cloud Messaging
      // - Apple Push Notification service
      // - OneSignal
      
      logger.debug('Push notification would be sent:', notification);

    } catch (error) {
      logger.error('Error sending push notification:', error);
    }
  }

  /**
   * Private method to send webhook notifications
   */
  private async sendWebhookNotification(notification: any): Promise<void> {
    try {
      // Implement webhook logic here
      // Send HTTP POST to user's configured webhook URL
      
      const webhookPayload: WebhookPayload = {
        event: `content.${notification.type}.${notification.status}`,
        data: {
          contentId: notification.content?.id || '',
          siteId: notification.site?.id || '',
          userId: notification.userId,
          status: notification.status,
          timestamp: notification.timestamp,
          details: notification,
        },
      };

      logger.debug('Webhook notification would be sent:', webhookPayload);

      // Example implementation:
      // await axios.post(userWebhookUrl, webhookPayload, {
      //   headers: {
      //     'Content-Type': 'application/json',
      //     'X-Webhook-Signature': generateSignature(webhookPayload),
      //   },
      //   timeout: 5000,
      // });

    } catch (error) {
      logger.error('Error sending webhook notification:', error);
    }
  }

  /**
   * Get email subject based on notification type
   */
  private getEmailSubject(notification: any): string {
    switch (notification.type) {
      case 'publishing':
        switch (notification.status) {
          case 'published':
            return `✅ Content Published: ${notification.content.title}`;
          case 'scheduled':
            return `📅 Content Scheduled: ${notification.content.title}`;
          case 'failed':
            return `❌ Publishing Failed: ${notification.content.title}`;
          default:
            return 'Content Update';
        }
      case 'bulk_operation':
        return `📊 Bulk Operation ${notification.status}: ${notification.stats.processed}/${notification.stats.total} items`;
      case 'content_generation':
        return notification.status === 'completed' 
          ? `✨ Content Generated: ${notification.content.title}`
          : `❌ Content Generation Failed`;
      case 'system':
        return `🔔 System ${notification.level}: ${notification.message}`;
      default:
        return 'AI Content Publisher Notification';
    }
  }

  /**
   * Get email template based on notification type
   */
  private getEmailTemplate(notification: any): string {
    // Return template name/path based on notification type
    switch (notification.type) {
      case 'publishing':
        return 'publishing-notification';
      case 'bulk_operation':
        return 'bulk-operation-notification';
      case 'content_generation':
        return 'content-generation-notification';
      case 'system':
        return 'system-notification';
      default:
        return 'default-notification';
    }
  }
}

export default new NotificationService();