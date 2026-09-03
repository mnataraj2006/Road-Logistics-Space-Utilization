import mongoose from 'mongoose';
import Trip from '../models/Trip.js';
import TripStop from '../models/TripStop.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import { generateLoadPlan } from '../optimizer/index.js';

const norm = (s) => (s ? String(s).trim().toLowerCase() : '');

/**
 * Computes dynamic in-memory re-optimization for the remaining route of an active or planned trip.
 * Strictly preserves already delivered cargo and currently locked trailer payload.
 */
export const computeDynamicReoptimization = async ({
  tripId,
  additionalCandidateShipmentIds = [],
  reason = 'Downstream capacity rebalance',
  session
}) => {
  const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route').session(session);
  if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

  const route = trip.route;
  const vehicle = trip.vehicle;
  const currentStopIdx = Math.max(0, trip.currentStopIndex || 0);

  if (!route || !route.stopsDetails || route.stopsDetails.length < 2) {
    throw { status: 400, message: 'Route does not have valid stops.' };
  }

  const allStops = route.stopsDetails.map(s => s.locationName);
  const remainingStops = allStops.slice(currentStopIdx);

  if (remainingStops.length < 2) {
    throw {
      status: 400,
      message: 'Trip is at final destination stop. No remaining segments available for re-optimization.'
    };
  }

  // 1. Fetch latest LoadPlan (if exists)
  const previousPlan = await LoadPlan.findOne({ tripId })
    .sort({ version: -1 })
    .session(session);

  const previousAssignments = previousPlan
    ? await LoadAssignment.find({ loadPlanId: previousPlan.loadPlanId }).session(session)
    : [];

  // 2. Classify Cargo:
  // (A) Already DELIVERED (Immutable Historical Records)
  const allTripBookings = await Booking.find({ vehicleId: vehicle.vehicleId }).session(session);
  const deliveredBookings = allTripBookings.filter(b => b.status === 'DELIVERED');

  // (B) Currently LOADED on Trailer (Locked Cargo)
  const currentlyLoadedBookings = allTripBookings.filter(b => ['IN_TRANSIT', 'LOADED'].includes(b.status));

  // Map currently loaded cargo to locked items for optimizer
  const lockedCargoForOptimizer = currentlyLoadedBookings.map(b => ({
    shipmentId: b.shipmentId || b.bookingId,
    bookingId: b.bookingId,
    pickupStop: remainingStops[0], // Locked from current stop onwards
    deliveryStop: b.toStop,
    volume: b.volume,
    weight: b.weight,
    priority: 'URGENT', // Locked items must be retained
    fragile: false,
    stackable: true,
    isLocked: true
  }));

  // (C) Planned Downstream Bookings (Yet to be picked up at future stops)
  const downstreamWaitingBookings = allTripBookings.filter(b =>
    ['WAITING_FOR_PICKUP', 'ALLOCATED'].includes(b.status) &&
    norm(b.fromStop) !== norm(remainingStops[0])
  );

  // (D) Query Eligible Newly Available Shipments for Remaining Route
  let candidateShipmentDocs = [];
  if (additionalCandidateShipmentIds && additionalCandidateShipmentIds.length > 0) {
    candidateShipmentDocs = await Shipment.find({
      shipmentId: { $in: additionalCandidateShipmentIds },
      status: { $in: ['DRAFT', 'PENDING', 'BOOKED'] }
    }).session(session);
  } else {
    candidateShipmentDocs = await Shipment.find({
      status: { $in: ['DRAFT', 'PENDING', 'BOOKED'] }
    }).session(session);
  }

  // Filter candidate shipments whose pickup and delivery fall within the remaining stops
  const eligibleNewCandidates = candidateShipmentDocs.filter(s => {
    const pIdx = remainingStops.findIndex(st => norm(st) === norm(s.pickupStop));
    const dIdx = remainingStops.findIndex(st => norm(st) === norm(s.deliveryStop));
    return pIdx !== -1 && dIdx !== -1 && pIdx < dIdx;
  });

  // Combine downstream planned shipments + eligible newly available shipments
  const candidatePoolForOptimizer = [];

  // Add downstream planned bookings as candidates (they can be re-sequenced or preserved)
  for (const db of downstreamWaitingBookings) {
    const pIdx = remainingStops.findIndex(st => norm(st) === norm(db.fromStop));
    const dIdx = remainingStops.findIndex(st => norm(st) === norm(db.toStop));
    if (pIdx !== -1 && dIdx !== -1 && pIdx < dIdx) {
      candidatePoolForOptimizer.push({
        shipmentId: db.shipmentId || db.bookingId,
        bookingId: db.bookingId,
        pickupStop: db.fromStop,
        deliveryStop: db.toStop,
        volume: db.volume,
        weight: db.weight,
        priority: 'EXPRESS',
        isPriorAssignment: true
      });
    }
  }

  // Add newly eligible shipments
  for (const nc of eligibleNewCandidates) {
    // Avoid duplicates if already in candidatePool
    if (!candidatePoolForOptimizer.some(c => c.shipmentId === nc.shipmentId)) {
      candidatePoolForOptimizer.push({
        shipmentId: nc.shipmentId,
        bookingId: `BKG-${nc.shipmentId}`,
        pickupStop: nc.pickupStop,
        deliveryStop: nc.deliveryStop,
        volume: nc.volume,
        weight: nc.weight,
        priority: nc.priority || 'STANDARD',
        isNewOpportunity: true
      });
    }
  }

  // 3. Execute Domain Optimizer Pipeline on Remaining Route
  const remainingRouteConfig = {
    routeId: `${route.routeId}-REOPT-LEG-${currentStopIdx}`,
    stops: remainingStops,
    distance: route.distance || 100
  };

  const optimizationResult = generateLoadPlan({
    truck: vehicle,
    route: remainingRouteConfig,
    shipments: candidatePoolForOptimizer,
    currentLoad: lockedCargoForOptimizer
  });

  // 4. Perform Before vs. After Diff Analysis
  const previousAssignedIds = new Set(previousAssignments.map(a => a.shipmentId));
  const newAssignedIds = new Set(optimizationResult.assignments.map(a => a.shipmentId));

  const newlyAssignedShipments = optimizationResult.assignments.filter(
    a => !previousAssignedIds.has(a.shipmentId)
  );

  const removedShipments = previousAssignments.filter(
    a => !newAssignedIds.has(a.shipmentId) &&
         !deliveredBookings.some(d => d.shipmentId === a.shipmentId) &&
         !currentlyLoadedBookings.some(l => l.shipmentId === a.shipmentId)
  );

  const retainedShipments = optimizationResult.assignments.filter(
    a => previousAssignedIds.has(a.shipmentId)
  );

  // Before vs After Capacity Metrics
  const beforeUsedVol = trip.actualLoadSnapshot?.usedVolume || 0;
  const beforeUsedWt = trip.actualLoadSnapshot?.usedWeight || 0;
  const newPeakVol = optimizationResult.peakVolumeUtilization || 0;
  const newPeakWt = optimizationResult.peakWeightUtilization || 0;

  const comparison = {
    currentStop: remainingStops[0],
    currentStopIndex: currentStopIdx,
    remainingSegmentsCount: remainingStops.length - 1,
    immutableDeliveredCount: deliveredBookings.length,
    lockedLoadedCount: currentlyLoadedBookings.length,
    previousPlanVersion: previousPlan ? previousPlan.version : 0,
    proposedPlanVersion: previousPlan ? previousPlan.version + 1 : 1,
    metricsBefore: {
      usedVolume: beforeUsedVol,
      freeVolume: parseFloat((vehicle.capacityVolume - beforeUsedVol).toFixed(2)),
      usedWeight: beforeUsedWt,
      freeWeight: Math.round(vehicle.capacityWeight - beforeUsedWt),
      volumeUtilization: previousPlan?.overallUtilization?.volume || 0,
      weightUtilization: previousPlan?.overallUtilization?.weight || 0
    },
    metricsAfter: {
      peakVolumeUtilization: newPeakVol,
      peakWeightUtilization: newPeakWt,
      volumeScore: optimizationResult.scoreBreakdown?.volumeScore || 0,
      weightScore: optimizationResult.scoreBreakdown?.weightScore || 0,
      overallObjectiveScore: optimizationResult.objectiveScore
    },
    diff: {
      newlyAssignedCount: newlyAssignedShipments.length,
      newlyAssigned: newlyAssignedShipments.map(s => ({
        shipmentId: s.shipmentId,
        bookingId: s.bookingId || `BKG-${s.shipmentId}`,
        pickup: s.segmentRange?.fromStop,
        delivery: s.segmentRange?.toStop,
        volume: s.volume,
        weight: s.weight
      })),
      removedCount: removedShipments.length,
      removed: removedShipments.map(s => ({
        shipmentId: s.shipmentId,
        bookingId: s.bookingId || `BKG-${s.shipmentId}`,
        pickup: s.segmentRange?.fromStop,
        delivery: s.segmentRange?.toStop,
        volume: s.volume,
        weight: s.weight
      })),
      retainedCount: retainedShipments.length
    },
    summaryText: `At stop '${remainingStops[0]}', ${deliveredBookings.length} cargo delivered. ${currentlyLoadedBookings.length} packages locked on trailer. Re-optimization allocated ${newlyAssignedShipments.length} new shipment(s) on remaining ${remainingStops.length - 1} route leg(s). Peak fill: ${newPeakVol}% Vol, ${newPeakWt}% Wt.`
  };

  return {
    tripId: trip.tripId,
    vehicleId: vehicle.vehicleId,
    routeId: route.routeId,
    currentStop: remainingStops[0],
    reason,
    previousPlan,
    comparison,
    optimizationResult
  };
};

