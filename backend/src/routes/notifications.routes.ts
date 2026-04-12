// backend/src/routes/notification.routes.ts
import express from 'express';
import notificationController from '../controllers/notifications.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// All notification routes require authentication
router.use(authMiddleware);

// Get notifications
router.get('/', notificationController.getNotifications);

// Get unread count
router.get('/unread-count', notificationController.getUnreadCount);

// Mark as read
router.put('/:id/read', notificationController.markAsRead);

// Mark all as read
router.put('/mark-all-read', notificationController.markAllAsRead);

// Delete notification
router.delete('/:id', notificationController.deleteNotification);

// Clear all notifications
router.delete('/', notificationController.clearAll);

export default router;
