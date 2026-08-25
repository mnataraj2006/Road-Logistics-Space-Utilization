import express from 'express';
import { 
  getVehicles, 
  getVehicleById, 
  getVehicleUtilization,
  createVehicle,
  deleteVehicle,
  updateVehicle,
  updateVehicleTransitState,
  verifyStop,
  acceptLoadRecommendation,
  getVehicleRecommendations,
  getActiveDriverTrip,
  getDriverTripHistory
} from '../controllers/vehicleController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getVehicles);
router.post('/', protect, createVehicle);
router.get('/analytics/utilization', protect, getVehicleUtilization);
router.get('/driver/active-trip', protect, getActiveDriverTrip);
router.get('/driver/history', protect, getDriverTripHistory);
router.post('/:id/transit-state', protect, updateVehicleTransitState);
router.post('/:id/verify-stop', protect, verifyStop);
router.post('/:id/accept-load', protect, acceptLoadRecommendation);
router.get('/:id/recommendations', protect, getVehicleRecommendations);
router.get('/:id', protect, getVehicleById);
router.put('/:id', protect, updateVehicle);
router.delete('/:id', protect, deleteVehicle);

export default router;
