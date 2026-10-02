import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

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
import AuditEvent from '../models/AuditEvent.js';
import User from '../models/User.js';

import {
  dispatchTripOperational,
  executeStopLifecycleOperational
} from '../services/tripLifecycleService.js';
import { generateSecureStopToken } from '../services/secureTokenService.js';
import { verifyStop } from '../controllers/transitController.js';

import { connectTestDB, assertTestDatabase, safeDeleteMany } from '../config/testDbGuard.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const createMockRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    }
  };
  return res;
};

const runSecurityStopVerificationRegression = async () => {
  let testsPassed = 0;
  let testsFailed = 0;

  const assertEqual = (actual, expected, message) => {
    if (actual === expected) {
      testsPassed++;
      console.log(`  [PASS] ${message} (Expected: ${expected}, Got: ${actual})`);
    } else {
      testsFailed++;
      console.error(`  [FAIL] ${message} (Expected: ${expected}, Got: ${actual})`);
      throw new Error(`Assertion failed: ${message}`);
    }
  };

  const assertTrue = (condition, message) => {
    if (condition) {
      testsPassed++;
      console.log(`  [PASS] ${message}`);
    } else {
      testsFailed++;
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  };

  try {
    const { dbName } = await connectTestDB();
    console.log(`[TEST-GUARD] Connected to verified test database: ${dbName}`);

    console.log('\n================================================================================');
    console.log('STARTING BUG-SEC-002 SECURITY REGRESSION TEST SUITE');
    console.log('================================================================================\n');

    const routeId = 'RTE-SEC-REGRESS';
    const otherRouteId = 'RTE-OTHER-REGRESS';
    const vehicleId = 'TRK-SEC-REGRESS-1';
    const shipperUsername = 'shipper-regress';

    // 0. Clean isolated test database fixtures
    const existingTrips = await Trip.find({ vehicleId }, 'tripId');
    const tripIds = existingTrips.map(t => t.tripId);
    const existingPlans = await LoadPlan.find({ vehicleId }, '_id');
    const planIds = existingPlans.map(p => p._id);

    await safeDeleteMany(Trip, { vehicleId });
    await safeDeleteMany(TripStop, { $or: [{ tripId: { $in: tripIds } }, { stopId: { $regex: /^STP-REG-/ } }] });
    await safeDeleteMany(Vehicle, { vehicleId });
    await safeDeleteMany(Route, { routeId: { $in: [routeId, otherRouteId] } });
    await safeDeleteMany(Shipment, { shipperId: shipperUsername });
    await safeDeleteMany(Booking, { shipperId: shipperUsername });
    await safeDeleteMany(LoadPlan, { vehicleId });
    await safeDeleteMany(LoadAssignment, { $or: [{ loadPlan: { $in: planIds } }, { loadPlanId: { $regex: /^LP-/ } }] });
    await safeDeleteMany(LoadOperation, { tripId: { $in: tripIds } });
    await safeDeleteMany(StopVerification, { vehicleId });
    await safeDeleteMany(User, { username: shipperUsername });

    // Seed Route A (Primary)
    const route = await Route.create({
      routeId,
      source: 'Chennai',
      destination: 'Madurai',
      distance: 480,
      baseRate: 200,
      stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai'],
      stopsDetails: [
        { stopId: 'STP-REG-1', locationName: 'Chennai', sequenceNumber: 1, qrToken: 'QR-CHE-1', status: 'Ready' },
        { stopId: 'STP-REG-2', locationName: 'Salem', sequenceNumber: 2, qrToken: 'QR-SLM-2', status: 'Upcoming' },
        { stopId: 'STP-REG-3', locationName: 'Coimbatore', sequenceNumber: 3, qrToken: 'QR-CBE-3', status: 'Upcoming' },
        { stopId: 'STP-REG-4', locationName: 'Madurai', sequenceNumber: 4, qrToken: 'QR-MDU-4', status: 'Upcoming' }
      ],
      active: true
    });

    // Seed Route B (Cross-trip / Cross-route)
    const otherRoute = await Route.create({
      routeId: otherRouteId,
      source: 'Bangalore',
      destination: 'Trichy',
      distance: 350,
      baseRate: 180,
      stops: ['Bangalore', 'Hosur', 'Trichy'],
      stopsDetails: [
        { stopId: 'STP-OTHER-1', locationName: 'Bangalore', sequenceNumber: 1, qrToken: 'QR-BLR-1', status: 'Ready' },
        { stopId: 'STP-OTHER-2', locationName: 'Hosur', sequenceNumber: 2, qrToken: 'QR-HSR-2', status: 'Upcoming' },
        { stopId: 'STP-OTHER-3', locationName: 'Trichy', sequenceNumber: 3, qrToken: 'QR-TRY-3', status: 'Upcoming' }
      ],
      active: true
    });

    // Seed Vehicle
    const vehicle = await Vehicle.create({
      vehicleId,
      carrierId: 'carrier-regress',
      assignedDriverId: 'driver-regress',
      type: 'Heavy Truck',
      capacityWeight: 20000,
      capacityVolume: 100,
      currentWeight: 0,
      currentVolume: 0,
      status: 'Active',
      transitStatus: 'READY',
      routeLane: routeId,
      currentLocation: 'Chennai'
    });

    // Seed Users
    const shipperUser = await User.create({
      username: shipperUsername,
      email: 'shipper.regress@security.ai',
      password: 'password123',
      role: 'customer',
      name: 'Regression Shipper'
    });

    // Seed Bookings
    const b1 = await Booking.create({
      bookingId: 'BKG-REG-1',
      shipmentId: 'SHP-REG-1',
      customer: shipperUser._id,
      shipper: shipperUser._id,
      shipperId: shipperUsername,
      vehicleId,
      routeId,
      fromStop: 'Chennai',
      toStop: 'Salem',
      volume: 5,
      weight: 1000,
      price: 1000,
      revenue: 1000,
      date: new Date(),
      status: 'ALLOCATED'
    });

    const b2 = await Booking.create({
      bookingId: 'BKG-REG-2',
      shipmentId: 'SHP-REG-2',
      customer: shipperUser._id,
      shipper: shipperUser._id,
      shipperId: shipperUsername,
      vehicleId,
      routeId,
      fromStop: 'Salem',
      toStop: 'Madurai',
      volume: 8,
      weight: 1500,
      price: 1600,
      revenue: 1600,
      date: new Date(),
      status: 'ALLOCATED'
    });

    const b3 = await Booking.create({
      bookingId: 'BKG-REG-3',
      shipmentId: 'SHP-REG-3',
      customer: shipperUser._id,
      shipper: shipperUser._id,
      shipperId: shipperUsername,
      vehicleId,
      routeId,
      fromStop: 'Chennai',
      toStop: 'Madurai',
      volume: 10,
      weight: 2000,
      price: 2000,
      revenue: 2000,
      date: new Date(),
      status: 'ALLOCATED'
    });

    // Create Trip
    const tripId = `TRIP-SEC-REGRESS-${Date.now()}`;
    const trip = await Trip.create({
      tripId,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      carrierId: 'carrier-regress',
      driverId: 'driver-regress',
      status: 'READY_FOR_DISPATCH'
    });

    for (let i = 0; i < route.stopsDetails.length; i++) {
      const st = route.stopsDetails[i];
      await TripStop.create({
        tripId,
        stopId: st.stopId,
        sequence: st.sequenceNumber,
        location: st.locationName,
        qrToken: st.qrToken,
        verificationStatus: i === 0 ? 'READY' : 'UPCOMING'
      });
    }

    await LoadPlan.create({
      loadPlanId: `LP-${tripId}-v1`,
      trip: trip._id,
      tripId,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      version: 1,
      status: 'APPROVED',
      isImmutable: false,
      objectiveScore: 95,
      overallUtilization: { volume: 85, weight: 80 }
    });

    // Dispatch Trip
    const dispatchResult = await dispatchTripOperational({
      tripId,
      performedBy: 'dispatcher-regress'
    });
    console.log(`Dispatched Trip ID: ${tripId} with initial stop index: ${dispatchResult.trip.currentStopIndex}`);

    // Generate legitimate tokens
    const validTokenStop2 = generateSecureStopToken({
      tripId,
      vehicleId,
      routeId,
      stopId: 'STP-REG-2',
      sequence: 2,
      locationName: 'Salem'
    });

    const validTokenStop3 = generateSecureStopToken({
      tripId,
      vehicleId,
      routeId,
      stopId: 'STP-REG-3',
      sequence: 3,
      locationName: 'Coimbatore'
    });

    const otherTripToken = generateSecureStopToken({
      tripId: 'TRIP-DIFFERENT-999',
      vehicleId,
      routeId,
      stopId: 'STP-REG-2',
      sequence: 2,
      locationName: 'Salem'
    });

    // Snapshot state before attacks
    const getSystemState = async () => {
      const trip = await Trip.findOne({ tripId });
      const tripStops = await TripStop.find({ tripId }).sort({ sequence: 1 });
      const loadOps = await LoadOperation.find({ tripId });
      const bookings = await Booking.find({ bookingId: { $in: ['BKG-REG-1', 'BKG-REG-2', 'BKG-REG-3'] } });
      return { trip, tripStops, loadOps, bookings };
    };

    const initialSnapshot = await getSystemState();

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 1: Missing stopId (property omitted from request)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 1: Missing stopId (property omitted) ---');
    let test1Rejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        secureToken: validTokenStop2
        // stopId intentionally omitted!
      });
    } catch (err) {
      test1Rejected = true;
      assertEqual(err.status, 400, 'Test 1 HTTP status');
      assertTrue(err.message.includes('stopId is required'), 'Test 1 rejection message');
    }
    assertTrue(test1Rejected, 'Test 1: Request with omitted stopId was strictly rejected');

    const snapAfterT1 = await getSystemState();
    assertEqual(snapAfterT1.trip.currentStopIndex, initialSnapshot.trip.currentStopIndex, 'Test 1: Trip currentStopIndex unchanged');
    assertEqual(snapAfterT1.loadOps.length, initialSnapshot.loadOps.length, 'Test 1: LoadOperation count unchanged');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 2: undefined stopId
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 2: undefined stopId ---');
    let test2Rejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: undefined,
        secureToken: validTokenStop2
      });
    } catch (err) {
      test2Rejected = true;
      assertEqual(err.status, 400, 'Test 2 HTTP status');
      assertTrue(err.message.includes('stopId is required'), 'Test 2 rejection message');
    }
    assertTrue(test2Rejected, 'Test 2: Explicit stopId: undefined rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 3: null stopId
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 3: null stopId ---');
    let test3Rejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: null,
        secureToken: validTokenStop2
      });
    } catch (err) {
      test3Rejected = true;
      assertEqual(err.status, 400, 'Test 3 HTTP status');
      assertTrue(err.message.includes('stopId is required'), 'Test 3 rejection message');
    }
    assertTrue(test3Rejected, 'Test 3: stopId: null rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 4: empty string stopId
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 4: empty string stopId ---');
    let test4Rejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: '',
        secureToken: validTokenStop2
      });
    } catch (err) {
      test4Rejected = true;
      assertEqual(err.status, 400, 'Test 4 HTTP status');
      assertTrue(err.message.includes('empty or whitespace'), 'Test 4 rejection message');
    }
    assertTrue(test4Rejected, 'Test 4: stopId: "" rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 5: whitespace stopId
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 5: whitespace stopId ---');
    let test5Rejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: '     ',
        secureToken: validTokenStop2
      });
    } catch (err) {
      test5Rejected = true;
      assertEqual(err.status, 400, 'Test 5 HTTP status');
      assertTrue(err.message.includes('empty or whitespace'), 'Test 5 rejection message');
    }
    assertTrue(test5Rejected, 'Test 5: whitespace stopId rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 6: malformed stopId
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 6: malformed stopId ---');
    let test6Rejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: '<script>alert(1)</script>',
        secureToken: validTokenStop2
      });
    } catch (err) {
      test6Rejected = true;
      assertEqual(err.status, 400, 'Test 6 HTTP status');
      assertTrue(err.message.includes('Malformed stopId'), 'Test 6 rejection message');
    }
    assertTrue(test6Rejected, 'Test 6: malformed stopId rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 7: nonexistent stopId
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 7: nonexistent stopId ---');
    let test7Rejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: 'STP-NONEXISTENT-999',
        secureToken: validTokenStop2
      });
    } catch (err) {
      test7Rejected = true;
      assertEqual(err.status, 400, 'Test 7 HTTP status');
      assertTrue(err.message.includes('does not belong to trip'), 'Test 7 rejection message');
    }
    assertTrue(test7Rejected, 'Test 7: nonexistent stopId rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 8: stop from another trip / route
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 8: stop from another trip / route ---');
    let test8Rejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: 'STP-OTHER-2', // Hosur on otherRoute
        secureToken: validTokenStop2
      });
    } catch (err) {
      test8Rejected = true;
      assertEqual(err.status, 400, 'Test 8 HTTP status');
      assertTrue(err.message.includes('does not belong to trip'), 'Test 8 rejection message');
    }
    assertTrue(test8Rejected, 'Test 8: stop from another route rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 9: wrong sequence (attempting to verify Stop 3 when Stop 2 is pending)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 9: wrong sequence (skipping stops) ---');
    let test9Rejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: 'STP-REG-3', // Coimbatore
        secureToken: validTokenStop3
      });
    } catch (err) {
      test9Rejected = true;
      assertEqual(err.status, 400, 'Test 9 HTTP status');
      assertTrue(err.message.includes('Cannot skip stops'), 'Test 9 rejection message');
    }
    assertTrue(test9Rejected, 'Test 9: out-of-order stop sequence rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 10: valid verification (Salem Stop 2)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 10: valid verification ---');
    const validResult = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      stopId: 'STP-REG-2',
      secureToken: validTokenStop2,
      idempotencyKey: 'IDEM-KEY-STOP-2-ORIGINAL'
    });
    assertTrue(validResult.success, 'Test 10: Valid verification succeeded');
    assertEqual(validResult.stop, 'Salem', 'Test 10: Verified stop location');
    assertEqual(validResult.unloadedCount, 1, 'Test 10: 1 package unloaded at Salem (SHP-REG-1)');
    assertEqual(validResult.loadedCount, 1, 'Test 10: 1 package loaded at Salem (SHP-REG-2)');

    const snapAfterValid = await getSystemState();
    assertEqual(snapAfterValid.trip.currentStopIndex, 1, 'Test 10: Trip advanced to index 1');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 11: invalid / tampered token
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 11: invalid / tampered token ---');
    let test11Rejected = false;
    try {
      const parts = validTokenStop3.split('.');
      const tamperedSig = parts[2].slice(0, -4) + 'AAAA';
      const tamperedToken = `${parts[0]}.${parts[1]}.${tamperedSig}`;

      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: 'STP-REG-3',
        secureToken: tamperedToken
      });
    } catch (err) {
      test11Rejected = true;
      assertEqual(err.status, 401, 'Test 11 HTTP status');
      assertTrue(err.message.includes('signature mismatch') || err.message.includes('tampered'), 'Test 11 rejection message');
    }
    assertTrue(test11Rejected, 'Test 11: tampered token rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 12: missing token
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 12: missing token ---');
    let test12Rejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: 'STP-REG-3',
        secureToken: ''
      });
    } catch (err) {
      test12Rejected = true;
      assertEqual(err.status, 400, 'Test 12 HTTP status');
      assertTrue(err.message.includes('token is required'), 'Test 12 rejection message');
    }
    assertTrue(test12Rejected, 'Test 12: missing token rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 13: wrong token for stop (token generated for Stop 4 presented for Stop 3)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 13: wrong token for stop ---');
    let test13Rejected = false;
    try {
      const tokenStop4 = generateSecureStopToken({
        tripId,
        vehicleId,
        routeId,
        stopId: 'STP-REG-4',
        sequence: 4,
        locationName: 'Madurai'
      });

      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: 'STP-REG-3', // Coimbatore
        secureToken: tokenStop4 // Token is for Madurai
      });
    } catch (err) {
      test13Rejected = true;
      assertEqual(err.status, 400, 'Test 13 HTTP status');
      assertTrue(err.message.includes('does not match the requested stop'), 'Test 13 rejection message');
    }
    assertTrue(test13Rejected, 'Test 13: mismatching token-stop rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 14: replay protection
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 14: replay protection ---');
    // 14A: Same idempotency key -> safely idempotent
    const idemReplay = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      stopId: 'STP-REG-2',
      secureToken: validTokenStop2,
      idempotencyKey: 'IDEM-KEY-STOP-2-ORIGINAL'
    });
    assertTrue(idemReplay.isIdempotentReplay, 'Test 14A: Same idempotency key recognized as idempotent replay');

    // 14B: Different or new key replay of already completed stop -> REJECT 400
    let replayRejected = false;
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: 'STP-REG-2',
        secureToken: validTokenStop2,
        idempotencyKey: 'IDEM-NEW-KEY-ATTACK'
      });
    } catch (err) {
      replayRejected = true;
      assertEqual(err.status, 400, 'Test 14B HTTP status');
      assertTrue(
        err.message.includes('already been used') ||
        err.message.includes('already been verified and completed') ||
        err.message.includes('replaying or reusing'),
        'Test 14B rejection message'
      );
    }
    assertTrue(replayRejected, 'Test 14B: Replay attack with new key rejected');

    // ─────────────────────────────────────────────────────────────────────────────
    // TEST 15: Rejected requests cause NO business-side mutation
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST 15: Mutation safety after rejected requests ---');
    const snapBeforeAttacks = await getSystemState();

    // Fire 5 malicious requests in a row
    const attackPayloads = [
      { stopId: undefined, secureToken: validTokenStop3 },
      { stopId: null, secureToken: validTokenStop3 },
      { stopId: '', secureToken: validTokenStop3 },
      { stopId: 'STP-NONEXISTENT', secureToken: validTokenStop3 },
      { stopId: 'STP-REG-4', secureToken: validTokenStop3 } // wrong sequence
    ];

    for (const payload of attackPayloads) {
      try {
        await executeStopLifecycleOperational({
          tripId,
          vehicleId,
          ...payload
        });
      } catch (e) {
        // expected rejection
      }
    }

    const snapAfterAttacks = await getSystemState();
    assertEqual(snapAfterAttacks.trip.currentStopIndex, snapBeforeAttacks.trip.currentStopIndex, 'Test 15: Trip currentStopIndex unchanged');
    assertEqual(snapAfterAttacks.trip.status, snapBeforeAttacks.trip.status, 'Test 15: Trip status unchanged');
    assertEqual(snapAfterAttacks.loadOps.length, snapBeforeAttacks.loadOps.length, 'Test 15: LoadOperation count unchanged');
    assertEqual(snapAfterAttacks.tripStops.length, snapBeforeAttacks.tripStops.length, 'Test 15: TripStop count unchanged');
    for (let i = 0; i < snapAfterAttacks.bookings.length; i++) {
      assertEqual(
        snapAfterAttacks.bookings[i].status,
        snapBeforeAttacks.bookings[i].status,
        `Test 15: Booking ${snapAfterAttacks.bookings[i].bookingId} status unchanged`
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SECTION 16: Attack the original vulnerability directly (undefined stopId ≠ nextExpectedStop)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 16: Original Exploit Attack Test ---');
    let exploitRejected = false;
    try {
      // The original vulnerability evaluated: if (!stopId || nextExpectedStop.stopId === stopId)
      // which treated missing stopId as true and advanced the trip!
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        stopId: undefined,
        secureToken: validTokenStop3,
        performedBy: 'attacker'
      });
    } catch (err) {
      exploitRejected = true;
      assertEqual(err.status, 400, 'Exploit Attack HTTP status');
      assertTrue(err.message.includes('stopId is required'), 'Exploit Attack error message');
    }
    assertTrue(exploitRejected, 'Section 16: undefined stopId does NOT match nextExpectedStop and is REJECTED');

    // ─────────────────────────────────────────────────────────────────────────────
    // SECTION 17: API / Controller Layer Security Tests (verifyStop)
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- SECTION 17: API Controller Layer Security Tests ---');

    // Controller Test 1: Missing stopId
    const req1 = {
      body: {
        tripId,
        vehicleId,
        secureToken: validTokenStop3
        // stopId omitted
      },
      headers: {}
    };
    const res1 = createMockRes();
    await verifyStop(req1, res1);
    assertEqual(res1.statusCode, 400, 'Controller Test 1: Missing stopId HTTP 400');
    assertEqual(res1.body.success, false, 'Controller Test 1: success is false');

    // Controller Test 2: undefined stopId
    const req2 = {
      body: {
        tripId,
        vehicleId,
        stopId: undefined,
        secureToken: validTokenStop3
      },
      headers: {}
    };
    const res2 = createMockRes();
    await verifyStop(req2, res2);
    assertEqual(res2.statusCode, 400, 'Controller Test 2: undefined stopId HTTP 400');

    // Controller Test 3: empty string stopId
    const req3 = {
      body: {
        tripId,
        vehicleId,
        stopId: '',
        secureToken: validTokenStop3
      },
      headers: {}
    };
    const res3 = createMockRes();
    await verifyStop(req3, res3);
    assertEqual(res3.statusCode, 400, 'Controller Test 3: empty string stopId HTTP 400');

    // Controller Test 4: whitespace stopId
    const req4 = {
      body: {
        tripId,
        vehicleId,
        stopId: '   ',
        secureToken: validTokenStop3
      },
      headers: {}
    };
    const res4 = createMockRes();
    await verifyStop(req4, res4);
    assertEqual(res4.statusCode, 400, 'Controller Test 4: whitespace stopId HTTP 400');

    // Controller Test 5: valid request through Controller
    const req5 = {
      body: {
        tripId,
        vehicleId,
        stopId: 'STP-REG-3',
        secureToken: validTokenStop3
      },
      headers: {}
    };
    const res5 = createMockRes();
    await verifyStop(req5, res5);
    assertEqual(res5.statusCode, 200, 'Controller Test 5: valid request HTTP 200');
    assertEqual(res5.body.success, true, 'Controller Test 5: valid request success is true');
    assertEqual(res5.body.stop, 'Coimbatore', 'Controller Test 5: verified stop location');

    // ─────────────────────────────────────────────────────────────────────────────
    // Complete remaining lifecycle legitimately to destination
    // ─────────────────────────────────────────────────────────────────────────────
    console.log('\n--- Legitimate Final Destination Verification ---');
    const validTokenStop4 = generateSecureStopToken({
      tripId,
      vehicleId,
      routeId,
      stopId: 'STP-REG-4',
      sequence: 4,
      locationName: 'Madurai'
    });

    const finalStopRes = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      stopId: 'STP-REG-4',
      secureToken: validTokenStop4
    });
    assertTrue(finalStopRes.success, 'Final stop verified successfully');
    assertTrue(finalStopRes.isFinalStop, 'Trip completed at final destination');

    const completedTrip = await Trip.findOne({ tripId });
    assertEqual(completedTrip.status, 'COMPLETED', 'Trip marked COMPLETED');

    // Safe Scoped Cleanup of Test Fixtures
    await safeDeleteMany(Trip, { vehicleId });
    await safeDeleteMany(TripStop, { tripId });
    await safeDeleteMany(Vehicle, { vehicleId });
    await safeDeleteMany(Route, { routeId: { $in: [routeId, otherRouteId] } });
    await safeDeleteMany(Shipment, { shipperId: shipperUsername });
    await safeDeleteMany(Booking, { shipperId: shipperUsername });
    await safeDeleteMany(LoadPlan, { vehicleId });
    await safeDeleteMany(LoadAssignment, { loadPlanId: `LP-${tripId}-v1` });
    await safeDeleteMany(LoadOperation, { tripId });
    await safeDeleteMany(StopVerification, { vehicleId });
    await safeDeleteMany(User, { username: shipperUsername });

    console.log('\n================================================================================');
    console.log(`SECURITY REGRESSION SUITE COMPLETE: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('================================================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Fatal error in security regression suite:', error);
    process.exit(1);
  }
};

runSecurityStopVerificationRegression();
