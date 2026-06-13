// backend/src/routes/support.routes.ts
import { Router } from 'express';
import { createTicket } from '../controllers/support.controller';

const router = Router();

// POST /api/support/ticket — public, no auth required
router.post('/ticket', createTicket);

export default router;
