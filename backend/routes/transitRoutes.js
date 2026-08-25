import express from 'express';
import {
  dispatchTruck,
  verifyStop,
  getActiveTransits,
  getVehicleTransitStatus,
  getStopVerificationHistory,
  generateStopQrToken
} from '../controllers/transitController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.post('/dispatch/:vehicleId', protect, dispatchTruck);
router.post('/verify-stop', protect, verifyStop);
router.get('/active', protect, getActiveTransits);
router.get('/:vehicleId/status', protect, getVehicleTransitStatus);
router.get('/:vehicleId/history', protect, getStopVerificationHistory);
router.post('/routes/:routeId/stops/:stopId/generate-qr', protect, generateStopQrToken);

export default router;
