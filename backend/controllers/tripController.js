import mongoose from 'mongoose';
import crypto from 'crypto';
import Trip from '../models/Trip.js';
import TripStop from '../models/TripStop.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import { generateLoadPlan } from '../optimizer/index.js';
import { dispatchTruck } from './transitController.js';

const norm = (s) => (s ? String(s).trim().toLowerCase() : '');

/**
 * @desc    Get all trips with optional status filtering
 * @route   GET /api/trips
 */
export const getTrips = async (req, res) => {
  try {
    const { status, vehicleId, routeId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (vehicleId) filter.vehicleId = vehicleId;
    if (routeId) filter.routeId = routeId;

    const trips = await Trip.find(filter)
      .populate('vehicle')
      .populate('route')
      .populate('driver', 'username name email')
      .sort({ plannedDeparture: -1, createdAt: -1 });

    res.json(trips);
  } catch (error) {
    console.error('getTrips error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Create a new planned trip
 * @route   POST /api/trips
 */
export const createTrip = async (req, res) => {
  try {
    const { vehicleId, routeId, plannedDeparture, driverId } = req.body;

    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return res.status(404).json({ success: false, message: `Vehicle ${vehicleId} not found.` });

    const route = await Route.findOne({ routeId: routeId || vehicle.routeLane });
    if (!route) return res.status(404).json({ success: false, message: `Route ${routeId || vehicle.routeLane} not found.` });

    const tripId = `TRIP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const departure = plannedDeparture ? new Date(plannedDeparture) : new Date();

    const originStop = route.stopsDetails?.[0]?.locationName || route.stops?.[0] || route.source;

    const trip = new Trip({
      tripId,
      vehicle: vehicle._id,
      vehicleId: vehicle.vehicleId,
      route: route._id,
      routeId: route.routeId,
      carrierId: vehicle.carrierId || 'CARRIER',
      driverId: driverId || vehicle.assignedDriverId || '',
      plannedDeparture: departure,
      currentStopIndex: 0,
      currentStop: originStop,
      status: 'PLANNED'
    });
    await trip.save();

    // Create TripStop sequence records
    const stopsList = route.stopsDetails || [];
    if (stopsList.length > 0) {
      for (const sd of stopsList) {
        await TripStop.create({
          trip: trip._id,
          tripId: trip.tripId,
          stopId: sd.stopId || `STP-${sd.sequenceNumber}`,
          sequence: sd.sequenceNumber,
          location: sd.locationName,
          plannedArrival: departure,
          verificationStatus: sd.sequenceNumber === 1 ? 'READY' : 'UPCOMING',
          qrToken: sd.qrToken || `TKN-${trip.tripId}-${sd.sequenceNumber}`
        });
      }
    }

    res.status(201).json({ success: true, message: 'Trip created successfully', trip });
  } catch (error) {
    console.error('createTrip error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get trip details by tripId (including latest load plan)
 * @route   GET /api/trips/:tripId
 */
export const getTripById = async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await Trip.findOne({ tripId })
      .populate('vehicle')
      .populate('route')
      .populate('driver', 'username name email');

    if (!trip) return res.status(404).json({ success: false, message: `Trip ${tripId} not found.` });

    const stops = await TripStop.find({ tripId }).sort({ sequence: 1 });
    const latestPlan = await LoadPlan.findOne({ tripId }).sort({ version: -1 });

    let assignments = [];
    if (latestPlan) {
      assignments = await LoadAssignment.find({ loadPlanId: latestPlan.loadPlanId }).sort({ loadingSequence: 1 });
    }

    res.json({
      trip,
      stops,
      latestPlan,
      assignments
    });
  } catch (error) {
    console.error('getTripById error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get eligible candidate shipments for a trip
 * @route   GET /api/trips/:tripId/candidates
 */
export const getCandidateShipmentsForTrip = async (req, res) => {
  try {
    const { tripId } = req.params;
    const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route');
    if (!trip) return res.status(404).json({ success: false, message: `Trip ${tripId} not found.` });

    const route = trip.route;
    const stops = route.stopsDetails?.length > 1
      ? route.stopsDetails.map(s => s.locationName)
      : (route.stops?.length > 1 ? route.stops : [route.source, route.destination]);

    // Find pending/booked/allocated shipments eligible for this route
    const rawShipments = await Shipment.find({
      status: { $in: ['DRAFT', 'PENDING', 'BOOKED', 'ALLOCATED'] }
    }).sort({ priority: -1, requestedDate: 1 });

    // Filter to those whose pickup and delivery lie on the route in forward sequence
    const eligibleCandidates = [];
    for (const s of rawShipments) {
      const pIdx = stops.findIndex(st => norm(st) === norm(s.pickupStop));
      const dIdx = stops.findIndex(st => norm(st) === norm(s.deliveryStop));

      if (pIdx !== -1 && dIdx !== -1 && pIdx < dIdx) {
        eligibleCandidates.push({
          shipmentId: s.shipmentId,
          bookingId: s.shipmentId,
          customer: s.shipperId || 'Shipper',
          cargoDescription: s.cargoDescription,
          pickup: s.pickupStop,
          delivery: s.deliveryStop,
          pickupIndex: pIdx,
          deliveryIndex: dIdx,
          volume: s.volume,
          weight: s.weight,
          dimensions: { length: s.length, width: s.width, height: s.height },
          fragile: s.fragile,
          stackable: s.stackable,
          priority: s.priority || 'STANDARD',
          requestedDate: s.requestedDate,
          status: s.status
        });
      }
    }

    res.json({
      tripId,
      vehicle: trip.vehicle,
      route: trip.route,
      stops,
      candidatesCount: eligibleCandidates.length,
      candidates: eligibleCandidates
    });
  } catch (error) {
    console.error('getCandidateShipmentsForTrip error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Preview optimization in-memory (ZERO database mutations)
 * @route   POST /api/trips/:tripId/optimize/preview
 */
export const previewOptimization = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { customCandidates, config } = req.body;

    const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route');
    if (!trip) return res.status(404).json({ success: false, message: `Trip ${tripId} not found.` });

    // Resolve candidates
    let candidatesToUse = customCandidates;
    if (!candidatesToUse || !Array.isArray(candidatesToUse) || candidatesToUse.length === 0) {
      const route = trip.route;
      const stops = route.stopsDetails?.length > 1
        ? route.stopsDetails.map(s => s.locationName)
        : (route.stops?.length > 1 ? route.stops : [route.source, route.destination]);

      const rawShipments = await Shipment.find({
        status: { $in: ['DRAFT', 'PENDING', 'BOOKED', 'ALLOCATED'] }
      });

      candidatesToUse = rawShipments
        .filter(s => {
          const pIdx = stops.findIndex(st => norm(st) === norm(s.pickupStop));
          const dIdx = stops.findIndex(st => norm(st) === norm(s.deliveryStop));
          return pIdx !== -1 && dIdx !== -1 && pIdx < dIdx;
        })
        .map(s => ({
          shipmentId: s.shipmentId,
          bookingId: s.shipmentId,
          customer: s.shipperId,
          cargoDescription: s.cargoDescription,
          pickup: s.pickupStop,
          delivery: s.deliveryStop,
          volume: s.volume,
          weight: s.weight,
          dimensions: { length: s.length, width: s.width, height: s.height },
          fragile: s.fragile,
          stackable: s.stackable,
          priority: s.priority
        }));
    }

    // Run pure optimizer
    const result = generateLoadPlan({
      truck: trip.vehicle,
      route: trip.route,
      shipments: candidatesToUse,
      currentLoad: [],
      config: config || {}
    });

    res.json({
      success: true,
      preview: true,
      tripId,
      truck: trip.vehicle,
      route: trip.route,
      optimizationResult: result
    });
  } catch (error) {
    console.error('previewOptimization error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Run optimizer and generate a persistent LoadPlan version (status = GENERATED / UNDER_REVIEW)
 * @route   POST /api/trips/:tripId/optimize/generate
 */
export const generateTripLoadPlan = async (req, res) => {
  const session = await mongoose.startSession();
  let tx = false;
  try {
    try { session.startTransaction(); tx = true; } catch (e) {}

    const { tripId } = req.params;
    const { customCandidates, config } = req.body;

    const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route').session(session);
    if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

    if (['DISPATCHED', 'IN_TRANSIT', 'COMPLETED'].includes(trip.status)) {
      throw { status: 400, message: `Cannot generate load plan for trip in '${trip.status}' status.` };
    }

    // Resolve candidates
    let candidatesToUse = customCandidates;
    if (!candidatesToUse || !Array.isArray(candidatesToUse) || candidatesToUse.length === 0) {
      const route = trip.route;
      const stops = route.stopsDetails?.length > 1
        ? route.stopsDetails.map(s => s.locationName)
        : (route.stops?.length > 1 ? route.stops : [route.source, route.destination]);

      const rawShipments = await Shipment.find({
        status: { $in: ['DRAFT', 'PENDING', 'BOOKED', 'ALLOCATED'] }
      }).session(session);

      candidatesToUse = rawShipments
        .filter(s => {
          const pIdx = stops.findIndex(st => norm(st) === norm(s.pickupStop));
          const dIdx = stops.findIndex(st => norm(st) === norm(s.deliveryStop));
          return pIdx !== -1 && dIdx !== -1 && pIdx < dIdx;
        })
        .map(s => ({
          shipmentId: s.shipmentId,
          bookingId: s.shipmentId,
          customer: s.shipperId,
          cargoDescription: s.cargoDescription,
          pickup: s.pickupStop,
          delivery: s.deliveryStop,
          volume: s.volume,
          weight: s.weight,
          dimensions: { length: s.length, width: s.width, height: s.height },
          fragile: s.fragile,
          stackable: s.stackable,
          priority: s.priority
        }));
    }

    // Run core domain optimizer
    const optResult = generateLoadPlan({
      truck: trip.vehicle,
      route: trip.route,
      shipments: candidatesToUse,
      currentLoad: [],
      config: config || {}
    });

    // Determine version number
    const lastPlan = await LoadPlan.findOne({ tripId }).sort({ version: -1 }).session(session);
    const nextVersion = lastPlan ? lastPlan.version + 1 : 1;

    // Supersede older unapproved plans
    if (lastPlan && lastPlan.status === 'GENERATED') {
      lastPlan.status = 'SUPERSEDED';
      lastPlan.auditLog.push({
        action: 'SUPERSEDED',
        performedBy: req.user?.username || 'system',
        timestamp: new Date(),
        notes: `Superseded by new version ${nextVersion}`,
        version: lastPlan.version
      });
      await lastPlan.save({ session });
    }

    const loadPlanId = `LP-${tripId}-v${nextVersion}-${Date.now()}`;
    const newPlan = new LoadPlan({
      loadPlanId,
      trip: trip._id,
      tripId,
      vehicleId: trip.vehicleId,
      routeId: trip.routeId,
      version: nextVersion,
      optimizerVersion: optResult.algorithmVersion,
      strategyUsed: optResult.loadPlan.strategyUsed,
      generatedAt: new Date(),
      objectiveScore: optResult.objectiveScore,
      scoreBreakdown: optResult.scoreBreakdown,
      volumeUtilization: optResult.overallVolumeUtilization,
      weightUtilization: optResult.overallWeightUtilization,
      peakUtilization: {
        volume: optResult.peakVolumeUtilization,
        weight: optResult.peakWeightUtilization
      },
      segmentUtilization: optResult.segmentUtilization,
      unassignedShipments: optResult.unassignedShipments,
      warnings: optResult.warnings,
      explanation: optResult.explanation,
      status: 'GENERATED',
      isImmutable: false,
      auditLog: [{
        action: 'GENERATED',
        performedBy: req.user?.username || 'manager',
        timestamp: new Date(),
        notes: `Generated ${optResult.assignments.length} assignments via ${optResult.loadPlan.strategyUsed}`,
        version: nextVersion
      }]
    });
    await newPlan.save({ session });

    // Save assignments
    const savedAssignments = [];
    for (const a of optResult.assignments) {
      const assignDoc = new LoadAssignment({
        loadPlan: newPlan._id,
        loadPlanId: newPlan.loadPlanId,
        shipmentId: a.shipmentId,
        bookingId: a.bookingId,
        customer: a.customer || '',
        priority: a.priority,
        fragile: a.fragile,
        stackable: a.stackable,
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
        orientation: a.orientation,
        position: a.position,
        obstructionScore: a.obstructionScore || 0,
        status: 'PROPOSED'
      });
      await assignDoc.save({ session });
      savedAssignments.push(assignDoc);
    }

    if (tx) await session.commitTransaction();

    res.status(201).json({
      success: true,
      message: `Load plan v${nextVersion} generated successfully`,
      loadPlan: newPlan,
      assignments: savedAssignments,
      unassigned: optResult.unassignedShipments,
      optimizationResult: optResult
    });
  } catch (error) {
    if (tx) await session.abortTransaction();
    console.error('generateTripLoadPlan error:', error);
    res.status(error.status || 400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Get load plan by tripId (or specific version)
 * @route   GET /api/trips/:tripId/load-plan
 */
export const getTripLoadPlan = async (req, res) => {
  try {
    const { tripId } = req.params;
    const { version, loadPlanId } = req.query;

    const filter = { tripId };
    if (loadPlanId) filter.loadPlanId = loadPlanId;
    if (version) filter.version = parseInt(version);

    const loadPlan = await LoadPlan.findOne(filter).sort({ version: -1 });
    if (!loadPlan) return res.status(404).json({ success: false, message: 'Load plan not found.' });

    const assignments = await LoadAssignment.find({ loadPlanId: loadPlan.loadPlanId }).sort({ loadingSequence: 1 });

    res.json({
      loadPlan,
      assignments
    });
  } catch (error) {
    console.error('getTripLoadPlan error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Approve a load plan version (with optimistic locking)
 * @route   POST /api/trips/:tripId/load-plan/:loadPlanId/approve
 */
export const approveTripLoadPlan = async (req, res) => {
  const session = await mongoose.startSession();
  let tx = false;
  try {
    try { session.startTransaction(); tx = true; } catch (e) {}

    const { tripId, loadPlanId } = req.params;
    const { expectedVersion, notes } = req.body;

    const trip = await Trip.findOne({ tripId }).session(session);
    if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

    if (['DISPATCHED', 'IN_TRANSIT', 'COMPLETED'].includes(trip.status)) {
      throw { status: 400, message: `Cannot approve load plan: Trip ${tripId} is already ${trip.status}.` };
    }

    const plan = await LoadPlan.findOne({ loadPlanId, tripId }).session(session);
    if (!plan) throw { status: 404, message: `Load plan ${loadPlanId} not found.` };

    // Optimistic locking check
    if (expectedVersion !== undefined && plan.version !== expectedVersion) {
      throw {
        status: 409,
        message: `Concurrency Conflict: Plan has been modified to version ${plan.version} (expected ${expectedVersion}). Please review latest version.`
      };
    }

    if (plan.status === 'APPROVED') {
      return res.json({ success: true, message: 'Plan already approved', loadPlan: plan });
    }

    const now = new Date();

    // 1. Supersede any other approved plans on this trip
    await LoadPlan.updateMany(
      { tripId, loadPlanId: { $ne: loadPlanId }, status: 'APPROVED' },
      {
        $set: { status: 'SUPERSEDED' },
        $push: {
          auditLog: {
            action: 'SUPERSEDED',
            performedBy: req.user?.username || 'manager',
            timestamp: now,
            notes: `Superseded by approval of ${loadPlanId}`
          }
        }
      },
      { session }
    );

    // 2. Mark this plan as APPROVED
    plan.status = 'APPROVED';
    plan.approvedBy = req.user?._id;
    plan.approvedByUsername = req.user?.username || 'manager';
    plan.approvedAt = now;
    plan.auditLog.push({
      action: 'APPROVED',
      performedBy: req.user?.username || 'manager',
      timestamp: now,
      notes: notes || 'Load plan reviewed and approved by logistics manager.',
      version: plan.version
    });
    await plan.save({ session });

    // 3. Atomically update all assigned shipments and bookings to ALLOCATED
    const assignments = await LoadAssignment.find({ loadPlanId }).session(session);
    for (const assign of assignments) {
      assign.status = 'ASSIGNED';
      await assign.save({ session });

      if (assign.shipmentId) {
        await Shipment.updateOne(
          { shipmentId: assign.shipmentId },
          { status: 'ALLOCATED' },
          { session }
        );
      }
      if (assign.bookingId) {
        await Booking.updateOne(
          { bookingId: assign.bookingId },
          { vehicleId: trip.vehicleId, status: 'ALLOCATED' },
          { session }
        );
      }
    }

    // 4. Update Trip status to READY_FOR_DISPATCH
    trip.status = 'READY_FOR_DISPATCH';
    await trip.save({ session });

    if (tx) await session.commitTransaction();

    res.json({
      success: true,
      message: `Load Plan v${plan.version} approved successfully! Trip ${trip.tripId} is READY_FOR_DISPATCH.`,
      loadPlan: plan,
      trip
    });
  } catch (error) {
    if (tx) await session.abortTransaction();
    console.error('approveTripLoadPlan error:', error);
    res.status(error.status || 500).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Reject a load plan version
 * @route   POST /api/trips/:tripId/load-plan/:loadPlanId/reject
 */
export const rejectTripLoadPlan = async (req, res) => {
  try {
    const { tripId, loadPlanId } = req.params;
    const { reason } = req.body;

    const plan = await LoadPlan.findOne({ loadPlanId, tripId });
    if (!plan) return res.status(404).json({ success: false, message: 'Load plan not found.' });

    if (plan.isImmutable) {
      return res.status(400).json({ success: false, message: 'Cannot reject immutable load plan.' });
    }

    plan.status = 'REJECTED';
    plan.auditLog.push({
      action: 'REJECTED',
      performedBy: req.user?.username || 'manager',
      timestamp: new Date(),
      notes: reason || 'Rejected by logistics manager.'
    });
    await plan.save();

    res.json({ success: true, message: 'Load plan rejected', loadPlan: plan });
  } catch (error) {
    console.error('rejectTripLoadPlan error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Dispatch trip (locks approved load plan immutably and starts transit)
 * @route   POST /api/trips/:tripId/dispatch
 */
export const dispatchPlannedTrip = async (req, res) => {
  const session = await mongoose.startSession();
  let tx = false;
  try {
    try { session.startTransaction(); tx = true; } catch (e) {}

    const { tripId } = req.params;

    const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route').session(session);
    if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

    // Verify trip has an APPROVED load plan
    const approvedPlan = await LoadPlan.findOne({ tripId, status: 'APPROVED' }).session(session);
    if (!approvedPlan) {
      throw { status: 400, message: `Cannot dispatch Trip ${tripId}: No APPROVED load plan found. Please generate and approve a load plan first.` };
    }

    // 1. Lock load plan as ACTIVE and IMMUTABLE
    approvedPlan.status = 'ACTIVE';
    approvedPlan.isImmutable = true;
    approvedPlan.auditLog.push({
      action: 'ACTIVE',
      performedBy: req.user?.username || 'dispatcher',
      timestamp: new Date(),
      notes: `Trip dispatched. Load plan v${approvedPlan.version} is now immutable.`
    });
    await approvedPlan.save({ session });

    // 2. Mark trip status as IN_TRANSIT
    const now = new Date();
    trip.status = 'IN_TRANSIT';
    trip.actualDeparture = now;
    trip.startedAt = now;
    await trip.save({ session });

    // 3. Mark vehicle as IN_TRANSIT
    const vehicle = await Vehicle.findOne({ vehicleId: trip.vehicleId }).session(session);
    if (vehicle) {
      vehicle.transitStatus = 'IN_TRANSIT';
      vehicle.activeTripId = trip.tripId;
      vehicle.tripStartedAt = now;
      await vehicle.save({ session });
    }

    if (tx) await session.commitTransaction();

    res.json({
      success: true,
      message: `Trip ${tripId} successfully dispatched! Truck ${trip.vehicleId} is IN_TRANSIT.`,
      trip,
      loadPlan: approvedPlan
    });
  } catch (error) {
    if (tx) await session.abortTransaction();
    console.error('dispatchPlannedTrip error:', error);
    res.status(error.status || 400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
};

/**
 * @desc    Preview dynamic re-optimization for remaining route (In-memory, 0 DB mutations)
 * @route   POST /api/trips/:tripId/reoptimize/preview
 */
export const previewDynamicReoptimizationController = async (req, res) => {
  const { tripId } = req.params;
  const { additionalCandidateShipmentIds, reason } = req.body;

  try {
    const { computeDynamicReoptimization } = await import('../services/dynamicReoptimizationService.js');
    const result = await computeDynamicReoptimization({
      tripId,
      additionalCandidateShipmentIds,
      reason: reason || 'Manager re-optimization simulation'
    });

    res.json({
      success: true,
      preview: true,
      message: 'Dynamic re-optimization simulation computed in-memory.',
      ...result
    });
  } catch (error) {
    console.error('previewDynamicReoptimizationController error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Dynamic re-optimization preview failed.'
    });
  }
};

/**
 * @desc    Apply dynamic re-optimization creating a persistent new version of LoadPlan
 * @route   POST /api/trips/:tripId/reoptimize/apply
 */
export const applyDynamicReoptimizationController = async (req, res) => {
  const { tripId } = req.params;
  const { additionalCandidateShipmentIds, autoApprove, reason } = req.body;

  const session = await mongoose.startSession();
  let tx = false;
  try {
    try { session.startTransaction(); tx = true; } catch (e) {}

    const { applyDynamicReoptimization } = await import('../services/dynamicReoptimizationService.js');
    const result = await applyDynamicReoptimization({
      tripId,
      additionalCandidateShipmentIds,
      autoApprove: autoApprove ?? false,
      reason: reason || 'Dynamic downstream capacity optimization',
      performedBy: req.user?.username || 'manager',
      session
    });

    if (tx) await session.commitTransaction();

    res.status(201).json(result);
  } catch (error) {
    if (tx) await session.abortTransaction();
    console.error('applyDynamicReoptimizationController error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Failed to apply dynamic re-optimization.'
    });
  } finally {
    session.endSession();
  }
};

