// backend/src/controllers/userController.ts - FIXED with Enhanced getUserById
import { Request, Response } from 'express';
import User from '../models/user.model';
import Content from '../models/content.model';
import WordPressSite from '../models/wordPressSite.model';
import mongoose from 'mongoose';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

// =============================================
// GET ALL USERS (Working)
// =============================================
export const getAllUsers = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    // Check admin permissions
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const {
      page = 1,
      limit = 20,
      search = '',
      status = '',
      role = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = Math.max(1, parseInt(page as string));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit as string)));
    const skip = (pageNum - 1) * limitNum;

    // Build filter
    const filter: any = {};
    
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status && status !== 'all') {
      filter.status = status;
    }
    
    if (role && role !== 'all') {
      filter.role = role;
    }

    // Get users with pagination
    const [users, totalCount, statistics] = await Promise.all([
      User.find(filter)
        .select('-password -resetPasswordToken -emailVerificationToken')
        .sort({ [sortBy as string]: sortOrder === 'desc' ? -1 : 1 })
        .skip(skip)
        .limit(limitNum),
      
      User.countDocuments(filter),
      
      // Get statistics
      User.aggregate([
        {
          $group: {
            _id: null,
            totalUsers: { $sum: 1 },
            activeUsers: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            suspendedUsers: { $sum: { $cond: [{ $eq: ['$status', 'suspended'] }, 1, 0] } },
            adminUsers: { $sum: { $cond: [{ $in: ['$role', ['admin', 'super_admin']] }, 1, 0] } },
            totalCredits: { $sum: '$credits' }
          }
        }
      ])
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);
    const stats = statistics[0] || {
      totalUsers: 0,
      activeUsers: 0,
      suspendedUsers: 0,
      adminUsers: 0,
      totalCredits: 0
    };

    return res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          currentPage: pageNum,
          totalPages,
          totalCount,
          hasNextPage: pageNum < totalPages,
          hasPrevPage: pageNum > 1,
          limit: limitNum
        },
        statistics: stats
      }
    });

  } catch (error: any) {
    console.error('Get all users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: error.message
    });
  }
};

// =============================================
// 🔥 FIXED: GET USER BY ID - Enhanced with Statistics
// =============================================
export const getUserById = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    // Check admin permissions
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    console.log('🔍 Fetching user details for ID:', userId);

    // Get user with all fields including preferences
    const user = await User.findById(userId).select('+preferences');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    console.log('✅ Found user:', user.name);

    // Get enhanced statistics
    const [contentStats, siteStats, recentContent] = await Promise.all([
      // Content statistics
      Content.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            totalContent: { $sum: 1 },
            publishedContent: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
            draftContent: { $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] } },
            totalWords: { $sum: '$wordCount' },
            avgQualityScore: { $avg: '$qualityScore' }
          }
        }
      ]).catch(() => []), // Handle if Content model doesn't exist

      // WordPress sites statistics
      WordPressSite.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            connectedSites: { $sum: 1 },
            activeSites: { $sum: { $cond: [{ $eq: ['$status', 'connected'] }, 1, 0] } }
          }
        }
      ]).catch(() => []), // Handle if WordPress model doesn't exist

      // Recent content for activity
      Content.find({ userId })
        .sort({ createdAt: -1 })
        .limit(10)
        .select('title status createdAt type')
        .catch(() => []) // Handle if Content model doesn't exist
    ]);

    const stats = contentStats[0] || {
      totalContent: 0,
      publishedContent: 0,
      draftContent: 0,
      totalWords: 0,
      avgQualityScore: 0
    };

    const siteStatsData = siteStats[0] || {
      connectedSites: 0,
      activeSites: 0
    };

    // Calculate credits used (default starting credits - current credits)
    const defaultStartingCredits = 10;
    const creditsUsed = Math.max(0, defaultStartingCredits - (user.credits || 0));

    // Generate recent activity from content
    const recentActivity = recentContent.map((content: any, index: number) => ({
      id: content._id.toString(),
      type: 'content',
      description: `${content.status === 'published' ? 'Published' : 'Created'} ${content.type || 'content'}: "${content.title}"`,
      timestamp: content.createdAt.toISOString(),
      metadata: {
        contentId: content._id,
        contentType: content.type,
        status: content.status
      }
    }));

    // Add account creation activity if no other activity exists
    if (recentActivity.length === 0) {
      recentActivity.push({
        id: 'account_created',
        type: 'account',
        description: 'Account created',
        timestamp: user.createdAt.toISOString(),
        metadata: {
          action: 'account_created'
        } as any 
      });
    }

    // Build enhanced user response
    const enhancedUser = {
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      status: user.status,
      credits: user.credits,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      lastLogin: user.lastLogin,
      
      // Enhanced profile data
      profile: {
        bio: user.preferences?.bio || '',
        website: user.preferences?.website || '',
        company: user.preferences?.company || '',
        location: user.preferences?.location || '',
        avatar: user.avatar || null
      },
      
      // Enhanced preferences
      preferences: {
        theme: user.preferences?.theme || 'system',
        language: user.language || 'en',
        timezone: user.timezone || 'UTC',
        notifications: {
          email: user.preferences?.emailNotifications || false,
          push: user.preferences?.pushNotifications || false,
          marketing: user.preferences?.marketingEmails || false
        }
      },
      
      // Statistics
      statistics: {
        totalContent: stats.totalContent,
        publishedContent: stats.publishedContent,
        draftContent: stats.draftContent,
        connectedSites: siteStatsData.connectedSites,
        totalCreditsUsed: creditsUsed,
        totalWords: stats.totalWords,
        avgQualityScore: Math.round(stats.avgQualityScore || 0),
        lastActive: user.lastLogin ? user.lastLogin.toISOString() : user.updatedAt.toISOString()
      },
      
      // Recent activity
      recentActivity: recentActivity.slice(0, 5) // Limit to 5 most recent
    };

    console.log('✅ Returning enhanced user data for:', user.name);

    return res.status(200).json({
      success: true,
      data: enhancedUser
    });

  } catch (error: any) {
    console.error('❌ Get user by ID error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user details',
      error: error.message
    });
  }
};

