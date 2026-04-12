// backend/src/routes/scheduler.routes.ts - COMPLETE FIXED VERSION
import express, { Response } from 'express';
import { authMiddleware, AuthenticatedRequest } from '../middleware/auth.middleware';
import schedulerService from '../services/scheduler.service';
import logger from '../config/logger';

const router = express.Router();

// Apply authentication middleware
router.use(authMiddleware);

// ✅ GET /api/scheduler/posts - List all scheduled posts with filters
router.get('/posts', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { siteId, status, startDate, endDate, limit } = req.query;

    logger.info(`📅 Getting scheduled posts for user ${userId}`, {
      siteId,
      status,
      startDate,
      endDate,
      limit
    });

    const result = await schedulerService.getScheduledPosts(userId, {
      siteId: siteId as string,
      status: status as string,
      startDate: startDate as string,
      endDate: endDate as string,
      limit: limit ? parseInt(limit as string) : undefined
    });

    logger.info(`✅ Found ${result.data.length} scheduled posts`);
    res.json(result);
  } catch (error: any) {
    logger.error('❌ Get scheduled posts error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get scheduled posts'
    });
  }
});

// ✅ GET /api/scheduler/posts/:scheduleId - Get single scheduled post
router.get('/posts/:scheduleId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { scheduleId } = req.params;
    const result = await schedulerService.getScheduledPostById(userId, scheduleId);

    res.json(result);
  } catch (error: any) {
    logger.error('❌ Get scheduled post error:', error);
    res.status(404).json({
      success: false,
      message: error.message || 'Scheduled post not found'
    });
  }
});

// ✅ POST /api/scheduler/schedule - Schedule a post (with siteId)
router.post('/schedule', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { contentId, siteId, scheduledFor, timezone } = req.body;

    logger.info(`📝 Scheduling post for user ${userId}`, {
      contentId,
      siteId,
      scheduledFor,
      timezone
    });

    if (!contentId || !siteId || !scheduledFor) {
      res.status(400).json({
        success: false,
        message: 'contentId, siteId, and scheduledFor are required'
      });
      return;
    }

    const result = await schedulerService.schedulePost(userId, {
      contentId,
      siteId,
      scheduledFor: new Date(scheduledFor),
      timezone
    });

    logger.info(`✅ Post scheduled successfully: ${contentId}`);
    res.json(result);
  } catch (error: any) {
    logger.error('❌ Schedule post error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to schedule post'
    });
  }
});

// ✅ PUT /api/scheduler/posts/:scheduleId - Update schedule
router.put('/posts/:scheduleId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { scheduleId } = req.params;
    const { scheduledFor, siteId, timezone } = req.body;

    logger.info(`🔄 Updating schedule ${scheduleId}`, {
      scheduledFor,
      siteId,
      timezone
    });

    const result = await schedulerService.updateSchedule(userId, scheduleId, {
      scheduleId,
      scheduledFor: scheduledFor ? new Date(scheduledFor) : undefined,
      siteId,
      timezone
    });

    logger.info(`✅ Schedule updated successfully: ${scheduleId}`);
    res.json(result);
  } catch (error: any) {
    logger.error('❌ Update schedule error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update schedule'
    });
  }
});

// ✅ POST /api/scheduler/posts/:scheduleId/cancel - Cancel schedule
router.post('/posts/:scheduleId/cancel', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { scheduleId } = req.params;
    
    logger.info(`🚫 Cancelling schedule ${scheduleId}`);
    
    const result = await schedulerService.cancelSchedule(userId, scheduleId);

    logger.info(`✅ Schedule cancelled successfully: ${scheduleId}`);
    res.json(result);
  } catch (error: any) {
    logger.error('❌ Cancel schedule error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel schedule'
    });
  }
});

// ✅ POST /api/scheduler/posts/:scheduleId/publish-now - Publish immediately
router.post('/posts/:scheduleId/publish-now', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { scheduleId } = req.params;
    
    logger.info(`🚀 Publishing post immediately: ${scheduleId}`);
    
    const result = await schedulerService.publishNow(userId, scheduleId);

    logger.info(`✅ Post published immediately: ${scheduleId}`);
    res.json(result);
  } catch (error: any) {
    logger.error('❌ Publish now error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to publish post'
    });
  }
});

// ✅ GET /api/scheduler/calendar - Get calendar view
router.get('/calendar', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      res.status(400).json({
        success: false,
        message: 'startDate and endDate are required'
      });
      return;
    }

    logger.info(`📅 Getting calendar view for user ${userId}`, {
      startDate,
      endDate
    });

    const calendar = await schedulerService.getScheduledPostsCalendar(
      userId,
      new Date(startDate as string),
      new Date(endDate as string)
    );

    res.json(calendar);
  } catch (error: any) {
    logger.error('❌ Get calendar error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get calendar'
    });
  }
});

// ✅ GET /api/scheduler/stats - Get scheduling statistics
router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { siteId } = req.query;
    
    logger.info(`📊 Getting scheduler stats for user ${userId}`, { siteId });
    
    const stats = await schedulerService.getSchedulingStats(
      userId,
      siteId as string | undefined
    );

    logger.info(`✅ Stats retrieved successfully`);
    res.json(stats);
  } catch (error: any) {
    logger.error('❌ Get stats error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get statistics'
    });
  }
});

// ✅ POST /api/scheduler/bulk - Bulk schedule posts
router.post('/bulk', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { schedules } = req.body;

    if (!schedules || !Array.isArray(schedules)) {
      res.status(400).json({
        success: false,
        message: 'schedules array is required'
      });
      return;
    }

    logger.info(`📦 Bulk scheduling ${schedules.length} posts for user ${userId}`);

    const result = await schedulerService.bulkSchedule(userId, schedules);
    
    logger.info(`✅ Bulk schedule completed: ${result.data.success} successful, ${result.data.failed} failed`);
    
    res.json(result);
  } catch (error: any) {
    logger.error('❌ Bulk schedule error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to bulk schedule'
    });
  }
});

// ✅ Legacy routes for backward compatibility
router.put('/update/:contentId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { contentId } = req.params;
    const { scheduledDate, scheduledFor } = req.body;

    const date = scheduledFor || scheduledDate;
    if (!date) {
      res.status(400).json({
        success: false,
        message: 'scheduledFor or scheduledDate is required'
      });
      return;
    }

    const result = await schedulerService.updateSchedule(userId, contentId, {
      scheduleId: contentId,
      scheduledFor: new Date(date)
    });

    res.json(result);
  } catch (error: any) {
    logger.error('❌ Update schedule error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to update schedule'
    });
  }
});

router.delete('/:contentId', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { contentId } = req.params;
    const result = await schedulerService.cancelSchedule(userId, contentId);

    res.json(result);
  } catch (error: any) {
    logger.error('❌ Cancel schedule error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to cancel schedule'
    });
  }
});

router.get('/scheduled', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const result = await schedulerService.getScheduledPosts(userId);
    res.json(result);
  } catch (error: any) {
    logger.error('❌ Get scheduled posts error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get scheduled posts'
    });
  }
});

export default router;