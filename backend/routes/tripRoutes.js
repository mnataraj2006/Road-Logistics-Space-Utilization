import express from 'express';
import {
  getTrips,
  createTrip,
  getTripById,
  getCandidateShipmentsForTrip,
  previewOptimization,
  generateTripLoadPlan,
  getTripLoadPlan,
  approveTripLoadPlan,
  unlockTripLoadPlan,
  rejectTripLoadPlan,
  dispatchPlannedTrip,
  cancelTripController,
  previewDynamicReoptimizationController,
  applyDynamicReoptimizationController,
  previewFleetOptimization,
  generateFleetLoadPlans,
  getAllLoadPlans
} from '../controllers/tripController.js';
import { protect, authorizeRoles } from '../middleware/auth.js';

const router = express.Router();

// Archive of all versioned load plans (must be before /:tripId)
router.get('/load-plans/archive', protect, authorizeRoles('logistics_manager', 'admin'), getAllLoadPlans);

// Fleet optimization (must be before /:tripId to avoid route shadowing)
router.post('/fleet-optimize/preview', protect, previewFleetOptimization);
router.post('/fleet-optimize/generate', protect, generateFleetLoadPlans);

// Trip management
router.route('/')
  .get(protect, getTrips)
  .post(protect, createTrip);

router.route('/:tripId')
  .get(protect, getTripById);

// Candidate shipments for trip
router.get('/:tripId/candidates', protect, getCandidateShipmentsForTrip);

// Optimization Preview & Generation
router.post('/:tripId/optimize/preview', protect, previewOptimization);
router.post('/:tripId/optimize/generate', protect, generateTripLoadPlan);

// Dynamic Re-Optimization (In-Transit & Multi-Stop Capacity Rebalance)
router.post('/:tripId/reoptimize/preview', protect, previewDynamicReoptimizationController);
router.post('/:tripId/reoptimize/apply', protect, applyDynamicReoptimizationController);

// Load Plan inspection, approval, rejection, and dispatch
router.get('/:tripId/load-plan', protect, getTripLoadPlan);
router.post('/:tripId/load-plan/approve', protect, approveTripLoadPlan);
router.post('/:tripId/load-plan/:loadPlanId/approve', protect, approveTripLoadPlan);
router.post('/:tripId/load-plan/unlock', protect, unlockTripLoadPlan);
router.post('/:tripId/load-plan/:loadPlanId/unlock', protect, unlockTripLoadPlan);
router.post('/:tripId/load-plan/reject', protect, rejectTripLoadPlan);
router.post('/:tripId/load-plan/:loadPlanId/reject', protect, rejectTripLoadPlan);
router.post('/:tripId/dispatch', protect, dispatchPlannedTrip);
router.post('/:tripId/cancel', protect, cancelTripController);

export default router;