/**
 * Applies dynamic re-optimization, creating a persistent incremented LoadPlan version.
 * Optionally auto-approves or holds under manager review.
 */
export const applyDynamicReoptimization = async ({
  tripId,
  additionalCandidateShipmentIds = [],
  autoApprove = false,
  reason = 'Dynamic capacity rebalance',
  performedBy = 'manager',
  session
}) => {
  const reopt = await computeDynamicReoptimization({
    tripId,
    additionalCandidateShipmentIds,
    reason,
    session
  });

  const { previousPlan, comparison, optimizationResult } = reopt;
  const nextVersion = comparison.proposedPlanVersion;
  const now = new Date();

  // Create new LoadPlan version
  const newPlanId = `LP-${tripId}-v${nextVersion}-${Date.now()}`;
  const newPlan = new LoadPlan({
    loadPlanId: newPlanId,
    tripId,
    vehicleId: reopt.vehicleId,
    routeId: reopt.routeId,
    version: nextVersion,
    objectiveScore: optimizationResult.objectiveScore,
    scoreBreakdown: optimizationResult.scoreBreakdown,
    overallUtilization: {
      volume: optimizationResult.overallVolumeUtilization,
      weight: optimizationResult.overallWeightUtilization
    },
    peakUtilization: {
      volume: optimizationResult.peakVolumeUtilization,
      weight: optimizationResult.peakWeightUtilization
    },
    segmentUtilization: optimizationResult.segmentUtilization,
    unassignedShipments: optimizationResult.unassignedShipments,
    warnings: optimizationResult.warnings,
    explanation: `${reason}. ${comparison.summaryText}`,
    status: autoApprove ? 'ACTIVE' : 'UNDER_REVIEW',
    isImmutable: autoApprove,
    auditLog: [
      {
        action: autoApprove ? 'ACTIVE' : 'GENERATED',
        performedBy,
        timestamp: now,
        notes: `Re-optimized at stop '${comparison.currentStop}' (v${nextVersion}). ${comparison.diff.newlyAssignedCount} new cargo added.`,
        version: nextVersion
      }
    ]
  });
  await newPlan.save({ session });

  // Save new load assignments
  for (const a of optimizationResult.assignments) {
    const assignDoc = new LoadAssignment({
      loadPlan: newPlan._id,
      loadPlanId: newPlan.loadPlanId,
      shipmentId: a.shipmentId,
      bookingId: a.bookingId,
      customer: a.customer || '',
      priority: a.priority,
      fragile: a.fragile || false,
      stackable: a.stackable !== false,
      segmentRange: a.segmentRange,
      loadingSequence: a.loadingSequence,
      unloadingSequence: a.unloadingSequence,
      dimensions: {
        length: a.dimensions?.length || 0,
        width: a.dimensions?.width || 0,
        height: a.dimensions?.height || 0
      },
      volume: a.volume,
      weight: a.weight,
      orientation: a.orientation || 'ORIGINAL',
      position: a.position,
      obstructionScore: a.obstructionScore || 0,
      status: autoApprove ? 'ASSIGNED' : 'PROPOSED'
    });
    await assignDoc.save({ session });
  }

  // If auto-approved, mark previous active/approved plan as SUPERSEDED
  if (autoApprove) {
    if (previousPlan) {
      previousPlan.status = 'SUPERSEDED';
      previousPlan.auditLog.push({
        action: 'SUPERSEDED',
        performedBy,
        timestamp: now,
        notes: `Superseded by dynamically re-optimized plan v${nextVersion} at stop '${comparison.currentStop}'.`,
        version: previousPlan.version
      });
      await previousPlan.save({ session });
    }

    // Allocate newly assigned bookings/shipments (preserving already boarded or delivered state)
    for (const na of comparison.diff.newlyAssigned) {
      if (na.shipmentId) {
        const existingShp = await Shipment.findOne({ shipmentId: na.shipmentId }).session(session);
        if (existingShp && !['IN_TRANSIT', 'LOADED', 'DELIVERED'].includes(existingShp.status)) {
          existingShp.allocatedTripId = tripId;
          existingShp.allocatedVehicleId = reopt.vehicleId;
          existingShp.status = 'ALLOCATED';
          existingShp.allocationStatus = 'ALLOCATED';
          await existingShp.save({ session });
        }
      }
      if (na.bookingId) {
        const existingBkg = await Booking.findOne({ bookingId: na.bookingId }).session(session);
        if (existingBkg && !['IN_TRANSIT', 'LOADED', 'DELIVERED'].includes(existingBkg.status)) {
          existingBkg.allocatedTripId = tripId;
          existingBkg.vehicleId = reopt.vehicleId;
          existingBkg.status = 'ALLOCATED';
          existingBkg.allocationStatus = 'ALLOCATED';
          await existingBkg.save({ session });
        }
      }
    }

    // Update activeLoadPlanId on trip
    await Trip.updateOne(
      { tripId },
      {
        activeLoadPlanId: newPlan.loadPlanId,
        $push: {
          timelineAudit: {
            event: 'LOAD_PLAN_APPROVED',
            stopId: comparison.currentStop,
            location: comparison.currentStop,
            timestamp: now,
            performedBy,
            details: {
              version: nextVersion,
              reoptimized: true,
              newAssignments: comparison.diff.newlyAssignedCount
            }
          }
        }
      },
      { session }
    );
  }

  return {
    success: true,
    message: autoApprove
      ? `Dynamic re-optimization applied and ACTIVE as Load Plan v${nextVersion}!`
      : `Dynamic re-optimization generated as Load Plan v${nextVersion} (UNDER_REVIEW). Manager approval required.`,
    loadPlan: newPlan,
    comparison
  };
};
