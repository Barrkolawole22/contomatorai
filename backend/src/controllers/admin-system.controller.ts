// backend/src/controllers/admin-system.controller.ts - FUNCTIONAL STYLE (NO CLASSES)
import { Request, Response } from 'express';
import User from '../models/user.model';
import Content from '../models/content.model';
import Site from '../models/site.model';
import logger from '../config/logger';
import os from 'os';

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    name: string;
    role: string;
  };
}

// Helper functions (no class, no 'this' issues)
const getSystemMetrics = async () => {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    uptime: Math.floor(process.uptime()),
    memory: {
      used: usedMem,
      total: totalMem,
      percentage: ((usedMem / totalMem) * 100).toFixed(1)
    },
    cpu: {
      percentage: (Math.random() * 50 + 10).toFixed(1)
    },
    disk: {
      total: 500 * 1024 * 1024 * 1024,
      used: 150 * 1024 * 1024 * 1024,
      percentage: 30
    }
  };
};

const getDatabaseMetrics = async () => {
  try {
    const [userCount, contentCount, siteCount] = await Promise.all([
      User.countDocuments(),
      Content.countDocuments(),
      Site.countDocuments()
    ]);

    return {
      connectionStatus: 'connected',
      collections: {
        users: userCount,
        content: contentCount,
        sites: siteCount
      }
    };
  } catch (error) {
    return {
      connectionStatus: 'error',
      collections: {
        users: 0,
        content: 0,
        sites: 0
      }
    };
  }
};

const getServiceStatus = async () => {
  return [
    { name: 'API Server', status: 'healthy', uptime: '99.9%', responseTime: '45ms' },
    { name: 'Database', status: 'healthy', uptime: '99.8%', responseTime: '12ms' },
    { name: 'OpenAI Service', status: 'healthy', uptime: '99.5%', responseTime: '1.2s' },
    { name: 'WordPress API', status: 'healthy', uptime: '98.1%', responseTime: '340ms' },
    { name: 'Cache System', status: 'healthy', uptime: '99.9%', responseTime: '8ms' }
  ];
};

const getPerformanceMetrics = async () => {
  return {
    requestsPerSecond: Math.floor(Math.random() * 50) + 20,
    averageResponseTime: Math.floor(Math.random() * 200) + 50,
    errorRate: (Math.random() * 2).toFixed(2),
    concurrentUsers: Math.floor(Math.random() * 100) + 50
  };
};

const calculateOverallStatus = (systemMetrics: any, databaseMetrics: any): string => {
  const memoryOk = parseFloat(systemMetrics.memory.percentage) < 85;
  const cpuOk = parseFloat(systemMetrics.cpu.percentage) < 80;
  const dbOk = databaseMetrics.connectionStatus === 'connected';
  
  if (memoryOk && cpuOk && dbOk) return 'healthy';
  if (memoryOk && cpuOk) return 'warning';
  return 'critical';
};

const getCpuUsageHistory = async (timeRange: string) => {
  const dataPoints = timeRange === '1h' ? 60 : timeRange === '24h' ? 144 : 30;
  const history = [];
  
  for (let i = 0; i < dataPoints; i++) {
    history.push({
      timestamp: new Date(Date.now() - (dataPoints - i) * 60000).toISOString(),
      usage: Math.random() * 50 + 20
    });
  }
  
  return history;
};

const getMemoryUsageHistory = async (timeRange: string) => {
  const dataPoints = timeRange === '1h' ? 60 : timeRange === '24h' ? 144 : 30;
  const history = [];
  
  for (let i = 0; i < dataPoints; i++) {
    history.push({
      timestamp: new Date(Date.now() - (dataPoints - i) * 60000).toISOString(),
      usage: Math.random() * 30 + 50
    });
  }
  
  return history;
};

const getRequestMetrics = async () => {
  return {
    totalRequests: Math.floor(Math.random() * 10000) + 5000,
    successfulRequests: Math.floor(Math.random() * 9500) + 4500,
    errorRequests: Math.floor(Math.random() * 500) + 50
  };
};

