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
  stopIndex,
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
      success: true,
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

  // Guarantee route.stopsDetails exists and is normalized
  if (!Array.isArray(route.stopsDetails) || route.stopsDetails.length === 0) {
    const rawStops = [
      route.source,
      ...(Array.isArray(route.stops) ? route.stops : []),
      route.destination
    ].filter(Boolean);

    const uniqueStops = rawStops.filter((s, i) => i === 0 || norm(s) !== norm(rawStops[i - 1]));

    route.stopsDetails = uniqueStops.map((loc, idx) => ({
      stopId: `STP-${idx + 1}`,
      sequenceNumber: idx + 1,
      locationName: loc,
      qrToken: `STPTKN-${route.routeId}-${idx + 1}`,
      status: idx === 0 ? 'Completed' : 'Upcoming'
    }));
  }

  // 5. Strict stopId Verification (BUG-SEC-002)
  // A missing, undefined, null, empty, whitespace, or malformed stop identifier must NEVER be accepted.
  if (stopId === undefined || stopId === null) {
    await recordAuditEvent({
      eventType: 'SECURITY_VIOLATION',
      entityType: 'Trip',
      entityId: trip.tripId,
      actor: performedBy,
      details: 'Stop verification rejected: missing stopId',
      metadata: { tripId: trip.tripId, reason: 'MISSING_STOP_ID' }
    });
    throw {
      status: 400,
      message: 'Security Verification Failed: stopId is required and cannot be missing or undefined.'
    };
  }

  if (typeof stopId !== 'string') {
    await recordAuditEvent({
      eventType: 'SECURITY_VIOLATION',
      entityType: 'Trip',
      entityId: trip.tripId,
      actor: performedBy,
      details: 'Stop verification rejected: invalid stopId type',
      metadata: { tripId: trip.tripId, reason: 'INVALID_STOP_ID_TYPE' }
    });
    throw {
      status: 400,
      message: 'Security Verification Failed: stopId must be a valid string identifier.'
    };
  }

  const cleanStopId = stopId.trim();
  if (cleanStopId === '') {
    await recordAuditEvent({
      eventType: 'SECURITY_VIOLATION',
      entityType: 'Trip',
      entityId: trip.tripId,
      actor: performedBy,
      details: 'Stop verification rejected: empty or whitespace stopId',
      metadata: { tripId: trip.tripId, reason: 'EMPTY_STOP_ID' }
    });
    throw {
      status: 400,
      message: 'Security Verification Failed: stopId cannot be empty or whitespace.'
    };
  }

  // Format validation: must match valid stopId pattern (alphanumeric, hyphens, underscores, or clean city name)
  const validStopIdRegex = /^[a-zA-Z0-9_\-\s]{2,64}$/;
  if (!validStopIdRegex.test(cleanStopId)) {
    await recordAuditEvent({
      eventType: 'SECURITY_VIOLATION',
      entityType: 'Trip',
      entityId: trip.tripId,
      actor: performedBy,
      details: `Stop verification rejected: malformed stopId '${cleanStopId}'`,
      metadata: { tripId: trip.tripId, stopId: cleanStopId, reason: 'MALFORMED_STOP_ID' }
    });
    throw {
      status: 400,
      message: `Security Verification Failed: Malformed stopId format '${cleanStopId}'.`
    };
  }

  // Stop Ownership & Route Membership: stopId must belong to this trip's route
  const targetIndex = route.stopsDetails.findIndex(
    s => s.stopId === cleanStopId || String(s._id) === cleanStopId || norm(s.locationName) === norm(cleanStopId)
  );

  if (targetIndex === -1) {
    await recordAuditEvent({
      eventType: 'SECURITY_VIOLATION',
      entityType: 'Trip',
      entityId: trip.tripId,
      actor: performedBy,
      details: `Stop verification rejected: stop '${cleanStopId}' does not belong to route`,
      metadata: { tripId: trip.tripId, stopId: cleanStopId, reason: 'STOP_NOT_ON_ROUTE' }
    });
    throw {
      status: 400,
      message: `Security Verification Failed: Stop '${cleanStopId}' does not belong to trip '${trip.tripId}' / route '${route.routeId}'.`
    };
  }

  const targetStop = route.stopsDetails[targetIndex];

  // 6. Token Verification: Token is required and cannot be empty
  const rawToken = secureToken || qrToken || scannedToken || '';
  if (!rawToken || typeof rawToken !== 'string' || !rawToken.trim()) {
    await recordAuditEvent({
      eventType: 'SECURITY_VIOLATION',
      entityType: 'Trip',
      entityId: trip.tripId,
      actor: performedBy,
      details: 'Stop verification rejected: missing verification token',
      metadata: { tripId: trip.tripId, stopId: cleanStopId, reason: 'MISSING_TOKEN' }
    });
    throw {
      status: 400,
      message: 'Security Verification Failed: Verification token is required.'
    };
  }
  const cleanToken = rawToken.trim();

  // 7. Cryptographic & Token Signature Verification
  let decodedPayload = null;
  if (cleanToken.startsWith('STP-SEC.')) {
    const verified = verifySecureStopToken(cleanToken);
    if (!verified.valid) {
      await recordAuditEvent({
        eventType: 'SECURITY_VIOLATION',
        entityType: 'Trip',
        entityId: trip.tripId,
        actor: performedBy,
        details: `Cryptographic token verification failed: ${verified.error}`,
        metadata: { tripId: trip.tripId, stopId: cleanStopId, reason: 'CRYPTO_TOKEN_INVALID' }
      });
      throw {
        status: 401,
        message: `Security Verification Failed: ${verified.error}`
      };
    }
    decodedPayload = verified.payload;

    // Check token belongs to THIS trip
    if (decodedPayload.tripId !== trip.tripId) {
      await recordAuditEvent({
        eventType: 'SECURITY_VIOLATION',
        entityType: 'Trip',
        entityId: trip.tripId,
        actor: performedBy,
        details: `Cross-trip token rejected: token belongs to '${decodedPayload.tripId}'`,
        metadata: { tripId: trip.tripId, tokenTripId: decodedPayload.tripId, stopId: cleanStopId, reason: 'CROSS_TRIP_TOKEN' }
      });
      throw {
        status: 403,
        message: `Security Violation: Token belongs to trip '${decodedPayload.tripId}', but active trip is '${trip.tripId}'. Token scanning for another trip is prohibited.`
      };
    }

    // Check token belongs to THIS route
    if (decodedPayload.routeId !== route.routeId) {
      await recordAuditEvent({
        eventType: 'SECURITY_VIOLATION',
        entityType: 'Trip',
        entityId: trip.tripId,
        actor: performedBy,
        details: `Cross-route token rejected: token belongs to '${decodedPayload.routeId}'`,
        metadata: { tripId: trip.tripId, tokenRouteId: decodedPayload.routeId, stopId: cleanStopId, reason: 'CROSS_ROUTE_TOKEN' }
      });
      throw {
        status: 403,
        message: `Security Violation: Token belongs to route '${decodedPayload.routeId}', but trip is assigned to route '${route.routeId}'.`
      };
    }

    // Token-Stop Consistency (Section 10)
    const tokenMatchesStop = decodedPayload.stopId === targetStop.stopId ||
      decodedPayload.sequence === targetStop.sequenceNumber ||
      norm(decodedPayload.locationName) === norm(targetStop.locationName);

    if (!tokenMatchesStop) {
      await recordAuditEvent({
        eventType: 'SECURITY_VIOLATION',
        entityType: 'Trip',
        entityId: trip.tripId,
        actor: performedBy,
        details: `Token-stop mismatch: token is for '${decodedPayload.stopId || decodedPayload.locationName}', supplied stopId is '${targetStop.stopId}'`,
        metadata: { tripId: trip.tripId, tokenStopId: decodedPayload.stopId, requestedStopId: targetStop.stopId, reason: 'TOKEN_STOP_MISMATCH' }
      });
      throw {
        status: 400,
        message: `Security Violation: Token for stop '${decodedPayload.stopId || decodedPayload.locationName}' does not match the requested stop '${targetStop.stopId}'.`
      };
    }

    // Check anti-reuse of single-use token / nonce
    if (trip.usedStopTokens?.includes(cleanToken) || (decodedPayload.nonce && trip.usedStopTokens?.includes(decodedPayload.nonce))) {
      await recordAuditEvent({
        eventType: 'SECURITY_VIOLATION',
        entityType: 'Trip',
        entityId: trip.tripId,
        actor: performedBy,
        details: 'Token replay rejected: single-use token already consumed',
        metadata: { tripId: trip.tripId, stopId: cleanStopId, reason: 'TOKEN_REPLAY' }
      });
      throw {
        status: 400,
        message: 'Security Violation: This stop token has already been used. Replaying or reusing tokens is prohibited.'
      };
    }
  } else {
    // Standard QR Token / TripStop dynamic token lookup
    const tripStopDoc = await TripStop.findOne({ tripId: trip.tripId, qrToken: cleanToken }).session(session);
    let tokenStopId = null;
    let tokenSequence = null;

    if (tripStopDoc) {
      tokenStopId = tripStopDoc.stopId;
      tokenSequence = tripStopDoc.sequence;
    } else {
      const routeStop = route.stopsDetails.find(s => s.qrToken === cleanToken);
      if (routeStop) {
        tokenStopId = routeStop.stopId;
        tokenSequence = routeStop.sequenceNumber;
      }
    }

    if (!tokenStopId) {
      await recordAuditEvent({
        eventType: 'SECURITY_VIOLATION',
        entityType: 'Trip',
        entityId: trip.tripId,
        actor: performedBy,
        details: 'Invalid QR token: token does not exist or has expired',
        metadata: { tripId: trip.tripId, stopId: cleanStopId, reason: 'INVALID_QR_TOKEN' }
      });
      throw {
        status: 400,
        message: 'Security Verification Failed: Invalid stop token. Token does not exist or has expired.'
      };
    }

    // Token-Stop Consistency (Section 10)
    if (tokenStopId !== targetStop.stopId && tokenSequence !== targetStop.sequenceNumber) {
      await recordAuditEvent({
        eventType: 'SECURITY_VIOLATION',
        entityType: 'Trip',
        entityId: trip.tripId,
        actor: performedBy,
        details: `QR token-stop mismatch: token is for '${tokenStopId}', supplied stopId is '${targetStop.stopId}'`,
        metadata: { tripId: trip.tripId, tokenStopId, requestedStopId: targetStop.stopId, reason: 'TOKEN_STOP_MISMATCH' }
      });
      throw {
        status: 400,
        message: `Security Violation: Token does not match the requested stop '${targetStop.stopId}'.`
      };
    }
  }

  // 6. Sequence & Skipping Verification
  const expectedNextIndex = (trip.currentStopIndex || 0) + 1;
  if (targetIndex !== expectedNextIndex) {
    if (targetIndex <= (trip.currentStopIndex || 0)) {
      throw {
        status: 400,
        message: `Security Violation: Stop '${targetStop.locationName}' has already been verified and completed. Replaying or reusing tokens for completed stops is prohibited.`
      };
    }

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
  const tripStopDoc = await TripStop.findOne({ tripId: trip.tripId, stopId: targetStop.stopId }).session(session);
  if (targetStop.status === 'Completed' || (tripStopDoc && tripStopDoc.verificationStatus === 'COMPLETED')) {
    throw {
      status: 400,
      message: `Security Violation: Stop '${targetStop.locationName}' has already been verified and completed. Replaying or reusing tokens for completed stops is prohibited.`
    };
  }

  const now = new Date();

  // 8. Find all packages/consignments assigned to this trip & vehicle
  const [allAssignedBookings, allAssignedShipments, allAssignedPlanLoads] = await Promise.all([
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
    }).session(session),
    trip.activeLoadPlanId
      ? LoadAssignment.find({ loadPlanId: trip.activeLoadPlanId, status: { $ne: 'CANCELLED' } }).session(session)
      : []
  ]);

  // Merge items into unified active tracking list
  const activeCargoList = [];
  const seenIds = new Set();

  const routeSource = route.stopsDetails[0]?.locationName || 'Chennai';
  const routeDest = route.stopsDetails[route.stopsDetails.length - 1]?.locationName || 'Madurai';

  for (const s of allAssignedShipments) {
    seenIds.add(s.shipmentId);
    activeCargoList.push({
      _id: s._id,
      shipmentId: s.shipmentId,
      bookingId: s.bookingId || s.shipmentId,
      fromStop: s.pickupStop || s.pickup || s.source || s.loadStop || routeSource,
      toStop: s.deliveryStop || s.delivery || s.destination || s.unloadStop || routeDest,
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
        fromStop: b.fromStop || b.pickupStop || b.pickup || b.requestedSegment?.fromStop || routeSource,
        toStop: b.toStop || b.deliveryStop || b.delivery || b.requestedSegment?.toStop || routeDest,
        volume: b.volume || 1.0,
        weight: b.weight || 500,
        status: b.status || 'IN_TRANSIT',
        isShipment: false
      });
    }
  }

  for (const a of allAssignedPlanLoads) {
    const sId = a.shipmentId;
    const bId = a.bookingId || a.shipmentId;
    if (!seenIds.has(sId) && !seenIds.has(bId)) {
      seenIds.add(sId || bId);
      activeCargoList.push({
        _id: a._id,
        shipmentId: sId,
        bookingId: bId,
        fromStop: a.segmentRange?.fromStop || a.pickupStop || a.pickup || routeSource,
        toStop: a.segmentRange?.toStop || a.deliveryStop || a.delivery || routeDest,
        volume: a.volume || 1.0,
        weight: a.weight || 500,
        status: a.status || 'IN_TRANSIT',
        isShipment: true
      });
    }
  }

  // Capacity Before
  const loadedBefore = activeCargoList.filter(c => ['LOADED', 'In Transit', 'IN_TRANSIT', 'LOCKED', 'ALLOCATED', 'ON_TRUCK', 'ONBOARD', 'READY_TO_LOAD'].includes(c.status));
  const usedVolBefore = loadedBefore.reduce((s, c) => s + c.volume, 0);
  const usedWtBefore = loadedBefore.reduce((s, c) => s + c.weight, 0);

  // Final Stop Pre-Validation
  const isFinalStop = targetIndex === route.stopsDetails.length - 1;

  // Packages to UNLOAD (delivery matches current target stop)
  const packagesToUnload = activeCargoList.filter(c => {
    if (c.status === 'DELIVERED') return false;
    const destName = norm(c.toStop);
    const targetName = norm(targetStop.locationName);
    const matchesDelivery = destName === targetName || destName.includes(targetName) || targetName.includes(destName);
    return matchesDelivery;
  });

  // At final destination stop, check for undelivered packages destined for earlier stops
  if (isFinalStop) {
    const undeliveredEarlierCargo = activeCargoList.filter(c => {
      if (c.status === 'DELIVERED') return false;
      const destName = norm(c.toStop);
      const targetName = norm(targetStop.locationName);
      return destName !== targetName && !destName.includes(targetName) && !targetName.includes(destName);
    });

    if (undeliveredEarlierCargo.length > 0) {
      const names = undeliveredEarlierCargo.map(c => `${c.bookingId || c.shipmentId} (dest: ${c.toStop})`).join(', ');
      throw {
        status: 400,
        message: `Cannot complete trip: ${undeliveredEarlierCargo.length} undelivered package(s) destined for earlier stops still on vehicle: ${names}.`
      };
    }
  }

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

  // 10. EXECUTE UNLOADS FIRST
  const unloadedDetails = [];
  for (const c of packagesToUnload) {
    c.status = 'DELIVERED';

    // Update Shipment
    if (c.shipmentId) {
      await Shipment.updateMany(
        { $or: [{ shipmentId: c.shipmentId }, { bookingId: c.bookingId }, { bookingId: c.shipmentId }] },
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
        { $or: [{ bookingId: c.bookingId }, { shipmentId: c.shipmentId }, { shipmentId: c.bookingId }] },
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
        {
          loadPlanId: trip.activeLoadPlanId,
          $or: [
            { shipmentId: c.shipmentId },
            { bookingId: c.bookingId },
            { shipmentId: c.bookingId },
            { bookingId: c.shipmentId }
          ]
        },
        { $set: { status: 'DELIVERED', physicalStatus: 'DELIVERED', deliveredAt: now } },
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
    // Final stop: ensure ALL bookings, shipments, and load assignments for this trip are confirmed DELIVERED
    await Promise.all([
      Booking.updateMany(
        {
          $or: [
            { vehicleId: vehicle.vehicleId },
            { allocatedVehicleId: vehicle.vehicleId },
            { allocatedTripId: trip.tripId },
            { assignedTripId: trip.tripId }
          ],
          status: { $nin: ['CANCELLED', 'DELIVERED'] }
        },
        { $set: { status: 'DELIVERED', allocationStatus: 'DELIVERED', physicalStatus: 'DELIVERED', deliveredAt: now } },
        { session }
      ),
      Shipment.updateMany(
        {
          $or: [
            { vehicleId: vehicle.vehicleId },
            { allocatedVehicleId: vehicle.vehicleId },
            { allocatedTripId: trip.tripId },
            { assignedTripId: trip.tripId }
          ],
          status: { $nin: ['CANCELLED', 'DELIVERED'] }
        },
        { $set: { status: 'DELIVERED', allocationStatus: 'DELIVERED', physicalStatus: 'DELIVERED', deliveredAt: now } },
        { session }
      ),
      trip.activeLoadPlanId ? LoadAssignment.updateMany(
        { loadPlanId: trip.activeLoadPlanId, status: { $ne: 'DELIVERED' } },
        { $set: { status: 'DELIVERED', physicalStatus: 'DELIVERED', deliveredAt: now } },
        { session }
      ) : Promise.resolve()
    ]);

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
        {
          $set: {
            verificationStatus: 'READY',
            plannedArrival: now,
            location: nextStop.locationName,
            sequence: targetIndex + 2,
            qrToken: nextStop.qrToken || `STPTKN-${trip.tripId}-${targetIndex + 2}`
          }
        },
        { session, upsert: true }
      );
    }
  }

  // Update TripStop verification status
  await TripStop.updateOne(
    { tripId: trip.tripId, stopId: targetStop.stopId },
    {
      $set: {
        verificationStatus: 'COMPLETED',
        verificationMethod,
        actualArrival: now,
        completionTimestamp: now,
        location: targetStop.locationName,
        sequence: targetIndex + 1,
        qrToken: targetStop.qrToken || `STPTKN-${trip.tripId}-${targetIndex + 1}`
      }
    },
    { session, upsert: true }
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
    success: true,
    isIdempotentReplay: false,
    stop: targetStop.locationName,
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
