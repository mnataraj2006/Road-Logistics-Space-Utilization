import express from 'express';
import { trackShipment, getShipments } from '../controllers/shipmentController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getShipments);
router.get('/track/:id', protect, trackShipment);

export default router;
