import crypto from 'crypto';
import mongoose from 'mongoose';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Booking, { isValidBookingStatusTransition } from '../models/Booking.js';
import Shipment from '../models/Shipment.js';
import Trip from '../models/Trip.js';
import TripStop from '../models/TripStop.js';
import LoadOperation from '../models/LoadOperation.js';
import Payment from '../models/Payment.js';
import StopVerification from '../models/StopVerification.js';
import { calculateTruckSegmentCapacity, getRemainingCapacityForTruck } from '../services/capacityService.js';
import { executeStopLifecycleOperational, dispatchTripOperational, reoptimizeRemainingRoute } from '../services/tripLifecycleService.js';

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

      // Create / Update domain Trip record
      let trip = await Trip.findOne({ tripId }).session(session);
      if (!trip) {
        trip = new Trip({
          tripId,
          vehicle: vehicle._id,
          vehicleId: vehicle.vehicleId,
          route: route._id,
          routeId: route.routeId,
          carrierId: vehicle.carrierId,
          driverId: vehicle.assignedDriverId || '',
          status: 'IN_TRANSIT',
          startedAt: now,
          actualDeparture: now,
          currentStopIndex: 0,
          currentStop: originStopName
        });
        await trip.save({ session });
      }

      // Initialize TripStops for this Trip
      if (route.stopsDetails && route.stopsDetails.length > 0) {
        for (const sd of route.stopsDetails) {
          await TripStop.create([{
            trip: trip._id,
            tripId,
            stopId: sd.stopId,
            sequence: sd.sequenceNumber,
            location: sd.locationName,
            plannedArrival: sd.sequenceNumber === 1 ? now : (sd.plannedArrival || now),
            actualArrival: sd.sequenceNumber === 1 ? now : null,
            verificationStatus: sd.sequenceNumber === 1 ? 'COMPLETED' : (sd.sequenceNumber === 2 ? 'READY' : 'UPCOMING'),
            completionTimestamp: sd.sequenceNumber === 1 ? now : null,
            qrToken: sd.qrToken || `STPTKN-${tripId}-${sd.stopId}-${crypto.randomBytes(4).toString('hex')}`
          }], { session });
        }
      }

      // 9 & 10. Update package status & record LoadOperation
      for (const bkg of loadedPackages) {
        if (!isValidBookingStatusTransition(bkg.status, 'IN_TRANSIT')) {
          throw { status: 400, message: `Invalid status transition for package ${bkg.bookingId}.` };
        }
        const prevStatus = bkg.status;
        bkg.status = 'IN_TRANSIT';
        bkg.loadedAt = now;
        await bkg.save({ session });

        if (bkg.shipmentId) {
          await Shipment.updateOne({ shipmentId: bkg.shipmentId }, { status: 'IN_TRANSIT' }, { session });
        }

        // Record initial loading operation
        await LoadOperation.create([{
          operationId: `LOP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
          trip: trip._id,
          tripId,
          stopId: route.stopsDetails[0].stopId,
          location: originStopName,
          shipmentId: bkg.shipmentId || bkg.bookingId,
          bookingId: bkg.bookingId,
          operationType: 'LOADED',
          timestamp: now,
          performedBy: req.user?.username || 'dispatcher',
          previousState: prevStatus,
          resultingState: 'IN_TRANSIT',
          volume: bkg.volume,
          weight: bkg.weight
        }], { session });
      }

      for (const bkg of waitingPackages) {
        if (!isValidBookingStatusTransition(bkg.status, 'WAITING_FOR_PICKUP')) {
          throw { status: 400, message: `Invalid status transition for package ${bkg.bookingId}.` };
        }
        bkg.status = 'WAITING_FOR_PICKUP';
        await bkg.save({ session });

        if (bkg.shipmentId) {
          await Shipment.updateOne({ shipmentId: bkg.shipmentId }, { status: 'WAITING_FOR_PICKUP' }, { session });
        }
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
 * Server-Side Transactional
 * Atomic Stop Verification with strict ordering, idempotency, unloads first, loads second.
 * @route POST /api/transit/verify-stop
 */
export const verifyStop = async (req, res) => {
  const { vehicleId, qrToken, secureToken, stopId, tripId, verificationMethod } = req.body;
  const idempotencyKey = req.headers['x-idempotency-key'] || req.body.idempotencyKey || '';

  const tokenToUse = secureToken || qrToken || '';

  if (!vehicleId && !tripId) {
    return res.status(400).json({
      success: false,
      message: 'Either vehicleId or tripId is required for verification.'
    });
  }
  if (!tokenToUse && !stopId) {
    return res.status(400).json({
      success: false,
      message: 'A secureToken, qrToken, or stopId is required for stop verification.'
    });
  }

  try {
    const result = await runTransaction(async (session) => {
      return await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        qrToken: tokenToUse,
        secureToken: tokenToUse,
        stopId,
        verificationMethod: verificationMethod || (tokenToUse.startsWith('STP-SEC.') ? 'SECURE_QR' : 'QR'),
        idempotencyKey,
        performedBy: req.user?.username || 'verifier',
        session
      });
    });

    if (result.isIdempotentReplay) {
      return res.json({
        success: true,
        isIdempotentReplay: true,
        message: result.message,
        trip: result.trip,
        actualLoadSnapshot: result.actualLoadSnapshot
      });
    }

    res.json({
      success: true,
      message: 'STOP VERIFIED',
      tripId: result.trip.tripId,
      vehicleId: result.vehicle.vehicleId,
      verifiedStop: result.verifiedStop,
      arrivalTime: result.arrivalTime,
      verificationMethod: result.verificationMethod,
      packagesToUnload: result.packagesToUnload,
      packagesToLoad: result.packagesToLoad,
      capacityBefore: result.capacityBefore,
      capacityAfter: result.capacityAfter,
      remainingFutureRouteCapacity: result.remainingFutureRouteCapacity,
      reoptimizationRecommended: result.reoptimizationRecommended,
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

/**
 * Re-optimize downstream legs of an in-transit trip
 * @route POST /api/transit/reoptimize/:tripId
 */
export const reoptimizeDownstreamTrip = async (req, res) => {
  const { tripId } = req.params;
  try {
    const result = await reoptimizeRemainingRoute({ tripId });
    res.json({
      success: true,
      message: 'Downstream re-optimization computed successfully.',
      ...result
    });
  } catch (error) {
    console.error('Downstream re-optimization error:', error);
    res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Re-optimization failed.'
    });
  }
};

