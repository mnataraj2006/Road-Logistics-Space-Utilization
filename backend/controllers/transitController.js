import crypto from 'crypto';
import mongoose from 'mongoose';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Booking, { isValidBookingStatusTransition } from '../models/Booking.js';
import Payment from '../models/Payment.js';
import StopVerification from '../models/StopVerification.js';
import { calculateTruckSegmentCapacity, getRemainingCapacityForTruck } from '../services/capacityService.js';

/**
 * Helper to execute code within a Mongoose transaction session.
 * Handles standalone mongod fallback gracefully if transactions are not supported.
 */
const runTransaction = async (workFn) => {
  const session = await mongoose.startSession();
  let transactionStarted = false;

  try {
    try {
      session.startTransaction();
      transactionStarted = true;
    } catch (err) {
      console.warn('MongoDB session.startTransaction not available; executing in session mode.');
    }

    const result = await workFn(session);

    if (transactionStarted) {
      await session.commitTransaction();
    }
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        console.error('Error aborting transaction:', abortErr);
      }
    }
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Transactional Dispatch Truck for trip start.
 * Loads origin packages, leaves future pickup packages as WAITING_FOR_PICKUP.
 * @route POST /api/transit/dispatch/:vehicleId
 */
export const dispatchTruck = async (req, res) => {
  const { vehicleId } = req.params;

  try {
    const result = await runTransaction(async (session) => {
      // 1. Verify truck exists
      const vehicle = await Vehicle.findOne({ vehicleId }).session(session);
      if (!vehicle) {
        throw { status: 404, message: 'Truck not found.' };
      }

      // 2. Verify truck active status
      if (vehicle.status !== 'Active') {
        throw { status: 400, message: 'Truck is not active.' };
      }

      // 3. Verify truck is not already in transit
      if (vehicle.transitStatus !== 'READY' && vehicle.transitStatus !== 'Idle') {
        throw { status: 400, message: `Truck is already in transit (Status: '${vehicle.transitStatus}').` };
      }

      // 4. Verify route exists and has stops
      if (!vehicle.routeLane || vehicle.routeLane === 'Inactive Lane') {
        throw { status: 400, message: 'Truck has no assigned route lane.' };
      }

      const route = await Route.findOne({ routeId: vehicle.routeLane }).session(session);
      if (!route || !route.stopsDetails || route.stopsDetails.length < 2) {
        throw { status: 400, message: 'Assigned route has invalid or insufficient stop details.' };
      }

      // 5. Verify origin stop
      const originStopName = route.stopsDetails[0].locationName;

      // 6. Find packages assigned to truck
      const activeBookings = await Booking.find({
        vehicleId,
        status: { $in: ['Pending', 'PENDING', 'ALLOCATED', 'WAITING_FOR_PICKUP'] }
      }).session(session);

      const loadedPackages = [];
      const waitingPackages = [];

      // Categorize packages into origin pickups vs future pickups
      for (const bkg of activeBookings) {
        const isOriginPickup = bkg.fromStop && bkg.fromStop.toLowerCase().trim() === originStopName.toLowerCase().trim();
        if (isOriginPickup) {
          loadedPackages.push(bkg);
        } else {
          waitingPackages.push(bkg);
        }
      }

      // 7 & 8. Validate capacity for the first segment (origin packages ONLY)
      const initialCapacityCheck = calculateTruckSegmentCapacity(vehicle, route, loadedPackages);
      if (initialCapacityCheck.segments.length > 0) {
        const firstSegment = initialCapacityCheck.segments[0];
        if (firstSegment.usedVolume > vehicle.capacityVolume || firstSegment.usedWeight > vehicle.capacityWeight) {
          throw {
            status: 400,
            message: 'Dispatch failed. Origin cargo exceeds truck capacity for the initial segment.',
            details: {
              segment: `${firstSegment.fromStop} → ${firstSegment.toStop}`,
              volumeUsed: firstSegment.usedVolume,
              volumeCapacity: vehicle.capacityVolume,
              weightUsed: firstSegment.usedWeight,
              weightCapacity: vehicle.capacityWeight
            }
          };
        }
      }

      const tripId = `TRIP-${Date.now()}`;
      const now = new Date();

      // 9 & 10. Update package status
      for (const bkg of loadedPackages) {
        if (!isValidBookingStatusTransition(bkg.status, 'IN_TRANSIT')) {
          throw { status: 400, message: `Invalid status transition for package ${bkg.bookingId}.` };
        }
        bkg.status = 'IN_TRANSIT';
        bkg.loadedAt = now;
        await bkg.save({ session });
      }

      for (const bkg of waitingPackages) {
        if (!isValidBookingStatusTransition(bkg.status, 'WAITING_FOR_PICKUP')) {
          throw { status: 400, message: `Invalid status transition for package ${bkg.bookingId}.` };
        }
        bkg.status = 'WAITING_FOR_PICKUP';
        await bkg.save({ session });
      }

      // 11. Update truck transit status
      vehicle.transitStatus = 'IN_TRANSIT';
      vehicle.currentStop = '';
      vehicle.currentRouteIndex = 0;
      vehicle.tripStartedAt = now;
      vehicle.activeTripId = tripId;
      await vehicle.save({ session });

      // 12. Update route stop details
      route.stopsDetails[0].status = 'Completed';
      route.stopsDetails[0].actualArrival = now;
      route.stopsDetails[0].completedAt = now;

      if (route.stopsDetails[1]) {
        route.stopsDetails[1].status = 'Ready';
        route.stopsDetails[1].plannedArrival = now;
      }
      route.currentStopIndex = 0;
      route.status = 'In Transit';
      await route.save({ session });

      return {
        vehicle,
        tripId,
        originStop: originStopName,
        nextExpectedStop: route.stopsDetails[1] ? route.stopsDetails[1].locationName : '',
        loadedCount: loadedPackages.length,
        waitingCount: waitingPackages.length
      };
    });

    const capacitySummary = await getRemainingCapacityForTruck(vehicleId);

    res.json({
      success: true,
      message: `Truck ${vehicleId} dispatched on route ${result.vehicle.routeLane}. Loaded ${result.loadedCount} packages at origin (${result.originStop}). ${result.waitingCount} packages set to WAITING_FOR_PICKUP for downstream stops.`,
      vehicle: result.vehicle,
      tripId: result.tripId,
      originStop: result.originStop,
      nextExpectedStop: result.nextExpectedStop,
      loadedCount: result.loadedCount,
      waitingCount: result.waitingCount,
      capacitySummary
    });
  } catch (error) {
    console.error('Dispatch transaction error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Dispatch failed due to server error.',
      details: error.details || null
    });
  }
};

