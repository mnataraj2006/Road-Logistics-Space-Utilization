import mongoose from 'mongoose';
import Trip from '../models/Trip.js';
import TripStop from '../models/TripStop.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import LoadOperation from '../models/LoadOperation.js';
import StopVerification from '../models/StopVerification.js';
import Payment from '../models/Payment.js';
import crypto from 'crypto';
import { generateLoadPlan } from '../optimizer/index.js';
import { generateSecureStopToken, verifySecureStopToken } from './secureTokenService.js';
import { recordAuditEvent } from './auditService.js';

const norm = (s) => (s ? String(s).trim().toLowerCase() : '');

/**
 * Standardizes booking & shipment status values to canonical uppercase enums.
 */
const CANONICAL_STATUS = {
  DRAFT: 'DRAFT',
  PENDING: 'PENDING',
  BOOKED: 'BOOKED',
  ALLOCATED: 'ALLOCATED',
  WAITING_FOR_PICKUP: 'WAITING_FOR_PICKUP',
  LOADED: 'IN_TRANSIT',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  COMPLETED: 'DELIVERED',
  CANCELLED: 'CANCELLED'
};

export const toCanonicalStatus = (status) => {
  if (!status) return 'PENDING';
  const clean = String(status).toUpperCase().replace(/\s+/g, '_');
  return CANONICAL_STATUS[clean] || clean;
};

/**
 * Dispatches a planned trip, generates secure cryptographic tokens for each stop,
 * verifies origin cargo, initializes actual load snapshot, and sets trip & truck to IN_TRANSIT.
 */
