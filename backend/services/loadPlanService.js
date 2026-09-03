import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import Booking from '../models/Booking.js';
import Shipment from '../models/Shipment.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import crypto from 'crypto';
import { generateLoadPlan } from '../optimizer/index.js';

/**
 * Runs the optimization engine for a truck & route, then persists the resulting LoadPlan.
 */
export const optimizeAndPersistLoadPlan = async ({
  vehicleId,
  routeId,
  tripId,
  candidateShipments = [],
  currentLoad = [],
  config = {},
  session = null
}) => {
  const vehicle = await Vehicle.findOne({ vehicleId }).session(session);
  if (!vehicle) throw new Error(`Vehicle ${vehicleId} not found`);

  const targetRouteId = routeId || vehicle.routeLane;
  const route = await Route.findOne({ routeId: targetRouteId }).session(session);
  if (!route) throw new Error(`Route ${targetRouteId} not found`);

  // Run pure domain optimizer pipeline (0 DB mutations)
  const optimizationResult = generateLoadPlan({
    truck: vehicle,
    route,
    shipments: candidateShipments,
    currentLoad,
    config
  });

  // Persist LoadPlan
  const loadPlanId = `LP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const loadPlan = new LoadPlan({
    loadPlanId,
    tripId: tripId || `TRIP-${vehicleId}-${Date.now()}`,
    vehicleId: vehicle.vehicleId,
    routeId: route.routeId,
    optimizerVersion: optimizationResult.algorithmVersion,
    generatedAt: new Date(),
    volumeUtilization: optimizationResult.overallVolumeUtilization,
    weightUtilization: optimizationResult.overallWeightUtilization,
    peakUtilization: {
      volume: optimizationResult.peakVolumeUtilization,
      weight: optimizationResult.peakWeightUtilization
    },
    objectiveScore: optimizationResult.objectiveScore,
    status: 'GENERATED'
  });
  await loadPlan.save({ session });

  // Persist LoadAssignments
  const persistedAssignments = [];
  for (const a of optimizationResult.assignments) {
    const assignment = new LoadAssignment({
      loadPlan: loadPlan._id,
      loadPlanId: loadPlan.loadPlanId,
      shipmentId: a.shipmentId,
      bookingId: a.bookingId,
      segmentRange: a.segmentRange,
      loadingSequence: a.loadingSequence,
      unloadingSequence: a.unloadingSequence,
      dimensions: a.dimensions,
      orientation: a.orientation,
      position: a.position,
      status: 'PROPOSED'
    });
    await assignment.save({ session });
    persistedAssignments.push(assignment);
  }

  return {
    optimizationResult,
    loadPlan,
    assignments: persistedAssignments
  };
};

/**
 * Approves a LoadPlan and commits vehicle allocation to the corresponding Bookings & Shipments.
 */
export const approveLoadPlan = async (loadPlanId, approvedByUserId, session = null) => {
  const plan = await LoadPlan.findOne({ loadPlanId }).session(session);
  if (!plan) throw new Error(`LoadPlan ${loadPlanId} not found`);

  const now = new Date();
  plan.status = 'APPROVED';
  plan.isImmutable = true;
  plan.approvedBy = approvedByUserId;
  plan.approvedAt = now;
  plan.lockedAt = now;
  await plan.save({ session });

  const assignments = await LoadAssignment.find({ loadPlanId }).session(session);
  for (const assign of assignments) {
    assign.status = 'ASSIGNED';
    await assign.save({ session });

    // Update Booking
    if (assign.bookingId) {
      await Booking.updateOne(
        { bookingId: assign.bookingId },
        {
          $set: {
            vehicleId: plan.vehicleId,
            assignedVehicleId: plan.vehicleId,
            assignedTripId: plan.tripId,
            status: 'LOCKED',
            allocationStatus: 'LOCKED',
            isLocked: true,
            lockedAt: now,
            allocatedTripId: plan.tripId,
            allocatedLoadPlanId: plan.loadPlanId,
            allocatedVehicleId: plan.vehicleId,
            allocatedAt: now
          }
        },
        { session }
      );
    }
    // Update Shipment
    if (assign.shipmentId) {
      await Shipment.updateOne(
        { shipmentId: assign.shipmentId },
        {
          $set: {
            vehicleId: plan.vehicleId,
            assignedVehicleId: plan.vehicleId,
            assignedTripId: plan.tripId,
            status: 'LOCKED',
            allocationStatus: 'LOCKED',
            isLocked: true,
            lockedAt: now,
            allocatedTripId: plan.tripId,
            allocatedLoadPlanId: plan.loadPlanId,
            allocatedVehicleId: plan.vehicleId,
            allocatedAt: now
          }
        },
        { session }
      );
    }
  }

  return plan;
};
