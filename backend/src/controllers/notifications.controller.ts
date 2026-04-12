// backend/src/controllers/notification.controller.ts
import { Request, Response } from 'express';
import Notification from '../models/notification.model';
import logger from '../config/logger';

interface AuthRequest extends Request {
  user?: {
    id: string;
    role: string;
  };
}

class NotificationController {
  /**
   * Get all notifications for current user
   */
  async getNotifications(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role || 'user';
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const { limit = 20, skip = 0, unreadOnly = false } = req.query;

      let query: any = {
        $and: [
          {
            $or: [
              { recipientId: userId },
              { recipientType: 'all' },
              { recipientType: 'admin', $expr: { $in: [userRole, ['admin', 'super_admin', 'moderator']] } },
              { recipientType: 'role_based', targetRoles: userRole }
            ]
          },
          {
            $or: [
              { autoExpire: false },
              { expiresAt: { $gt: new Date() } },
              { expiresAt: null }
            ]
          },
          {
            $or: [
              { scheduledFor: { $lte: new Date() } },
              { scheduledFor: null }
            ]
          }
        ]
      };

      if (unreadOnly === 'true') {
        query.isRead = false;
      }

      const notifications = await Notification.find(query)
        .sort({ priority: 1, createdAt: -1 })
        .limit(Number(limit))
        .skip(Number(skip));

      const total = await Notification.countDocuments(query);
      const unreadCount = await Notification.countDocuments({
        ...query,
        isRead: false
      });

      return res.json({
        success: true,
        data: {
          notifications,
          total,
          unreadCount
        }
      });
    } catch (error: any) {
      logger.error('Error fetching notifications:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to fetch notifications'
      });
    }
  }

  /**
   * Get unread count
   */
  async getUnreadCount(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role || 'user';
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const count = await Notification.countDocuments({
        $and: [
          {
            $or: [
              { recipientId: userId },
              { recipientType: 'all' },
              { recipientType: 'admin', $expr: { $in: [userRole, ['admin', 'super_admin', 'moderator']] } },
              { recipientType: 'role_based', targetRoles: userRole }
            ]
          },
          { isRead: false },
          {
            $or: [
              { autoExpire: false },
              { expiresAt: { $gt: new Date() } },
              { expiresAt: null }
            ]
          }
        ]
      });

      return res.json({
        success: true,
        data: { count }
      });
    } catch (error: any) {
      logger.error('Error getting unread count:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to get unread count'
      });
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const notification = await Notification.findById(id);

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      await notification.markAsRead();

      return res.json({
        success: true,
        data: notification
      });
    } catch (error: any) {
      logger.error('Error marking notification as read:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read'
      });
    }
  }

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role || 'user';

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const result = await Notification.updateMany(
        {
          $and: [
            {
              $or: [
                { recipientId: userId },
                { recipientType: 'all' },
                { recipientType: 'admin', $expr: { $in: [userRole, ['admin', 'super_admin', 'moderator']] } },
                { recipientType: 'role_based', targetRoles: userRole }
              ]
            },
            { isRead: false }
          ]
        },
        {
          $set: {
            isRead: true,
            readAt: new Date()
          },
          $inc: { viewCount: 1 }
        }
      );

      return res.json({
        success: true,
        data: { modifiedCount: result.modifiedCount }
      });
    } catch (error: any) {
      logger.error('Error marking all as read:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to mark all as read'
      });
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(req: AuthRequest, res: Response) {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const notification = await Notification.findByIdAndDelete(id);

      if (!notification) {
        return res.status(404).json({
          success: false,
          message: 'Notification not found'
        });
      }

      return res.json({
        success: true,
        message: 'Notification deleted'
      });
    } catch (error: any) {
      logger.error('Error deleting notification:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to delete notification'
      });
    }
  }

  /**
   * Clear all notifications for user
   */
  async clearAll(req: AuthRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const userRole = req.user?.role || 'user';

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized'
        });
      }

      const result = await Notification.deleteMany({
        $or: [
          { recipientId: userId },
          { recipientType: 'all' },
          { recipientType: 'role_based', targetRoles: userRole }
        ]
      });

      return res.json({
        success: true,
        data: { deletedCount: result.deletedCount }
      });
    } catch (error: any) {
      logger.error('Error clearing notifications:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to clear notifications'
      });
    }
  }
}

export default new NotificationController();
