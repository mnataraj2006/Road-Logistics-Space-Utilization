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
  rejectTripLoadPlan,
  dispatchPlannedTrip,
  previewDynamicReoptimizationController,
  applyDynamicReoptimizationController
} from '../controllers/tripController.js';
import { protect } from '../middleware/auth.js';

const router = express.Router();

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
router.post('/:tripId/load-plan/:loadPlanId/approve', protect, approveTripLoadPlan);
router.post('/:tripId/load-plan/:loadPlanId/reject', protect, rejectTripLoadPlan);
router.post('/:tripId/dispatch', protect, dispatchPlannedTrip);

export default router;