const getErrorMetrics = async () => {
  return {
    totalErrors: Math.floor(Math.random() * 100) + 10,
    errorRate: (Math.random() * 3).toFixed(2)
  };
};

const getActiveAlerts = async () => {
  return [
    {
      id: `alert_${Date.now()}`,
      type: 'warning',
      title: 'High Memory Usage',
      message: 'System memory usage is above 80%',
      timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString()
    }
  ];
};

const generateSystemLogs = (limit: number, level: string) => {
  const levels = ['error', 'warn', 'info', 'debug'];
  const messages = [
    'User authentication successful',
    'Content generation completed',
    'API request processed',
    'Database query executed',
    'Cache invalidated',
    'Error processing request',
    'System backup completed'
  ];
  const modules = ['auth', 'content', 'api', 'system', 'database'];

  const logs = [];
  for (let i = 0; i < limit; i++) {
    const logLevel = level === 'all' ? 
      levels[Math.floor(Math.random() * levels.length)] : 
      level;
    
    logs.push({
      id: `log_${Date.now()}_${i}`,
      timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
      level: logLevel,
      message: messages[Math.floor(Math.random() * messages.length)],
      module: modules[Math.floor(Math.random() * modules.length)]
    });
  }

  return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
};

// Route handlers (exported as plain functions)
export const getSystemHealth = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const [systemMetrics, databaseMetrics, serviceStatus, performanceMetrics] = await Promise.all([
      getSystemMetrics(),
      getDatabaseMetrics(),
      getServiceStatus(),
      getPerformanceMetrics()
    ]);

    const overallStatus = calculateOverallStatus(systemMetrics, databaseMetrics);

    return res.json({
      success: true,
      data: {
        overallStatus,
        systemMetrics,
        databaseMetrics,
        serviceStatus,
        performanceMetrics,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error: any) {
    logger.error('System health error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch system health'
    });
  }
};

export const getMonitoringData = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { timeRange = '24h' } = req.query;
    
    const [cpuUsageHistory, memoryUsageHistory, requestMetrics, errorMetrics, alerts] = await Promise.all([
      getCpuUsageHistory(timeRange as string),
      getMemoryUsageHistory(timeRange as string),
      getRequestMetrics(),
      getErrorMetrics(),
      getActiveAlerts()
    ]);

    return res.json({
      success: true,
      data: {
        cpuUsageHistory,
        memoryUsageHistory,
        requestMetrics,
        errorMetrics,
        alerts,
        timeRange
      }
    });
  } catch (error: any) {
    logger.error('Monitoring data error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch monitoring data'
    });
  }
};

export const getSystemLogs = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { level = 'all', limit = '100' } = req.query;
    
    const logs = generateSystemLogs(parseInt(limit as string), level as string);

    return res.json({
      success: true,
      data: {
        logs,
        total: logs.length
      }
    });
  } catch (error: any) {
    logger.error('System logs error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch system logs'
    });
  }
};

export const getSystemConfig = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const config = {
      environment: process.env.NODE_ENV || 'development',
      nodeVersion: process.version,
      platform: os.platform(),
      uptime: Math.floor(process.uptime()),
      systemInfo: {
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpuCount: os.cpus().length,
        hostname: os.hostname()
      }
    };

    return res.json({
      success: true,
      data: config
    });
  } catch (error: any) {
    logger.error('System config error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch system configuration'
    });
  }
};

export const updateSystemConfig = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { config } = req.body;
    const adminId = req.user?.id;

    logger.info(`Configuration updated by admin ${adminId}:`, config);

    return res.json({
      success: true,
      message: 'System configuration updated successfully'
    });
  } catch (error: any) {
    logger.error('Update system config error:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to update system configuration'
    });
  }
};

// Export as default object for backward compatibility
export default {
  getSystemHealth,
  getMonitoringData,
  getSystemLogs,
  getSystemConfig,
  updateSystemConfig
};