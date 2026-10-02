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
import { protect, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

router.get('/', protect, getVehicles);
router.post('/', protect, authorizeRoles('logistics_manager', 'admin'), createVehicle);
router.get('/analytics/utilization', protect, authorizeRoles('logistics_manager', 'admin'), getVehicleUtilization);
router.get('/driver/active-trip', protect, getActiveDriverTrip);
router.get('/driver/history', protect, getDriverTripHistory);
router.post('/:id/transit-state', protect, authorizeRoles('logistics_manager', 'admin', 'driver'), updateVehicleTransitState);
router.post('/:id/verify-stop', protect, authorizeRoles('logistics_manager', 'admin', 'driver'), verifyStop);
router.post('/:id/accept-load', protect, authorizeRoles('logistics_manager', 'admin'), acceptLoadRecommendation);
router.get('/:id/recommendations', protect, getVehicleRecommendations);
router.get('/:id', protect, getVehicleById);
router.put('/:id', protect, authorizeRoles('logistics_manager', 'admin'), updateVehicle);
router.delete('/:id', protect, authorizeRoles('logistics_manager', 'admin'), deleteVehicle);

export default router;