/**
 * Server-Side Transactional QR Stop Verification with 15-Step Validation Pipeline
 * @route POST /api/transit/verify-stop
 */
export const verifyStop = async (req, res) => {
  const { vehicleId, qrToken } = req.body;

  if (!vehicleId || !qrToken) {
    return res.status(400).json({
      success: false,
      message: 'Both vehicleId and qrToken are required for verification.'
    });
  }

  try {
    const result = await runTransaction(async (session) => {
      // STEP 1: Find truck
      const vehicle = await Vehicle.findOne({ vehicleId }).session(session);
      if (!vehicle) {
        throw { status: 404, message: `Truck '${vehicleId}' not found.` };
      }

      // STEP 2: Verify truck is active
      if (vehicle.status !== 'Active') {
        throw { status: 400, message: `Truck '${vehicleId}' is not active.` };
      }

      // STEP 3: Verify truck has active route/trip
      if (!vehicle.routeLane || vehicle.routeLane === 'Inactive Lane') {
        throw { status: 400, message: `Truck '${vehicleId}' has no route assigned.` };
      }

      if (vehicle.transitStatus === 'READY' || vehicle.transitStatus === 'Idle' || vehicle.transitStatus === 'COMPLETED') {
        throw { status: 400, message: 'No active trip found.' };
      }

      const route = await Route.findOne({ routeId: vehicle.routeLane }).session(session);
      if (!route || !route.stopsDetails || route.stopsDetails.length === 0) {
        throw { status: 404, message: 'Assigned route missing stop configuration.' };
      }

      // STEP 4 & STEP 5: Find QR token & verify QR belongs to this truck's route
      const stopIndex = route.stopsDetails.findIndex(s => s.qrToken === qrToken);
      if (stopIndex === -1) {
        throw {
          status: 400,
          message: 'Invalid QR token. QR token does not belong to this truck\'s route.'
        };
      }

      const targetStop = route.stopsDetails[stopIndex];

      // STEP 6 & STEP 7: Find expected next stop & verify scanned stop equals expected stop
      const expectedNextIndex = vehicle.currentRouteIndex + 1;
      if (stopIndex !== expectedNextIndex) {
        const expectedStopName = route.stopsDetails[expectedNextIndex]
          ? route.stopsDetails[expectedNextIndex].locationName
          : 'Unknown';
        throw {
          status: 400,
          message: `Invalid stop. Expected ${expectedStopName}. Scanned ${targetStop.locationName}.`
        };
      }

      // STEP 8: Verify stop has not already been completed (Duplicate scan protection)
      if (targetStop.status === 'Completed') {
        throw { status: 400, message: `Stop '${targetStop.locationName}' has already been verified.` };
      }

      // STEP 9: Find packages assigned to this truck
      const allAssignedBookings = await Booking.find({
        vehicleId,
        status: { $in: ['Pending', 'PENDING', 'ALLOCATED', 'WAITING_FOR_PICKUP', 'LOADED', 'In Transit', 'IN_TRANSIT'] }
      }).session(session);

      // STEP 10: Determine packages to unload (delivery stop == current stop)
      const packagesToUnload = allAssignedBookings.filter(bkg => {
        const isLoaded = ['LOADED', 'In Transit', 'IN_TRANSIT'].includes(bkg.status);
        const matchesDelivery = bkg.toStop && bkg.toStop.toLowerCase().trim() === targetStop.locationName.toLowerCase().trim();
        return isLoaded && matchesDelivery;
      });

      // STEP 11: Determine packages to load (pickup stop == current stop & WAITING_FOR_PICKUP / ALLOCATED)
      const packagesToLoadCandidate = allAssignedBookings.filter(bkg => {
        const isWaiting = ['Pending', 'PENDING', 'ALLOCATED', 'WAITING_FOR_PICKUP'].includes(bkg.status);
        const matchesPickup = bkg.fromStop && bkg.fromStop.toLowerCase().trim() === targetStop.locationName.toLowerCase().trim();
        return isWaiting && matchesPickup;
      });

      // STEP 12: Calculate capacity before operations
      const capBefore = calculateTruckSegmentCapacity(vehicle, route, allAssignedBookings);

      // STEP 13 & STEP 14 & STEP 15: SIMULATE UNLOAD, LOAD, AND VALIDATE CAPACITY
      // Remaining loaded packages = currently loaded - unloaded
      const currentlyLoaded = allAssignedBookings.filter(bkg => ['LOADED', 'In Transit', 'IN_TRANSIT'].includes(bkg.status));
      const unloadIds = new Set(packagesToUnload.map(b => b._id.toString()));
      const remainingLoaded = currentlyLoaded.filter(b => !unloadIds.has(b._id.toString()));

      // Downstream waiting packages (not picked up yet at this stop)
      const downstreamWaiting = allAssignedBookings.filter(bkg => {
        const isWaiting = ['Pending', 'PENDING', 'ALLOCATED', 'WAITING_FOR_PICKUP'].includes(bkg.status);
        const matchesPickup = bkg.fromStop && bkg.fromStop.toLowerCase().trim() === targetStop.locationName.toLowerCase().trim();
        return isWaiting && !matchesPickup;
      });

      // Simulated active bookings after this stop verification
      const simulatedActiveBookings = [
        ...remainingLoaded,
        ...packagesToLoadCandidate,
        ...downstreamWaiting
      ];

      // Calculate simulated capacity across remaining route segments
      const capSimulated = calculateTruckSegmentCapacity(vehicle, route, simulatedActiveBookings);

      // Inspect segment capacity for remaining route legs (from current stopIndex onwards)
      for (let i = stopIndex; i < capSimulated.segments.length; i++) {
        const seg = capSimulated.segments[i];
        if (seg.usedVolume > vehicle.capacityVolume || seg.usedWeight > vehicle.capacityWeight) {
          throw {
            status: 400,
            message: 'Stop operation cannot be completed because the assigned load exceeds remaining truck capacity.',
            details: {
              segment: `${seg.fromStop} → ${seg.toStop}`,
              volumeUsed: seg.usedVolume,
              volumeCapacity: vehicle.capacityVolume,
              weightUsed: seg.usedWeight,
              weightCapacity: vehicle.capacityWeight
            }
          };
        }
      }

      // ALL VALIDATION SUCCEEDED: PERFORM DATABASE WRITES INSIDE TRANSACTION

      const now = new Date();
      const unloadedDetails = [];
      const loadedDetails = [];

      // UNLOAD PACKAGES FIRST
      for (const bkg of packagesToUnload) {
        if (!isValidBookingStatusTransition(bkg.status, 'DELIVERED')) {
          throw { status: 400, message: `Invalid status transition to DELIVERED for package ${bkg.bookingId}.` };
        }
        bkg.status = 'DELIVERED';
        bkg.deliveredAt = now;
        await bkg.save({ session });

        unloadedDetails.push({
          bookingId: bkg.bookingId,
          volume: bkg.volume,
          weight: bkg.weight,
          shipperId: bkg.shipperId,
          fromStop: bkg.fromStop,
          toStop: bkg.toStop
        });

        // Release payment escrow
        const payment = await Payment.findOne({ bookingId: bkg.bookingId }).session(session);
        if (payment) {
          payment.status = 'PaidOut';
          await payment.save({ session });
        }
      }

      // LOAD NEW PACKAGES SECOND
      for (const bkg of packagesToLoadCandidate) {
        if (!isValidBookingStatusTransition(bkg.status, 'IN_TRANSIT')) {
          throw { status: 400, message: `Invalid status transition to IN_TRANSIT for package ${bkg.bookingId}.` };
        }
        bkg.status = 'IN_TRANSIT';
        bkg.loadedAt = now;
        await bkg.save({ session });

        loadedDetails.push({
          bookingId: bkg.bookingId,
          volume: bkg.volume,
          weight: bkg.weight,
          shipperId: bkg.shipperId,
          fromStop: bkg.fromStop,
          toStop: bkg.toStop
        });
      }

      // Update Route Stop
      targetStop.status = 'Completed';
      targetStop.actualArrival = now;
      targetStop.completedAt = now;

      // Update indices
      vehicle.currentRouteIndex = stopIndex;
      route.currentStopIndex = stopIndex;

      const isFinalStop = stopIndex === route.stopsDetails.length - 1;
      let nextStopName = '';

      if (isFinalStop) {
        // FINAL STOP VALIDATION: Check if any undelivered packages remain
        const undeliveredPackages = await Booking.find({
          vehicleId,
          status: { $in: ['Pending', 'PENDING', 'ALLOCATED', 'WAITING_FOR_PICKUP', 'LOADED', 'In Transit', 'IN_TRANSIT'] }
        }).session(session);

        if (undeliveredPackages.length > 0) {
          throw {
            status: 400,
            message: `Cannot complete trip. Undelivered packages remain (${undeliveredPackages.length} package(s) undelivered).`,
            details: { undeliveredCount: undeliveredPackages.length, undeliveredIds: undeliveredPackages.map(b => b.bookingId) }
          };
        }

        vehicle.transitStatus = 'COMPLETED';
        vehicle.currentStop = targetStop.locationName;
        vehicle.activeTripId = '';
        route.status = 'Completed';
      } else {
        vehicle.transitStatus = 'IN_TRANSIT';
        vehicle.currentStop = '';
        const nextStop = route.stopsDetails[stopIndex + 1];
        if (nextStop) {
          nextStop.status = 'Ready';
          nextStopName = nextStop.locationName;
        }
      }

      await route.save({ session });
      await vehicle.save({ session });

      // Create Audit History Record
      const auditRecord = new StopVerification({
        vehicleId,
        routeId: route.routeId,
        stopId: targetStop.stopId,
        locationName: targetStop.locationName,
        sequenceNumber: targetStop.sequenceNumber,
        timestamp: now,
        verificationMethod: 'QR',
        packagesUnloaded: unloadedDetails,
        packagesLoaded: loadedDetails,
        volumeBefore: capBefore.usedVolume,
        volumeAfter: capSimulated.usedVolume,
        weightBefore: capBefore.usedWeight,
        weightAfter: capSimulated.usedWeight
      });
      await auditRecord.save({ session });

      return {
        auditRecord,
        vehicle,
        targetStop,
        unloadedDetails,
        loadedDetails,
        capSimulated,
        nextStopName,
        isFinalStop
      };
    });

    res.json({
      success: true,
      message: 'STOP VERIFIED',
      verificationId: result.auditRecord._id,
      vehicleId,
      stop: result.targetStop.locationName,
      arrivalTime: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      operations: {
        unloadedCount: result.unloadedDetails.length,
        unloaded: result.unloadedDetails,
        loadedCount: result.loadedDetails.length,
        loaded: result.loadedDetails
      },
      capacityAfter: {
        capacityVolume: result.vehicle.capacityVolume,
        usedVolume: result.capSimulated.usedVolume,
        remainingVolume: result.capSimulated.remainingVolume,
        capacityWeight: result.vehicle.capacityWeight,
        usedWeight: result.capSimulated.usedWeight,
        remainingWeight: result.capSimulated.remainingWeight,
        volumeUtilizationPercent: result.capSimulated.volumeUtilizationPercent,
        weightUtilizationPercent: result.capSimulated.weightUtilizationPercent
      },
      nextStop: result.nextStopName,
      transitStatus: result.vehicle.transitStatus,
      isFinalStop: result.isFinalStop
    });
  } catch (error) {
    console.error('Stop verification transaction error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Stop verification failed.',
      details: error.details || null
    });
  }
};

