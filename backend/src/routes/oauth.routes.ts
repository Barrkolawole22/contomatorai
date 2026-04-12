// backend/src/routes/oauth.routes.ts
import express from 'express';
import oauthController from '../controllers/oauth.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// OAuth initiation requires authentication
router.use(authMiddleware);

// OAuth flow endpoints
router.post('/initiate', oauthController.initiateOAuth);
router.get('/callback', oauthController.handleCallback); // This is public (called by WordPress)
router.get('/connections', oauthController.getConnections);
router.delete('/connections/:connectionId', oauthController.disconnect);
router.post('/test-connection', oauthController.testConnection);

export default router;