export const dispatchTripOperational = async ({
  tripId,
  performedBy = 'dispatcher',
  session
}) => {
  const trip = await Trip.findOne({ tripId }).session(session);
  if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

  if (['DISPATCHED', 'IN_TRANSIT', 'COMPLETED'].includes(trip.status)) {
    throw { status: 400, message: `Trip ${tripId} is already ${trip.status}.` };
  }

  // 1. Verify approved load plan exists
  const approvedPlan = await LoadPlan.findOne({
    tripId,
    status: { $in: ['APPROVED', 'ACTIVE'] }
  }).session(session);

  if (!approvedPlan) {
    throw {
      status: 400,
      message: `Cannot dispatch trip ${tripId}: No APPROVED load plan exists. Please review and approve a load plan first.`
    };
  }

  // 2. Verify Vehicle
  const vehicle = await Vehicle.findOne({ vehicleId: trip.vehicleId }).session(session);
  if (!vehicle || vehicle.status !== 'Active') {
    throw { status: 400, message: `Vehicle ${trip.vehicleId} is not active or available.` };
  }

  // 3. Verify Route & Stops
  const route = await Route.findOne({ routeId: trip.routeId }).session(session);
  if (!route || !route.stopsDetails || route.stopsDetails.length < 2) {
    throw { status: 400, message: `Route ${trip.routeId} does not have valid multi-stop details.` };
  }

  const originStopName = route.stopsDetails[0].locationName;
  const now = new Date();

  // 4. Generate & store cryptographically signed secure tokens for each stop
  for (let i = 0; i < route.stopsDetails.length; i++) {
    const st = route.stopsDetails[i];
    const secureToken = generateSecureStopToken({
      tripId: trip.tripId,
      vehicleId: vehicle.vehicleId,
      routeId: route.routeId,
      stopId: st.stopId,
      sequence: st.sequenceNumber,
      locationName: st.locationName,
      validityHours: 72
    });

    await TripStop.updateOne(
      { tripId: trip.tripId, stopId: st.stopId },
      { secureToken },
      { session }
    );
  }

  // 5. Find all packages assigned to this truck/trip
  const allAssignedBookings = await Booking.find({
    $or: [
      { vehicleId: vehicle.vehicleId },
      { allocatedVehicleId: vehicle.vehicleId },
      { allocatedTripId: trip.tripId },
      { assignedTripId: trip.tripId }
    ],
    status: { $in: ['Pending', 'PENDING', 'BOOKED', 'ALLOCATED', 'LOCKED', 'WAITING_FOR_PICKUP'] }
  }).session(session);

  // Origin cargo (to load immediately at stop 0)
  const originCargo = allAssignedBookings.filter(
    b => norm(b.fromStop) === norm(originStopName) || norm(b.fromStop) === norm(route.source)
  );

  // Downstream cargo (waiting for pickup at downstream stops)
  const downstreamCargo = allAssignedBookings.filter(
    b => norm(b.fromStop) !== norm(originStopName) && norm(b.fromStop) !== norm(route.source)
  );

  // 6. Verify origin capacity headroom
  let originVolume = 0;
  let originWeight = 0;
  for (const b of originCargo) {
    originVolume += b.volume;
    originWeight += b.weight;
  }

  if (originVolume > vehicle.capacityVolume || originWeight > vehicle.capacityWeight) {
    throw {
      status: 400,
      message: `Origin cargo exceeds truck capacity (Volume: ${originVolume} m³ / ${vehicle.capacityVolume} m³, Weight: ${originWeight} kg / ${vehicle.capacityWeight} kg).`
    };
  }

  // 7. Transition origin packages to IN_TRANSIT and log LoadOperation
  const loadedShipmentIds = [];
  for (const bkg of originCargo) {
    bkg.status = 'IN_TRANSIT';
    bkg.loadedAt = now;
    await bkg.save({ session });

    if (bkg.shipmentId) {
      await Shipment.updateOne({ shipmentId: bkg.shipmentId }, { status: 'IN_TRANSIT', physicalStatus: 'ONBOARD' }, { session });
      loadedShipmentIds.push(bkg.shipmentId);
    } else {
      loadedShipmentIds.push(bkg.bookingId);
    }

    if (approvedPlan) {
      await LoadAssignment.updateMany(
        { loadPlanId: approvedPlan.loadPlanId, $or: [{ shipmentId: bkg.shipmentId }, { bookingId: bkg.bookingId }] },
        { $set: { status: 'LOADED', physicalStatus: 'ONBOARD' } },
        { session }
      );
    }

    await LoadOperation.create([{
      operationId: `LOP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      tripId,
      stopId: route.stopsDetails[0].stopId,
      location: originStopName,
      shipmentId: bkg.shipmentId || bkg.bookingId,
      bookingId: bkg.bookingId,
      operationType: 'LOADED',
      timestamp: now,
      performedBy,
      previousState: 'ALLOCATED',
      resultingState: 'IN_TRANSIT',
      volume: bkg.volume,
      weight: bkg.weight
    }], { session });
  }

  // 8. Transition downstream packages to WAITING_FOR_PICKUP
  for (const bkg of downstreamCargo) {
    bkg.status = 'WAITING_FOR_PICKUP';
    await bkg.save({ session });

    if (bkg.shipmentId) {
      await Shipment.updateOne({ shipmentId: bkg.shipmentId }, { status: 'WAITING_FOR_PICKUP', physicalStatus: 'WAITING_AT_ORIGIN' }, { session });
    }
    if (approvedPlan) {
      await LoadAssignment.updateMany(
        { loadPlanId: approvedPlan.loadPlanId, $or: [{ shipmentId: bkg.shipmentId }, { bookingId: bkg.bookingId }] },
        { $set: { physicalStatus: 'WAITING_AT_ORIGIN' } },
        { session }
      );
    }
  }

  // 9. Update Trip state
  trip.status = 'IN_TRANSIT';
  trip.startedAt = now;
  trip.actualDeparture = now;
  trip.currentStopIndex = 0;
  trip.currentStop = originStopName;
  trip.activeLoadPlanId = approvedPlan.loadPlanId;
  trip.actualLoadSnapshot = {
    usedVolume: parseFloat(originVolume.toFixed(2)),
    usedWeight: Math.round(originWeight),
    packagesCount: originCargo.length,
    loadedShipmentIds
  };
  trip.timelineAudit.push({
    event: 'DISPATCHED',
    stopId: route.stopsDetails[0].stopId,
    location: originStopName,
    timestamp: now,
    performedBy,
    details: {
      originLoadedCount: originCargo.length,
      downstreamCount: downstreamCargo.length,
      usedVolume: originVolume,
      usedWeight: originWeight
    }
  });
  await trip.save({ session });

  // 10. Update TripStops
  await TripStop.updateOne(
    { tripId, sequence: 1 },
    { verificationStatus: 'COMPLETED', actualArrival: now, completionTimestamp: now },
    { session }
  );
  await TripStop.updateOne(
    { tripId, sequence: 2 },
    { verificationStatus: 'READY', plannedArrival: now },
    { session }
  );

  // 11. Update Route and Vehicle
  route.stopsDetails[0].status = 'Completed';
  route.stopsDetails[0].actualArrival = now;
  route.stopsDetails[0].completedAt = now;
  if (route.stopsDetails[1]) {
    route.stopsDetails[1].status = 'Ready';
  }
  route.currentStopIndex = 0;
  route.status = 'In Transit';
  await route.save({ session });

  vehicle.transitStatus = 'IN_TRANSIT';
  vehicle.currentStop = '';
  vehicle.currentRouteIndex = 0;
  vehicle.tripStartedAt = now;
  vehicle.activeTripId = tripId;
  await vehicle.save({ session });

  // 12. Lock LoadPlan immutable
  approvedPlan.status = 'ACTIVE';
  approvedPlan.isImmutable = true;
  await approvedPlan.save({ session });

  // Record Audit Event
  await recordAuditEvent({
    eventType: 'TRIP_DISPATCHED',
    entityType: 'Trip',
    entityId: trip.tripId,
    tripId: trip.tripId,
    actor: performedBy,
    previousState: 'READY_FOR_DISPATCH',
    resultingState: 'DISPATCHED',
    metadata: {
      vehicleId: trip.vehicleId,
      routeId: trip.routeId,
      initialLoadedCount: originCargo.length,
      initialLoadedVolume: originVolume,
      initialLoadedWeight: originWeight
    }
  }, { session });

  return {
    trip,
    vehicle,
    originCargoLoaded: originCargo.length,
    downstreamCargoWaiting: downstreamCargo.length,
    actualLoadSnapshot: trip.actualLoadSnapshot
  };
};

/**
 * Secure Stop Verification Pipeline:
 * Validates:
 * 1. Vehicle/trip exists
 * 2. Trip is active
 * 3. Token belongs to this trip
 * 4. Token belongs to this route
 * 5. Token belongs to the expected stop (sequence matching, no skipping)
 * 6. Stop is not already completed
 * 7. Token has not been used before / single-use anti-reuse
 * 8. Cryptographic HMAC signature & expiration
 * 9. Executes unloads first, then loads
 * 10. Computes before/after capacity & future segment capacities
 * 11. Determines if downstream re-optimization is recommended
 */
export const executeStopLifecycleOperational = async ({
  tripId,
  vehicleId,
  qrToken,
  secureToken,
  scannedToken,
  stopId,
  verificationMethod = 'SECURE_QR',
  idempotencyKey = '',
  performedBy = 'driver/stop-verifier',
  session
}) => {
  // 1. Resolve Trip
  let trip = null;
  if (tripId) {
    trip = await Trip.findOne({ tripId }).session(session);
  } else if (vehicleId) {
    trip = await Trip.findOne({ vehicleId, status: { $in: ['DISPATCHED', 'IN_TRANSIT', 'AT_STOP', 'OPERATIONS_IN_PROGRESS'] } }).session(session);
  }

  if (!trip) {
    throw { status: 404, message: `Active trip not found for ${vehicleId ? 'vehicle ' + vehicleId : 'trip ' + tripId}.` };
  }

  // 2. Idempotency Check (Runs before state verification so retries on final stop are idempotent)
  if (idempotencyKey && trip.processedIdempotencyKeys?.includes(idempotencyKey)) {
    return {
      isIdempotentReplay: true,
      message: 'Idempotent request: Stop operation already completed with this idempotency key.',
      trip,
      actualLoadSnapshot: trip.actualLoadSnapshot
    };
  }

  // 3. Trip Active State Verification
  const allowedTripStates = ['DISPATCHED', 'IN_TRANSIT', 'AT_STOP', 'OPERATIONS_IN_PROGRESS'];
  if (!allowedTripStates.includes(trip.status)) {
    throw {
      status: 400,
      message: `Current trip state '${trip.status}' does not allow stop verification. Trip must be active/in-transit.`
    };
  }

  // 4. Resolve Route & Vehicle
  const route = await Route.findOne({ routeId: trip.routeId }).session(session);
  const vehicle = await Vehicle.findOne({ vehicleId: trip.vehicleId }).session(session);
  if (!route || !vehicle) throw { status: 404, message: 'Route or Vehicle not found.' };

  const rawToken = secureToken || qrToken || scannedToken || '';
  let targetIndex = -1;
  let decodedPayload = null;

  // 5. Cryptographic & Token Signature Verification
  if (rawToken.startsWith('STP-SEC.')) {
    const verified = verifySecureStopToken(rawToken);
    if (!verified.valid) {
      throw {
        status: 401,
        message: `Security Verification Failed: ${verified.error}`
      };
    }
    decodedPayload = verified.payload;

    // Check token belongs to THIS trip
    if (decodedPayload.tripId !== trip.tripId) {
      throw {
        status: 403,
        message: `Security Violation: Token belongs to trip '${decodedPayload.tripId}', but active trip is '${trip.tripId}'. Token scanning for another trip is prohibited.`
      };
    }

    // Check token belongs to THIS route
    if (decodedPayload.routeId !== route.routeId) {
      throw {
        status: 403,
        message: `Security Violation: Token belongs to route '${decodedPayload.routeId}', but trip is assigned to route '${route.routeId}'.`
      };
    }

    // Check anti-reuse of single-use token / nonce
    if (trip.usedStopTokens?.includes(rawToken) || (decodedPayload.nonce && trip.usedStopTokens?.includes(decodedPayload.nonce))) {
      throw {
        status: 400,
        message: 'Security Violation: This stop token has already been used. Replaying or reusing tokens is prohibited.'
      };
    }

    // Resolve target stop index by payload stopId or sequence
    targetIndex = route.stopsDetails.findIndex(s => s.stopId === decodedPayload.stopId || s.sequenceNumber === decodedPayload.sequence);
  } else if (rawToken) {
    targetIndex = route.stopsDetails.findIndex(s => s.qrToken === rawToken);
  } else if (stopId) {
    targetIndex = route.stopsDetails.findIndex(s => s.stopId === stopId);
  }

  if (targetIndex === -1) {
    throw { status: 400, message: 'Invalid stop token or stopId. Stop does not belong to this route.' };
  }

  const targetStop = route.stopsDetails[targetIndex];

  // 6. Sequence & Skipping Verification
  const expectedNextIndex = (trip.currentStopIndex || 0) + 1;
  if (targetIndex !== expectedNextIndex) {
    const expectedName = route.stopsDetails[expectedNextIndex]?.locationName || 'Unknown';
    if (targetIndex > expectedNextIndex) {
      throw {
        status: 400,
        message: `Cannot skip stops! Expected stop '${expectedName}' (Stop #${expectedNextIndex + 1}), but scanned '${targetStop.locationName}' (Stop #${targetIndex + 1}).`
      };
    } else {
      throw {
        status: 400,
        message: `Invalid stop sequence. Expected stop '${expectedName}' (Stop #${expectedNextIndex + 1}), but scanned '${targetStop.locationName}' (Stop #${targetIndex + 1}).`
      };
    }
  }

  // 7. Duplicate Completion Check
  if (targetStop.status === 'Completed') {
    throw { status: 400, message: `Stop '${targetStop.locationName}' has already been verified and completed.` };
  }

  const tripStopDoc = await TripStop.findOne({ tripId: trip.tripId, stopId: targetStop.stopId }).session(session);
  if (tripStopDoc && tripStopDoc.verificationStatus === 'COMPLETED') {
    throw { status: 400, message: `Stop '${targetStop.locationName}' has already been processed for this trip.` };
  }

  const now = new Date();

  // 8. Find all packages/consignments assigned to this trip & vehicle
  const [allAssignedBookings, allAssignedShipments] = await Promise.all([
    Booking.find({
      $or: [
        { vehicleId: vehicle.vehicleId },
        { allocatedVehicleId: vehicle.vehicleId },
        { allocatedTripId: trip.tripId },
        { assignedTripId: trip.tripId }
      ],
      status: { $ne: 'CANCELLED' }
    }).session(session),
    Shipment.find({
      $or: [
        { vehicleId: vehicle.vehicleId },
        { allocatedVehicleId: vehicle.vehicleId },
        { allocatedTripId: trip.tripId },
        { assignedTripId: trip.tripId }
      ],
      status: { $ne: 'CANCELLED' }
    }).session(session)
  ]);

  // Merge items into unified active tracking list
  const activeCargoList = [];
  const seenIds = new Set();

  for (const s of allAssignedShipments) {
    seenIds.add(s.shipmentId);
    activeCargoList.push({
      _id: s._id,
      shipmentId: s.shipmentId,
      bookingId: s.bookingId || s.shipmentId,
      fromStop: s.pickupStop || 'Chennai',
      toStop: s.deliveryStop || 'Bangalore',
      volume: s.volume || 1.0,
      weight: s.weight || 500,
      status: s.status || 'IN_TRANSIT',
      isShipment: true
    });
  }

  for (const b of allAssignedBookings) {
    if (!seenIds.has(b.shipmentId) && !seenIds.has(b.bookingId)) {
      seenIds.add(b.bookingId);
      activeCargoList.push({
        _id: b._id,
        shipmentId: b.shipmentId || b.bookingId,
        bookingId: b.bookingId,
        fromStop: b.fromStop || 'Chennai',
        toStop: b.toStop || 'Bangalore',
        volume: b.volume || 1.0,
        weight: b.weight || 500,
        status: b.status || 'IN_TRANSIT',
        isShipment: false
      });
    }
  }

  // Capacity Before
  const loadedBefore = activeCargoList.filter(c => ['LOADED', 'In Transit', 'IN_TRANSIT', 'LOCKED', 'ALLOCATED', 'ON_TRUCK'].includes(c.status));
  const usedVolBefore = loadedBefore.reduce((s, c) => s + c.volume, 0);
  const usedWtBefore = loadedBefore.reduce((s, c) => s + c.weight, 0);

  // Packages to UNLOAD (delivery matches current target stop)
  const packagesToUnload = activeCargoList.filter(c => {
    const isLoaded = ['LOADED', 'In Transit', 'IN_TRANSIT', 'LOCKED', 'ALLOCATED', 'ON_TRUCK'].includes(c.status);
    const matchesDelivery = norm(c.toStop) === norm(targetStop.locationName);
    return isLoaded && matchesDelivery;
  });

  // Packages to LOAD (pickup matches current target stop)
  const packagesToLoad = activeCargoList.filter(c => {
    const isWaiting = ['Pending', 'PENDING', 'BOOKED', 'WAITING_FOR_PICKUP', 'ALLOCATED'].includes(c.status);
    const matchesPickup = norm(c.fromStop) === norm(targetStop.locationName);
    return isWaiting && matchesPickup;
  });

  // 9. Simulate Headroom across remaining segments
  const unloadIdSet = new Set(packagesToUnload.map(c => c.shipmentId || c.bookingId));
  const remainingLoaded = loadedBefore.filter(c => !unloadIdSet.has(c.shipmentId || c.bookingId));
  const downstreamWaiting = activeCargoList.filter(c => {
    const isWaiting = ['Pending', 'PENDING', 'BOOKED', 'WAITING_FOR_PICKUP', 'ALLOCATED'].includes(c.status);
    const matchesPickup = norm(c.fromStop) === norm(targetStop.locationName);
    return isWaiting && !matchesPickup;
  });

  const simulatedActiveCargo = [...remainingLoaded, ...packagesToLoad, ...downstreamWaiting];

  const numSegments = route.stopsDetails.length - 1;
  const segVol = new Array(numSegments).fill(0);
  const segWt = new Array(numSegments).fill(0);

  for (const c of simulatedActiveCargo) {
    const fromIdx = route.stopsDetails.findIndex(s => norm(s.locationName) === norm(c.fromStop || route.stopsDetails[0].locationName));
    const toIdx = route.stopsDetails.findIndex(s => norm(s.locationName) === norm(c.toStop || route.stopsDetails[numSegments].locationName));
    const s = Math.max(0, fromIdx !== -1 ? fromIdx : 0);
    const e = Math.min(numSegments, toIdx !== -1 ? toIdx : numSegments);
    if (s < e) {
      for (let i = s; i < e; i++) {
        segVol[i] += c.volume;
        segWt[i] += c.weight;
      }
    }
  }

  // Final Stop Pre-Validation
  const isFinalStop = targetIndex === route.stopsDetails.length - 1;

  // 10. EXECUTE UNLOADS FIRST
  const unloadedDetails = [];
  for (const c of packagesToUnload) {
    // Update Shipment
    if (c.shipmentId) {
      await Shipment.updateMany(
        { $or: [{ shipmentId: c.shipmentId }, { bookingId: c.bookingId }] },
        {
          $set: {
            status: 'DELIVERED',
            allocationStatus: 'DELIVERED',
            physicalStatus: 'DELIVERED',
            deliveredAt: now
          }
        },
        { session }
      );
    }

    // Update Booking
    if (c.bookingId) {
      await Booking.updateMany(
        { $or: [{ bookingId: c.bookingId }, { shipmentId: c.shipmentId }] },
        {
          $set: {
            status: 'DELIVERED',
            allocationStatus: 'DELIVERED',
            physicalStatus: 'DELIVERED',
            deliveredAt: now
          }
        },
        { session }
      );
    }

    // Update LoadAssignment status
    if (trip.activeLoadPlanId) {
      await LoadAssignment.updateMany(
        { loadPlanId: trip.activeLoadPlanId, $or: [{ shipmentId: c.shipmentId }, { bookingId: c.bookingId }] },
        { $set: { status: 'DELIVERED', physicalStatus: 'DELIVERED' } },
        { session }
      );
    }

    // Release escrow payment
    const payment = await Payment.findOne({ $or: [{ bookingId: c.bookingId }, { shipmentId: c.shipmentId }] }).session(session);
    if (payment) {
      payment.status = 'PaidOut';
      await payment.save({ session });
    }

    // Record UNLOAD LoadOperation
    await LoadOperation.create([{
      operationId: `LOP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      tripId: trip.tripId,
      stopId: targetStop.stopId,
      location: targetStop.locationName,
      shipmentId: c.shipmentId || c.bookingId,
      bookingId: c.bookingId,
      operationType: 'UNLOADED',
      timestamp: now,
      performedBy,
      previousState: 'IN_TRANSIT',
      resultingState: 'DELIVERED',
      volume: c.volume,
      weight: c.weight
    }], { session });

    unloadedDetails.push({
      shipmentId: c.shipmentId || c.bookingId,
      bookingId: c.bookingId,
      volume: c.volume,
      weight: c.weight
    });
  }

  // 11. EXECUTE LOADS SECOND
  const loadedDetails = [];
  for (const bkg of packagesToLoad) {
    bkg.status = 'IN_TRANSIT';
    bkg.loadedAt = now;

    if (bkg.bookingId) {
      await Booking.updateMany(
        { $or: [{ bookingId: bkg.bookingId }, { shipmentId: bkg.shipmentId }] },
        { $set: { status: 'IN_TRANSIT', allocationStatus: 'IN_TRANSIT', physicalStatus: 'ONBOARD', loadedAt: now } },
        { session }
      );
    }

    if (bkg.shipmentId) {
      await Shipment.updateMany(
        { $or: [{ shipmentId: bkg.shipmentId }, { bookingId: bkg.bookingId }] },
        { $set: { status: 'IN_TRANSIT', allocationStatus: 'IN_TRANSIT', physicalStatus: 'ONBOARD', loadedAt: now } },
        { session }
      );
    }

    if (trip.activeLoadPlanId) {
      await LoadAssignment.updateMany(
        { loadPlanId: trip.activeLoadPlanId, $or: [{ shipmentId: bkg.shipmentId }, { bookingId: bkg.bookingId }] },
        { $set: { status: 'LOADED', physicalStatus: 'ONBOARD' } },
        { session }
      );
    }

    // Record LOAD LoadOperation
    await LoadOperation.create([{
      operationId: `LOP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      tripId: trip.tripId,
      stopId: targetStop.stopId,
      location: targetStop.locationName,
      shipmentId: bkg.shipmentId || bkg.bookingId,
      bookingId: bkg.bookingId,
      operationType: 'LOADED',
      timestamp: now,
      performedBy,
      previousState: 'WAITING_FOR_PICKUP',
      resultingState: 'IN_TRANSIT',
      volume: bkg.volume,
      weight: bkg.weight
    }], { session });

    loadedDetails.push({
      shipmentId: bkg.shipmentId || bkg.bookingId,
      bookingId: bkg.bookingId,
      volume: bkg.volume,
      weight: bkg.weight,
      toStop: bkg.toStop
    });
  }

  // 12. Reconcile Actual Load Snapshot & Capacity After
  const finalLoadedOnTruck = [...remainingLoaded, ...packagesToLoad];
  const actualVol = finalLoadedOnTruck.reduce((sum, b) => sum + b.volume, 0);
  const actualWt = finalLoadedOnTruck.reduce((sum, b) => sum + b.weight, 0);
  const loadedIds = finalLoadedOnTruck.map(b => b.shipmentId || b.bookingId);

  trip.actualLoadSnapshot = {
    usedVolume: parseFloat(actualVol.toFixed(2)),
    usedWeight: Math.round(actualWt),
    packagesCount: finalLoadedOnTruck.length,
    loadedShipmentIds: loadedIds
  };

  // Build Remaining Future Route Capacities (by segment)
  const remainingFutureRouteCapacity = [];
  for (let i = targetIndex; i < numSegments; i++) {
    const from = route.stopsDetails[i].locationName;
    const to = route.stopsDetails[i + 1].locationName;
    const usedV = segVol[i];
    const usedW = segWt[i];
    remainingFutureRouteCapacity.push({
      segmentIndex: i,
      fromStop: from,
      toStop: to,
      usedVolume: parseFloat(usedV.toFixed(2)),
      remainingVolume: parseFloat((vehicle.capacityVolume - usedV).toFixed(2)),
      volumeUtilizationPercent: Math.round((usedV / vehicle.capacityVolume) * 100),
      usedWeight: Math.round(usedW),
      remainingWeight: Math.round(vehicle.capacityWeight - usedW),
      weightUtilizationPercent: Math.round((usedW / vehicle.capacityWeight) * 100)
    });
  }

  // 13. Determine if downstream re-optimization is recommended
  const remainingSegsCount = numSegments - targetIndex;
  const freedVolume = Math.max(0, usedVolBefore - actualVol);
  const reoptimizationRecommended = remainingSegsCount >= 1 && (freedVolume >= 0.15 * vehicle.capacityVolume || actualVol <= 0.6 * vehicle.capacityVolume);

  // 14. Check Final Stop vs. Intermediate Stop
  if (isFinalStop) {
    const undelivered = await Booking.find({
      vehicleId: vehicle.vehicleId,
      status: { $in: ['Pending', 'PENDING', 'BOOKED', 'ALLOCATED', 'WAITING_FOR_PICKUP', 'LOADED', 'In Transit', 'IN_TRANSIT'] }
    }).session(session);

    if (undelivered.length > 0) {
      throw {
        status: 400,
        message: `Cannot complete trip: ${undelivered.length} package(s) remain undelivered at final stop.`,
        details: { undeliveredCount: undelivered.length, undeliveredIds: undelivered.map(b => b.bookingId) }
      };
    }

    // Complete Trip
    trip.status = 'COMPLETED';
    trip.completedAt = now;
    trip.currentStop = targetStop.locationName;
    trip.currentStopIndex = targetIndex;
    trip.actualLoadSnapshot.usedVolume = 0;
    trip.actualLoadSnapshot.usedWeight = 0;
    trip.actualLoadSnapshot.packagesCount = 0;
    trip.actualLoadSnapshot.loadedShipmentIds = [];
    trip.timelineAudit.push({
      event: 'TRIP_COMPLETED',
      stopId: targetStop.stopId,
      location: targetStop.locationName,
      timestamp: now,
      performedBy,
      details: {
        totalStopsCompleted: route.stopsDetails.length,
        unloadedAtFinal: unloadedDetails.length,
        verificationMethod
      }
    });

    // Release Vehicle back to AVAILABLE for subsequent trips
    vehicle.status = 'AVAILABLE';
    vehicle.transitStatus = 'AVAILABLE';
    vehicle.activeTripId = null;
    vehicle.currentTripId = null;
    vehicle.currentStop = targetStop.locationName;
    await vehicle.save({ session });

    route.status = 'Completed';

    if (trip.activeLoadPlanId) {
      await LoadPlan.updateOne({ loadPlanId: trip.activeLoadPlanId }, { status: 'COMPLETED' }, { session });
    }
  } else {
    // Intermediate Stop Completion
    trip.status = 'IN_TRANSIT';
    trip.currentStopIndex = targetIndex;
    trip.currentStop = '';
    trip.timelineAudit.push({
      event: 'STOP_COMPLETED',
      stopId: targetStop.stopId,
      location: targetStop.locationName,
      timestamp: now,
      performedBy,
      details: {
        unloadedCount: unloadedDetails.length,
        loadedCount: loadedDetails.length,
        remainingVolume: actualVol,
        remainingWeight: actualWt,
        verificationMethod
      }
    });

    vehicle.transitStatus = 'IN_TRANSIT';
    vehicle.currentStop = '';
    vehicle.currentRouteIndex = targetIndex;

    const nextStop = route.stopsDetails[targetIndex + 1];
    if (nextStop) {
      nextStop.status = 'Ready';
      await TripStop.updateOne(
        { tripId: trip.tripId, stopId: nextStop.stopId },
        { verificationStatus: 'READY', plannedArrival: now },
        { session }
      );
    }
  }

  // Update TripStop verification status
  await TripStop.updateOne(
    { tripId: trip.tripId, stopId: targetStop.stopId },
    {
      verificationStatus: 'COMPLETED',
      verificationMethod,
      actualArrival: now,
      completionTimestamp: now
    },
    { session }
  );

  targetStop.status = 'Completed';
  targetStop.actualArrival = now;
  targetStop.completedAt = now;
  route.currentStopIndex = targetIndex;

  // Record used tokens to prevent replay attacks
  if (!trip.usedStopTokens) trip.usedStopTokens = [];
  if (rawToken) trip.usedStopTokens.push(rawToken);
  if (decodedPayload?.nonce) trip.usedStopTokens.push(decodedPayload.nonce);

  if (idempotencyKey) {
    if (!trip.processedIdempotencyKeys) trip.processedIdempotencyKeys = [];
    trip.processedIdempotencyKeys.push(idempotencyKey);
  }

  await trip.save({ session });
  await route.save({ session });
  await vehicle.save({ session });

  // 15. Create StopVerification Audit Record
  const auditRecord = new StopVerification({
    tripId: trip.tripId,
    vehicleId: vehicle.vehicleId,
    routeId: route.routeId,
    stopId: targetStop.stopId,
    locationName: targetStop.locationName,
    sequenceNumber: targetStop.sequenceNumber,
    timestamp: now,
    verificationMethod,
    packagesUnloaded: unloadedDetails,
    packagesLoaded: loadedDetails,
    volumeBefore: usedVolBefore,
    volumeAfter: actualVol,
    weightBefore: usedWtBefore,
    weightAfter: actualWt
  });
  await auditRecord.save({ session });

  // Record Global Operational Audit Events
  await recordAuditEvent({
    eventType: 'STOP_ARRIVAL_VERIFIED',
    entityType: 'Stop',
    entityId: targetStop.stopId,
    tripId: trip.tripId,
    actor: performedBy,
    previousState: 'IN_TRANSIT',
    resultingState: 'VERIFIED',
    metadata: {
      location: targetStop.locationName,
      sequence: targetStop.sequenceNumber,
      verificationMethod,
      unloadedCount: unloadedDetails.length,
      loadedCount: loadedDetails.length
    }
  }, { session });

  for (const u of unloadedDetails) {
    await recordAuditEvent({
      eventType: 'PACKAGE_UNLOADED',
      entityType: 'Shipment',
      entityId: u.shipmentId || u.bookingId,
      tripId: trip.tripId,
      actor: performedBy,
      previousState: 'IN_TRANSIT',
      resultingState: 'DELIVERED',
      metadata: {
        stopId: targetStop.stopId,
        location: targetStop.locationName,
        volume: u.volume,
        weight: u.weight
      }
    }, { session });

    await recordAuditEvent({
      eventType: 'SHIPMENT_DELIVERED',
      entityType: 'Shipment',
      entityId: u.shipmentId || u.bookingId,
      tripId: trip.tripId,
      actor: performedBy,
      previousState: 'IN_TRANSIT',
      resultingState: 'DELIVERED',
      metadata: {
        deliveryLocation: targetStop.locationName,
        deliveredAt: now
      }
    }, { session });
  }

  for (const l of loadedDetails) {
    await recordAuditEvent({
      eventType: 'PACKAGE_LOADED',
      entityType: 'Shipment',
      entityId: l.shipmentId || l.bookingId,
      tripId: trip.tripId,
      actor: performedBy,
      previousState: 'ALLOCATED',
      resultingState: 'IN_TRANSIT',
      metadata: {
        pickupLocation: targetStop.locationName,
        destination: l.toStop,
        volume: l.volume,
        weight: l.weight
      }
    }, { session });
  }

  if (isFinalStop) {
    await recordAuditEvent({
      eventType: 'TRIP_COMPLETED',
      entityType: 'Trip',
      entityId: trip.tripId,
      tripId: trip.tripId,
      actor: performedBy,
      previousState: 'IN_TRANSIT',
      resultingState: 'COMPLETED',
      metadata: {
        finalStop: targetStop.locationName,
        totalStops: route.stopsDetails.length
      }
    }, { session });
  }

  return {
    isIdempotentReplay: false,
    unloadedCount: unloadedDetails.length,
    loadedCount: loadedDetails.length,
    verifiedStop: {
      stopId: targetStop.stopId,
      sequence: targetStop.sequenceNumber,
      locationName: targetStop.locationName,
      status: targetStop.status
    },
    arrivalTime: now.toISOString(),
    verificationMethod,
    packagesToUnload: unloadedDetails,
    packagesToLoad: loadedDetails,
    capacityBefore: {
      usedVolume: parseFloat(usedVolBefore.toFixed(2)),
      remainingVolume: parseFloat((vehicle.capacityVolume - usedVolBefore).toFixed(2)),
      usedWeight: Math.round(usedWtBefore),
      remainingWeight: Math.round(vehicle.capacityWeight - usedWtBefore),
      volumeUtilizationPercent: Math.round((usedVolBefore / vehicle.capacityVolume) * 100),
      weightUtilizationPercent: Math.round((usedWtBefore / vehicle.capacityWeight) * 100)
    },
    capacityAfter: {
      usedVolume: parseFloat(actualVol.toFixed(2)),
      remainingVolume: parseFloat((vehicle.capacityVolume - actualVol).toFixed(2)),
      usedWeight: Math.round(actualWt),
      remainingWeight: Math.round(vehicle.capacityWeight - actualWt),
      volumeUtilizationPercent: Math.round((actualVol / vehicle.capacityVolume) * 100),
      weightUtilizationPercent: Math.round((actualWt / vehicle.capacityWeight) * 100)
    },
    remainingFutureRouteCapacity,
    reoptimizationRecommended,
    isFinalStop,
    trip,
    vehicle
  };
};

/**
 * Recalculates remaining capacity for remaining route legs and optionally runs downstream re-optimization.
 */
export const reoptimizeRemainingRoute = async ({
  tripId,
  session
}) => {
  const trip = await Trip.findOne({ tripId }).populate('vehicle').populate('route').session(session);
  if (!trip) throw { status: 404, message: `Trip ${tripId} not found.` };

  const currentStopIdx = trip.currentStopIndex || 0;
  const route = trip.route;
  const remainingStops = route.stopsDetails.slice(currentStopIdx);

  if (remainingStops.length < 2) {
    return {
      message: 'Trip is at final stop. No remaining segments for re-optimization.',
      hasRemainingSegments: false
    };
  }

  // Find candidate unallocated shipments for future stops
  const futureStopNames = remainingStops.map(s => s.locationName);
  const candidates = await Shipment.find({
    status: { $in: ['DRAFT', 'PENDING', 'BOOKED'] }
  }).session(session);

  const eligibleForFuture = candidates.filter(s => {
    const p = futureStopNames.findIndex(st => norm(st) === norm(s.pickupStop));
    const d = futureStopNames.findIndex(st => norm(st) === norm(s.deliveryStop));
    return p !== -1 && d !== -1 && p < d;
  });

  // Current locked load on trailer
  const lockedOnTrailer = (trip.actualLoadSnapshot?.loadedShipmentIds || []).map(id => ({
    shipmentId: id,
    pickupStop: remainingStops[0].locationName,
    volume: 0,
    weight: 0
  }));

  const optResult = generateLoadPlan({
    truck: trip.vehicle,
    route: {
      routeId: `${route.routeId}-REOPT-LEG-${currentStopIdx}`,
      stops: futureStopNames,
      distance: 100
    },
    shipments: eligibleForFuture,
    currentLoad: lockedOnTrailer
  });

  return {
    tripId,
    currentStop: remainingStops[0].locationName,
    remainingStopsCount: remainingStops.length,
    eligibleFutureCandidates: eligibleForFuture.length,
    reoptimizationResult: optResult
  };
};