/**
 * Get active transits
 * @route GET /api/transit/active
 */
export const getActiveTransits = async (req, res) => {
  try {
    const vehicles = await Vehicle.find({
      transitStatus: { $in: ['READY', 'DISPATCHED', 'IN_TRANSIT', 'AT_STOP'] }
    });

    const activeList = await Promise.all(vehicles.map(async (v) => {
      const route = await Route.findOne({ routeId: v.routeLane });
      const cap = await getRemainingCapacityForTruck(v.vehicleId);

      let nextStop = '';
      if (route && route.stopsDetails && route.stopsDetails.length > v.currentRouteIndex + 1) {
        nextStop = route.stopsDetails[v.currentRouteIndex + 1].locationName;
      }

      const activeBookings = await Booking.find({
        vehicleId: v.vehicleId,
        status: { $in: ['LOADED', 'In Transit', 'IN_TRANSIT'] }
      });

      return {
        vehicleId: v.vehicleId,
        type: v.type,
        routeId: v.routeLane,
        transitStatus: v.transitStatus,
        currentStop: v.currentStop || (route && route.stopsDetails ? route.stopsDetails[v.currentRouteIndex]?.locationName : 'Depot'),
        nextStop,
        currentRouteIndex: v.currentRouteIndex,
        totalStops: route && route.stopsDetails ? route.stopsDetails.length : 0,
        loadedPackagesCount: activeBookings.length,
        capacity: cap
      };
    }));

    res.json(activeList);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get transit status & LIFO loading sequence recommendation for a truck
 * @route GET /api/transit/:vehicleId/status
 */
export const getVehicleTransitStatus = async (req, res) => {
  const { vehicleId } = req.params;

  try {
    const vehicle = await Vehicle.findOne({ vehicleId });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found.' });

    const route = await Route.findOne({ routeId: vehicle.routeLane });
    const capacity = await getRemainingCapacityForTruck(vehicleId);

    const loadedBookings = await Booking.find({
      vehicleId,
      status: { $in: ['LOADED', 'In Transit', 'IN_TRANSIT'] }
    });

    const deliveredBookings = await Booking.find({
      vehicleId,
      status: { $in: ['DELIVERED', 'Completed'] }
    });

    // LIFO Recommended Loading Sequence (rear to front)
    const stopsOrder = new Map(
      (route && route.stopsDetails ? route.stopsDetails : []).map((s, idx) => [s.locationName.toLowerCase(), idx])
    );

    const recommendedLoadingSequence = [...loadedBookings].sort((a, b) => {
      const destIdxA = stopsOrder.get((a.toStop || '').toLowerCase()) || 0;
      const destIdxB = stopsOrder.get((b.toStop || '').toLowerCase()) || 0;
      return destIdxB - destIdxA;
    }).map((bkg, index) => ({
      positionNumber: index + 1,
      bookingId: bkg.bookingId,
      volume: bkg.volume,
      weight: bkg.weight,
      fromStop: bkg.fromStop,
      toStop: bkg.toStop,
      positionLabel: index === 0 ? 'Deepest (Front)' : index === loadedBookings.length - 1 ? 'Rear (Door)' : `Middle ${index + 1}`
    }));

    let nextStop = '';
    if (route && route.stopsDetails && route.stopsDetails.length > vehicle.currentRouteIndex + 1) {
      nextStop = route.stopsDetails[vehicle.currentRouteIndex + 1].locationName;
    }

    res.json({
      vehicleId,
      type: vehicle.type,
      transitStatus: vehicle.transitStatus,
      currentStop: vehicle.currentStop,
      currentRouteIndex: vehicle.currentRouteIndex,
      nextStop,
      tripStartedAt: vehicle.tripStartedAt,
      activeTripId: vehicle.activeTripId,
      route: route ? {
        routeId: route.routeId,
        source: route.source,
        destination: route.destination,
        stops: route.stopsDetails
      } : null,
      loadedPackagesCount: loadedBookings.length,
      deliveredPackagesCount: deliveredBookings.length,
      capacity,
      recommendedLoadingSequence
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Get stop verification audit log history for a vehicle
 * @route GET /api/transit/:vehicleId/history
 */
export const getStopVerificationHistory = async (req, res) => {
  const { vehicleId } = req.params;

  try {
    const history = await StopVerification.find({ vehicleId }).sort({ timestamp: -1 });
    res.json(history);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/**
 * Generate secure QR token for a route stop
 * @route POST /api/routes/:routeId/stops/:stopId/generate-qr
 */
export const generateStopQrToken = async (req, res) => {
  const { routeId, stopId } = req.params;

  try {
    const route = await Route.findOne({ routeId });
    if (!route) return res.status(404).json({ message: 'Route not found.' });

    const stop = route.stopsDetails.find(s => s.stopId === stopId);
    if (!stop) return res.status(404).json({ message: 'Stop not found on route.' });

    stop.qrToken = `STPTKN-${crypto.randomBytes(16).toString('hex')}`;
    await route.save();

    res.json({
      success: true,
      message: `Generated new secure QR token for stop ${stop.locationName}.`,
      stopId,
      locationName: stop.locationName,
      qrToken: stop.qrToken
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
