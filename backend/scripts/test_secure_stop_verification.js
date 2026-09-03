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
import Payment from '../models/Payment.js';
import User from '../models/User.js';

import {
  dispatchTripOperational,
  executeStopLifecycleOperational
} from '../services/tripLifecycleService.js';
import { generateSecureStopToken } from '../services/secureTokenService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const runSecureStopVerificationTestSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics';
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('STARTING SECURE STOP VERIFICATION & MALICIOUS ATTACK TEST SUITE');
    console.log('===============================================================');

    const routeId = 'RTE-SEC-TEST';
    const otherRouteId = 'RTE-OTHER-TEST';
    const vehicleId = 'TRK-SEC-1';
    const shipperUsername = 'shipper-sec';

    // Cleanup
    await Trip.deleteMany({ vehicleId });
    await TripStop.deleteMany({});
    await Vehicle.deleteMany({ vehicleId });
    await Route.deleteMany({ routeId: { $in: [routeId, otherRouteId] } });
    await Shipment.deleteMany({ shipperId: shipperUsername });
    await Booking.deleteMany({ shipperId: shipperUsername });
    await LoadPlan.deleteMany({ vehicleId });
    await LoadAssignment.deleteMany({});
    await LoadOperation.deleteMany({});
    await StopVerification.deleteMany({ vehicleId });
    await Payment.deleteMany({});
    await User.deleteMany({ username: { $in: [shipperUsername, 'manager-sec'] } });

    const managerUser = await User.create({
      username: 'manager-sec',
      email: 'mgr@security.ai',
      password: 'password123',
      role: 'logistics_manager',
      name: 'Security Ops Manager'
    });

    const shipperUser = await User.create({
      username: shipperUsername,
      email: 'shipper@security.ai',
      password: 'password123',
      role: 'customer',
      name: 'Security Test Shipper'
    });

    const route = await Route.create({
      routeId,
      source: 'Chennai',
      destination: 'Madurai',
      distance: 480,
      baseRate: 200,
      stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai'],
      stopsDetails: [
        { stopId: 'STP-SEC-1', locationName: 'Chennai', sequenceNumber: 1, qrToken: 'QR-CHE-1', status: 'Ready' },
        { stopId: 'STP-SEC-2', locationName: 'Salem', sequenceNumber: 2, qrToken: 'QR-SLM-2', status: 'Upcoming' },
        { stopId: 'STP-SEC-3', locationName: 'Coimbatore', sequenceNumber: 3, qrToken: 'QR-CBE-3', status: 'Upcoming' },
        { stopId: 'STP-SEC-4', locationName: 'Madurai', sequenceNumber: 4, qrToken: 'QR-MDU-4', status: 'Upcoming' }
      ],
      active: true
    });

    await Route.create({
      routeId: otherRouteId,
      source: 'Bangalore',
      destination: 'Hyderabad',
      distance: 570,
      baseRate: 250,
      stops: ['Bangalore', 'Anantapur', 'Kurnool', 'Hyderabad'],
      stopsDetails: [
        { stopId: 'STP-OTH-1', locationName: 'Bangalore', sequenceNumber: 1, qrToken: 'QR-BLR-1', status: 'Ready' },
        { stopId: 'STP-OTH-2', locationName: 'Anantapur', sequenceNumber: 2, qrToken: 'QR-ATP-2', status: 'Upcoming' },
        { stopId: 'STP-OTH-3', locationName: 'Kurnool', sequenceNumber: 3, qrToken: 'QR-KNL-3', status: 'Upcoming' },
        { stopId: 'STP-OTH-4', locationName: 'Hyderabad', sequenceNumber: 4, qrToken: 'QR-HYD-4', status: 'Upcoming' }
      ],
      active: true
    });

    const vehicle = await Vehicle.create({
      vehicleId,
      type: 'Container Truck',
      capacityVolume: 100,
      capacityWeight: 20000,
      dimensions: { length: 13.6, width: 2.45, height: 3.0 },
      status: 'Active',
      carrier: managerUser._id,
      carrierId: 'carrier-fastlane',
      routeLane: routeId,
      transitStatus: 'READY'
    });

    const tripId = `TRIP-SEC-${Date.now()}`;
    const trip = await Trip.create({
      tripId,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      carrierId: 'carrier-fastlane',
      driverId: 'driver-suresh',
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
      objectiveScore: 92,
      overallUtilization: { volume: 80, weight: 75 }
    });

    // Seed Cargo
    // P1: Chennai -> Salem (35 m³, 5000 kg)
    // P2: Chennai -> Madurai (45 m³, 9000 kg)
    // P3: Salem -> Coimbatore (25 m³, 3000 kg)
    // P4: Coimbatore -> Madurai (30 m³, 4000 kg)
    const bookingsData = [
      { id: 'SEC-P1', pickup: 'Chennai', delivery: 'Salem', vol: 35, wt: 5000 },
      { id: 'SEC-P2', pickup: 'Chennai', delivery: 'Madurai', vol: 45, wt: 9000 },
      { id: 'SEC-P3', pickup: 'Salem', delivery: 'Coimbatore', vol: 25, wt: 3000 },
      { id: 'SEC-P4', pickup: 'Coimbatore', delivery: 'Madurai', vol: 30, wt: 4000 }
    ];

    for (const b of bookingsData) {
      const bkgDoc = await Booking.create({
        bookingId: `BKG-${b.id}`,
        shipmentId: b.id,
        customer: shipperUser._id,
        shipper: shipperUser._id,
        shipperId: shipperUsername,
        vehicleId,
        routeId,
        fromStop: b.pickup,
        toStop: b.delivery,
        volume: b.vol,
        weight: b.wt,
        revenue: b.vol * 200,
        price: b.vol * 200,
        date: new Date(),
        status: 'ALLOCATED'
      });

      const totalAmt = b.vol * 200;
      await Payment.create({
        booking: bkgDoc._id,
        bookingId: `BKG-${b.id}`,
        shipper: shipperUser._id,
        shipperId: shipperUsername,
        carrier: managerUser._id,
        carrierId: 'carrier-fastlane',
        amount: totalAmt,
        platformFee: Math.round(totalAmt * 0.05),
        carrierPayout: Math.round(totalAmt * 0.95),
        status: 'Escrow',
        transactionId: `TXN-SEC-${b.id}`
      });
    }

    // ── DISPATCH ──────────────────────────────────────────────────
    console.log('\n[STEP 1] Dispatching trip with cryptographic token issuance...');
    const dispatchRes = await dispatchTripOperational({ tripId, performedBy: 'ops-manager' });
    if (dispatchRes.trip.status !== 'IN_TRANSIT') throw new Error('Dispatch failed');
    console.log('✅ STEP 1 PASSED: Trip dispatched, secure tokens generated for all stops.');

    // Retrieve generated secure tokens from TripStop
    const stop2Doc = await TripStop.findOne({ tripId, sequence: 2 });
    const stop3Doc = await TripStop.findOne({ tripId, sequence: 3 });
    const stop4Doc = await TripStop.findOne({ tripId, sequence: 4 });

    const validTokenStop2 = stop2Doc.secureToken;
    const validTokenStop3 = stop3Doc.secureToken;
    const validTokenStop4 = stop4Doc.secureToken;

    // ── SCENARIO 1: FORGED / TAMPERED TOKEN ────────────────────────
    console.log('\n[SCENARIO 1] Testing Forged / Tampered Cryptographic Token...');
    const tamperedToken = validTokenStop2.substring(0, validTokenStop2.length - 4) + 'XXXX';
    try {
      await executeStopLifecycleOperational({ tripId, vehicleId, secureToken: tamperedToken });
      throw new Error('Scenario 1 Failed: Forged token was accepted!');
    } catch (err) {
      if (err.status !== 401 || !err.message.includes('signature mismatch')) throw err;
      console.log(`✅ SCENARIO 1 PASSED: Forged HMAC signature rejected with 401: "${err.message}"`);
    }

    // ── SCENARIO 2: EXPIRED TOKEN ─────────────────────────────────
    console.log('\n[SCENARIO 2] Testing Expired Token Rejection...');
    const expiredToken = generateSecureStopToken({
      tripId,
      vehicleId,
      routeId,
      stopId: 'STP-SEC-2',
      sequence: 2,
      locationName: 'Salem',
      validityHours: -5 // Expired 5 hours ago
    });
    try {
      await executeStopLifecycleOperational({ tripId, vehicleId, secureToken: expiredToken });
      throw new Error('Scenario 2 Failed: Expired token was accepted!');
    } catch (err) {
      if (err.status !== 401 || !err.message.includes('expired')) throw err;
      console.log(`✅ SCENARIO 2 PASSED: Expired token rejected with 401: "${err.message}"`);
    }

    // ── SCENARIO 3: ANOTHER TRIP'S TOKEN ATTACK ───────────────────
    console.log('\n[SCENARIO 3] Testing Token From Another Trip...');
    const otherTripToken = generateSecureStopToken({
      tripId: 'TRIP-DIFFERENT-999',
      vehicleId: 'TRK-OTHER',
      routeId,
      stopId: 'STP-SEC-2',
      sequence: 2,
      locationName: 'Salem'
    });
    try {
      await executeStopLifecycleOperational({ tripId, vehicleId, secureToken: otherTripToken });
      throw new Error('Scenario 3 Failed: Cross-trip token was accepted!');
    } catch (err) {
      if (err.status !== 403 || !err.message.includes('Token belongs to trip')) throw err;
      console.log(`✅ SCENARIO 3 PASSED: Cross-trip token rejected with 403: "${err.message}"`);
    }

    // ── SCENARIO 4: ANOTHER ROUTE'S TOKEN ATTACK ──────────────────
    console.log('\n[SCENARIO 4] Testing Token From Another Route Lane...');
    const otherRouteToken = generateSecureStopToken({
      tripId,
      vehicleId,
      routeId: otherRouteId,
      stopId: 'STP-OTH-2',
      sequence: 2,
      locationName: 'Anantapur'
    });
    try {
      await executeStopLifecycleOperational({ tripId, vehicleId, secureToken: otherRouteToken });
      throw new Error('Scenario 4 Failed: Cross-route token was accepted!');
    } catch (err) {
      if (err.status !== 403 || !err.message.includes('Token belongs to route')) throw err;
      console.log(`✅ SCENARIO 4 PASSED: Cross-route token rejected with 403: "${err.message}"`);
    }

    // ── SCENARIO 5: OUT-OF-ORDER FUTURE STOP SCAN ─────────────────
    console.log('\n[SCENARIO 5] Testing Future Out-of-Order Stop Token (Scanning Stop 3 before Stop 2)...');
    try {
      await executeStopLifecycleOperational({ tripId, vehicleId, secureToken: validTokenStop3 });
      throw new Error('Scenario 5 Failed: Future stop token was accepted out-of-order!');
    } catch (err) {
      if (err.status !== 400 || !err.message.includes('Cannot skip stops')) throw err;
      console.log(`✅ SCENARIO 5 PASSED: Out-of-order future stop token rejected: "${err.message}"`);
    }

    // ── SCENARIO 6: VALID STOP VERIFICATION WITH SECURE TOKEN ─────
    console.log('\n[SCENARIO 6] Verifying Stop 2 (Salem) with Valid Cryptographic Token...');
    const stop2Result = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      secureToken: validTokenStop2,
      verificationMethod: 'SECURE_QR',
      idempotencyKey: 'IDEM-SEC-SLM',
      performedBy: 'gate-scanner'
    });

    if (stop2Result.verifiedStop.locationName !== 'Salem') {
      throw new Error('Scenario 6 Failed: Verified stop mismatch');
    }
    if (stop2Result.packagesToUnload.length !== 1 || stop2Result.packagesToLoad.length !== 1) {
      throw new Error('Scenario 6 Failed: Unload/Load count incorrect');
    }
    if (stop2Result.verificationMethod !== 'SECURE_QR') {
      throw new Error('Scenario 6 Failed: Verification method not SECURE_QR');
    }
    if (!stop2Result.reoptimizationRecommended) {
      console.log('Note: Re-optimization evaluated based on freed headroom');
    }
    console.log('✅ SCENARIO 6 PASSED: Stop 2 verified with SECURE_QR. Capacity before: ' +
      `${stop2Result.capacityBefore.usedVolume}m³ -> Capacity after: ${stop2Result.capacityAfter.usedVolume}m³.`);

    // ── SCENARIO 7: TOKEN REUSE / REPLAY ATTACK ───────────────────
    console.log('\n[SCENARIO 7] Testing Token Reuse / Replay Attack (Re-submitting Stop 2 token)...');
    try {
      await executeStopLifecycleOperational({
        tripId,
        vehicleId,
        secureToken: validTokenStop2,
        idempotencyKey: 'NEW-DIFFERENT-KEY-REPLAY'
      });
      throw new Error('Scenario 7 Failed: Reused token was accepted!');
    } catch (err) {
      if (err.status !== 400 || (!err.message.includes('already been used') && !err.message.includes('already been verified'))) throw err;
      console.log(`✅ SCENARIO 7 PASSED: Token reuse / replay attack strictly blocked: "${err.message}"`);
    }

    // ── SCENARIO 8: IDEMPOTENCY KEY REPLAY ────────────────────────
    console.log('\n[SCENARIO 8] Testing Idempotency Key Replay on Stop 2...');
    const idemReplay = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      secureToken: validTokenStop2,
      idempotencyKey: 'IDEM-SEC-SLM'
    });
    if (!idemReplay.isIdempotentReplay) {
      throw new Error('Scenario 8 Failed: Idempotent replay was not recognized');
    }
    console.log('✅ SCENARIO 8 PASSED: Idempotency replay recognized; returned cached state safely.');

    // ── SCENARIO 9: COMPLETE REST OF TRIP WITH SECURE TOKENS ──────
    console.log('\n[SCENARIO 9] Completing Stop 3 (Coimbatore) and Final Stop 4 (Madurai) with Secure Tokens...');
    const stop3Res = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      secureToken: validTokenStop3,
      verificationMethod: 'SECURE_QR',
      idempotencyKey: 'IDEM-SEC-CBE',
      performedBy: 'gate-scanner'
    });
    if (stop3Res.verifiedStop.locationName !== 'Coimbatore') throw new Error('Stop 3 verification failed');
    console.log('✅ Stop 3 (Coimbatore) verified successfully with SECURE_QR token.');

    const stop4Res = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      secureToken: validTokenStop4,
      verificationMethod: 'SECURE_QR',
      idempotencyKey: 'IDEM-SEC-MDU',
      performedBy: 'gate-scanner'
    });
    if (!stop4Res.isFinalStop || stop4Res.trip.status !== 'COMPLETED') {
      throw new Error('Final stop failed to complete trip');
    }
    console.log('✅ Final Stop 4 (Madurai) verified and completed! Trip state: COMPLETED.');

    // ── SCENARIO 10: AUDIT VERIFICATION RECORD CHECK ──────────────
    console.log('\n[SCENARIO 10] Verifying Audit Trails and Verification Methods...');
    const verifications = await StopVerification.find({ tripId });
    if (verifications.length !== 3) {
      throw new Error(`Scenario 10 Failed: Expected 3 StopVerification audit records, got ${verifications.length}`);
    }
    for (const v of verifications) {
      if (v.verificationMethod !== 'SECURE_QR') {
        throw new Error(`Scenario 10 Failed: Expected verificationMethod SECURE_QR, got ${v.verificationMethod}`);
      }
    }
    console.log(`✅ SCENARIO 10 PASSED: All ${verifications.length} stop operations recorded with method 'SECURE_QR' and timestamps.`);

    // Cleanup
    await Trip.deleteMany({ vehicleId });
    await TripStop.deleteMany({});
    await Vehicle.deleteMany({ vehicleId });
    await Route.deleteMany({ routeId: { $in: [routeId, otherRouteId] } });
    await Shipment.deleteMany({ shipperId: shipperUsername });
    await Booking.deleteMany({ shipperId: shipperUsername });
    await LoadPlan.deleteMany({ vehicleId });
    await LoadAssignment.deleteMany({});
    await LoadOperation.deleteMany({});
    await StopVerification.deleteMany({ vehicleId });
    await Payment.deleteMany({});
    await User.deleteMany({ username: { $in: [shipperUsername, 'manager-sec'] } });

    console.log('\n===============================================================');
    console.log('🎉 ALL 10 SECURE STOP VERIFICATION & SECURITY TESTS PASSED (100%)');
    console.log('===============================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Secure Stop Verification Test Suite Failed:', error);
    process.exit(1);
  }
};

runSecureStopVerificationTestSuite();