// =============================================
// CREATE USER (Admin only)
// =============================================
export const createUser = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const { name, email, password, role = 'user', status = 'active', credits = 10 } = req.body;

    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Name, email, and password are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User with this email already exists'
      });
    }

    // Create new user
    const user = new User({
      name,
      email: email.toLowerCase(),
      password,
      role,
      status,
      credits,
      emailVerified: true // Admin-created users are auto-verified
    });

    await user.save();

    // Remove password from response
    const userResponse = user.toObject();
    delete userResponse.password;

    return res.status(201).json({
      success: true,
      data: userResponse,
      message: 'User created successfully'
    });

  } catch (error: any) {
    console.error('Create user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: error.message
    });
  }
};

// =============================================
// UPDATE USER (Admin only)
// =============================================
export const updateUser = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const { userId } = req.params;
    const updates = req.body;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Don't allow password updates through this endpoint
    delete updates.password;
    delete updates._id;
    delete updates.__v;

    const user = await User.findByIdAndUpdate(
      userId,
      updates,
      { new: true, runValidators: true }
    ).select('-password');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    return res.status(200).json({
      success: true,
      data: user,
      message: 'User updated successfully'
    });

  } catch (error: any) {
    console.error('Update user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: error.message
    });
  }
};

// =============================================
// DELETE USER (Admin only)
// =============================================
export const deleteUser = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const { userId } = req.params;

    // Validate ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid user ID format'
      });
    }

    // Prevent self-deletion
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const user = await User.findByIdAndDelete(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // TODO: Clean up user's content, sites, etc.
    
    return res.status(200).json({
      success: true,
      message: 'User deleted successfully'
    });

  } catch (error: any) {
    console.error('Delete user error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: error.message
    });
  }
};

// =============================================
// BULK UPDATE USERS
// =============================================
export const bulkUpdateUsers = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const { userIds, action, data } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'User IDs array is required'
      });
    }

    let updateData: any = {};

    switch (action) {
      case 'activate':
        updateData = { status: 'active' };
        break;
      case 'suspend':
        updateData = { status: 'suspended' };
        break;
      case 'update_credits':
        if (typeof data?.credits !== 'number') {
          return res.status(400).json({
            success: false,
            message: 'Credits value is required for credit updates'
          });
        }
        updateData = { credits: data.credits };
        break;
      case 'update_role':
        if (!data?.role) {
          return res.status(400).json({
            success: false,
            message: 'Role is required for role updates'
          });
        }
        updateData = { role: data.role };
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid action specified'
        });
    }

    const result = await User.updateMany(
      { _id: { $in: userIds } },
      updateData
    );

    return res.status(200).json({
      success: true,
      data: {
        modifiedCount: result.modifiedCount,
        matchedCount: result.matchedCount
      },
      message: `Successfully updated ${result.modifiedCount} users`
    });

  } catch (error: any) {
    console.error('Bulk update users error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update users',
      error: error.message
    });
  }
};

// =============================================
// GET USER ANALYTICS
// =============================================
export const getUserAnalytics = async (req: AuthenticatedRequest, res: Response): Promise<Response> => {
  try {
    if (!req.user || !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Admin privileges required.'
      });
    }

    const { timeframe = '30d' } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate: Date;
    
    switch (timeframe) {
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const analytics = await User.aggregate([
      {
        $facet: {
          // User registration trends
          registrationTrends: [
            {
              $match: {
                createdAt: { $gte: startDate }
              }
            },
            {
              $group: {
                _id: {
                  date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
                },
                count: { $sum: 1 }
              }
            },
            {
              $sort: { "_id.date": 1 }
            }
          ],
          
          // Role distribution
          roleDistribution: [
            {
              $group: {
                _id: "$role",
                count: { $sum: 1 }
              }
            }
          ],
          
          // Status distribution
          statusDistribution: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 }
              }
            }
          ],
          
          // Credit statistics
          creditStats: [
            {
              $group: {
                _id: null,
                totalCredits: { $sum: "$credits" },
                avgCredits: { $avg: "$credits" },
                maxCredits: { $max: "$credits" },
                minCredits: { $min: "$credits" }
              }
            }
          ]
        }
      }
    ]);

    return res.status(200).json({
      success: true,
      data: analytics[0],
      timeframe
    });

  } catch (error: any) {
    console.error('Get user analytics error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch user analytics',
      error: error.message
    });
  }
};

export default {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  bulkUpdateUsers,
  getUserAnalytics
};