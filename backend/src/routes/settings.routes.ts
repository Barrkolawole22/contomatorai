// backend/src/routes/settings.routes.ts
import express from 'express';
import settingsController from '../controllers/settings.controller';
import { authMiddleware } from '../middleware/auth.middleware';

const router = express.Router();

// Use the real shared auth middleware — not an inline reimplementation
router.use(authMiddleware);

router.get('/',                 settingsController.getSettings);
router.put('/profile',          settingsController.updateProfile);
router.put('/notifications',    settingsController.updateNotifications);
router.put('/preferences',      settingsController.updatePreferences);
router.put('/privacy',          settingsController.updatePrivacy);
router.put('/api',              settingsController.updateApiSettings);
router.post('/password',        settingsController.changePassword);
router.get('/export',           settingsController.exportData);
router.delete('/account',       settingsController.deleteAccount);

export default router;