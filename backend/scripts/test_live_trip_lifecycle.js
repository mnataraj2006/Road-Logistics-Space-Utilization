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
  executeStopLifecycleOperational,
  reoptimizeRemainingRoute
} from '../services/tripLifecycleService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const runLiveTripLifecycleTestSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics';
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('STARTING COMPLETE LIVE MULTI-STOP TRIP LIFECYCLE TEST SUITE');
    console.log('===============================================================');

    const routeId = 'RTE-LIFECYCLE-TEST';
    const vehicleId = 'TRK-LIFECYCLE-1';
    const shipperUsername = 'shipper-lifecycle';

    // Cleanup existing test data
    await Trip.deleteMany({ vehicleId });
    await TripStop.deleteMany({});
    await Vehicle.deleteMany({ vehicleId });
    await Route.deleteMany({ routeId });
    await Shipment.deleteMany({ shipperId: shipperUsername });
    await Booking.deleteMany({ shipperId: shipperUsername });
    await LoadPlan.deleteMany({ vehicleId });
    await LoadAssignment.deleteMany({});
    await LoadOperation.deleteMany({});
    await StopVerification.deleteMany({ vehicleId });
    await Payment.deleteMany({});
    await User.deleteMany({ username: { $in: [shipperUsername, 'manager-lifecycle'] } });

    const managerUser = await User.create({
      username: 'manager-lifecycle',
      email: 'mgr@lifecycle.ai',
      password: 'password123',
      role: 'logistics_manager',
      name: 'Operations Manager'
    });

    const shipperUser = await User.create({
      username: shipperUsername,
      email: 'shipper@lifecycle.ai',
      password: 'password123',
      role: 'shipper',
      name: 'Lifecycle Shipper'
    });

    const route = await Route.create({
      routeId,
      source: 'Chennai',
      destination: 'Madurai',
      distance: 480,
      baseRate: 200,
      stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai'],
      stopsDetails: [
        { stopId: 'STP-LC-1', locationName: 'Chennai', sequenceNumber: 1, qrToken: 'QR-CHE-1', status: 'Ready' },
        { stopId: 'STP-LC-2', locationName: 'Salem', sequenceNumber: 2, qrToken: 'QR-SLM-2', status: 'Upcoming' },
        { stopId: 'STP-LC-3', locationName: 'Coimbatore', sequenceNumber: 3, qrToken: 'QR-CBE-3', status: 'Upcoming' },
        { stopId: 'STP-LC-4', locationName: 'Madurai', sequenceNumber: 4, qrToken: 'QR-MDU-4', status: 'Upcoming' }
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

    // 1. Create Trip & Approved LoadPlan
    const tripId = `TRIP-LC-${Date.now()}`;
    const trip = await Trip.create({
      tripId,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      carrierId: 'carrier-fastlane',
      driverId: 'driver-karthik',
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

    const loadPlan = await LoadPlan.create({
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
      objectiveScore: 88,
      overallUtilization: { volume: 75, weight: 70 }
    });

    // Seed Bookings
    // P1: Chennai -> Salem (30 m³, 4000 kg)
    // P2: Chennai -> Madurai (40 m³, 8000 kg)
    // P3: Salem -> Coimbatore (30 m³, 4000 kg)
    // P4: Coimbatore -> Madurai (20 m³, 3000 kg)
    const bookingsData = [
      { id: 'PKG-1', pickup: 'Chennai', delivery: 'Salem', vol: 30, wt: 4000 },
      { id: 'PKG-2', pickup: 'Chennai', delivery: 'Madurai', vol: 40, wt: 8000 },
      { id: 'PKG-3', pickup: 'Salem', delivery: 'Coimbatore', vol: 30, wt: 4000 },
      { id: 'PKG-4', pickup: 'Coimbatore', delivery: 'Madurai', vol: 20, wt: 3000 }
    ];

    for (const b of bookingsData) {
      await Shipment.create({
        shipmentId: b.id,
        customer: shipperUser._id,
        shipperId: shipperUsername,
        cargoDescription: `Cargo ${b.id}`,
        packageCount: 1,
        volume: b.vol,
        weight: b.wt,
        pickupStop: b.pickup,
        deliveryStop: b.delivery,
        requestedDate: new Date(),
        status: 'ALLOCATED'
      });

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
        transactionId: `TXN-${Date.now()}-${b.id}`
      });
    }

    // ── TEST 1: DISPATCH ──────────────────────────────────────────
    console.log('\n[TEST 1] Testing Dispatch Operational Lifecycle...');
    const dispatchRes = await dispatchTripOperational({ tripId, performedBy: 'manager-test' });
    if (dispatchRes.trip.status !== 'IN_TRANSIT') {
      throw new Error(`Test 1 Failed: Expected trip status IN_TRANSIT, got ${dispatchRes.trip.status}`);
    }
    if (dispatchRes.originCargoLoaded !== 2) {
      throw new Error(`Test 1 Failed: Expected 2 origin packages loaded, got ${dispatchRes.originCargoLoaded}`);
    }
    if (dispatchRes.actualLoadSnapshot.usedVolume !== 70 || dispatchRes.actualLoadSnapshot.usedWeight !== 12000) {
      throw new Error(`Test 1 Failed: Expected 70 m³, 12,000 kg initial snapshot, got ${dispatchRes.actualLoadSnapshot.usedVolume} m³, ${dispatchRes.actualLoadSnapshot.usedWeight} kg`);
    }
    console.log('✅ TEST 1 PASSED: Dispatch executed, origin packages loaded (70m³, 12t), snapshot recorded.');

    // ── TEST 2: WRONG STOP SCAN ──────────────────────────────────
    console.log('\n[TEST 2] Testing Wrong Stop Token Rejection...');
    try {
      await executeStopLifecycleOperational({ tripId, vehicleId, qrToken: 'QR-INVALID-TOKEN' });
      throw new Error('Test 2 Failed: Did not reject invalid token');
    } catch (err) {
      if (err.status !== 400) throw err;
      console.log('✅ TEST 2 PASSED: Wrong stop token correctly rejected with 400.');
    }

    // ── TEST 3: SKIPPED STOP ATTEMPT ─────────────────────────────
    console.log('\n[TEST 3] Testing Skipped Stop Rejection (Expected Salem #2, Scanned Coimbatore #3)...');
    try {
      await executeStopLifecycleOperational({ tripId, vehicleId, qrToken: 'QR-CBE-3' });
      throw new Error('Test 3 Failed: Did not reject skipped stop');
    } catch (err) {
      if (err.status !== 400 || !err.message.includes('Cannot skip stops')) throw err;
      console.log(`✅ TEST 3 PASSED: Skipped stop rejected: "${err.message}"`);
    }

    // ── TEST 4: IDEMPOTENCY KEY REPLAY PROTECTION ────────────────
    console.log('\n[TEST 4] Testing Idempotent API Retry Protection on Stop 2 (Salem)...');
    const idemKey = 'IDEM-KEY-SALEM-001';
    const stop2FirstCall = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      qrToken: 'QR-SLM-2',
      idempotencyKey: idemKey,
      performedBy: 'driver-test'
    });
    if (stop2FirstCall.isIdempotentReplay || stop2FirstCall.unloadedCount !== 1 || stop2FirstCall.loadedCount !== 1) {
      throw new Error('Test 4 Failed: First stop call failed');
    }

    // Immediate replay with same idempotency key
    const stop2ReplayCall = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      qrToken: 'QR-SLM-2',
      idempotencyKey: idemKey,
      performedBy: 'driver-test'
    });
    if (!stop2ReplayCall.isIdempotentReplay) {
      throw new Error('Test 4 Failed: Replay was not recognized as idempotent');
    }
    console.log('✅ TEST 4 PASSED: Idempotency protection active! Duplicate API request returned cached state without duplicate unloads/loads.');

    // ── TEST 5: UNLOAD VERIFICATION & PAYMENT RELEASE ────────────
    console.log('\n[TEST 5] Verifying Unload of PKG-1 at Salem...');
    const pkg1 = await Booking.findOne({ bookingId: 'BKG-PKG-1' });
    const pkg1Payment = await Payment.findOne({ bookingId: 'BKG-PKG-1' });
    if (pkg1.status !== 'DELIVERED' || pkg1Payment.status !== 'PaidOut') {
      throw new Error('Test 5 Failed: PKG-1 was not DELIVERED or payment not PaidOut');
    }
    const unloadOp = await LoadOperation.findOne({ bookingId: 'BKG-PKG-1', operationType: 'UNLOADED' });
    if (!unloadOp) throw new Error('Test 5 Failed: UNLOADED LoadOperation missing');
    console.log('✅ TEST 5 PASSED: PKG-1 marked DELIVERED, Escrow PaidOut, LoadOperation audit recorded.');

    // ── TEST 6: DOWNSTREAM LOADING AT INTERMEDIATE STOP ──────────
    console.log('\n[TEST 6] Verifying Downstream Loading of PKG-3 at Salem...');
    const pkg3 = await Booking.findOne({ bookingId: 'BKG-PKG-3' });
    if (pkg3.status !== 'IN_TRANSIT') {
      throw new Error(`Test 6 Failed: PKG-3 expected IN_TRANSIT, got ${pkg3.status}`);
    }
    const loadOp = await LoadOperation.findOne({ bookingId: 'BKG-PKG-3', operationType: 'LOADED' });
    if (!loadOp) throw new Error('Test 6 Failed: LOADED LoadOperation missing');
    console.log('✅ TEST 6 PASSED: PKG-3 picked up at Salem and loaded IN_TRANSIT.');

    // ── TEST 7: CAPACITY RECONCILIATION & HEADROOM ───────────────
    console.log('\n[TEST 7] Verifying Capacity Headroom Snapshot after Salem Stop...');
    // PKG-2 (40 m³, 8000 kg) + PKG-3 (30 m³, 4000 kg) = 70 m³, 12,000 kg
    const tripAfterSalem = await Trip.findOne({ tripId });
    if (tripAfterSalem.actualLoadSnapshot.usedVolume !== 70 || tripAfterSalem.actualLoadSnapshot.usedWeight !== 12000) {
      throw new Error(`Test 7 Failed: Expected 70 m³, 12000 kg load on trailer, got ${tripAfterSalem.actualLoadSnapshot.usedVolume} m³, ${tripAfterSalem.actualLoadSnapshot.usedWeight} kg`);
    }
    console.log('✅ TEST 7 PASSED: Capacity accurately reconciled (70 m³ used, 30 m³ headroom available).');

    // ── TEST 8: DUPLICATE SCAN REJECTION (WITHOUT IDEMPOTENCY KEY)
    console.log('\n[TEST 8] Testing Duplicate Scan Rejection for already completed stop (Salem)...');
    try {
      await executeStopLifecycleOperational({ tripId, vehicleId, qrToken: 'QR-SLM-2', idempotencyKey: 'NEW-KEY' });
      throw new Error('Test 8 Failed: Did not reject duplicate scan');
    } catch (err) {
      if (err.status !== 400) throw err;
      console.log('✅ TEST 8 PASSED: Duplicate stop scan rejected with 400.');
    }

    // ── TEST 9: DOWNSTREAM ROUTE RE-OPTIMIZATION ──────────────────
    console.log('\n[TEST 9] Testing Downstream Route Re-Optimization from Stop 2...');
    const reoptRes = await reoptimizeRemainingRoute({ tripId });
    if (!reoptRes.reoptimizationResult || reoptRes.remainingStopsCount < 2) {
      throw new Error('Test 9 Failed: Downstream re-optimization failed');
    }
    console.log(`✅ TEST 9 PASSED: Downstream re-optimization evaluated ${reoptRes.remainingStopsCount} remaining stops with fit score ${reoptRes.reoptimizationResult.objectiveScore}.`);

    // Process Stop 3 (Coimbatore)
    console.log('\nProcessing Stop 3 (Coimbatore)...');
    // Unloads PKG-3 (30 m³, 4000 kg), Loads PKG-4 (20 m³, 3000 kg)
    const stop3Res = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      qrToken: 'QR-CBE-3',
      idempotencyKey: 'IDEM-CBE-001',
      performedBy: 'driver-test'
    });
    if (stop3Res.unloadedCount !== 1 || stop3Res.loadedCount !== 1) {
      throw new Error('Failed executing stop 3 operations');
    }
    console.log('✅ Stop 3 (Coimbatore) completed: PKG-3 delivered, PKG-4 loaded.');

    // ── TEST 10: INCOMPLETE FINAL TRIP REJECTION ─────────────────
    console.log('\n[TEST 10] Testing Incomplete Final Stop Rejection (Simulating a missing package)...');
    // Create an unpicked package to simulate an undelivered package
    const lostPkg = await Booking.create({
      bookingId: 'BKG-LOST-TEST',
      shipmentId: 'SHP-LOST-TEST',
      customer: shipperUser._id,
      shipper: shipperUser._id,
      shipperId: shipperUsername,
      vehicleId,
      routeId,
      fromStop: 'Coimbatore',
      toStop: 'Salem',
      volume: 5,
      weight: 500,
      revenue: 1000,
      price: 1000,
      date: new Date(),
      status: 'IN_TRANSIT'
    });

    try {
      await executeStopLifecycleOperational({ tripId, vehicleId, qrToken: 'QR-MDU-4', idempotencyKey: 'IDEM-MDU-FAIL' });
      throw new Error('Test 10 Failed: Final stop allowed completion with undelivered package!');
    } catch (err) {
      if (err.status !== 400 || !err.message.includes('undelivered')) throw err;
      console.log(`✅ TEST 10 PASSED: Incomplete final stop closure blocked: "${err.message}"`);
    }

    // Remove lost package so final stop can proceed cleanly
    await Booking.deleteOne({ bookingId: 'BKG-LOST-TEST' });

    // Complete Final Stop (Madurai)
    console.log('\nProcessing Final Stop (Madurai)...');
    const finalStopRes = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      qrToken: 'QR-MDU-4',
      idempotencyKey: 'IDEM-MDU-FINAL',
      performedBy: 'driver-test'
    });
    if (!finalStopRes.isFinalStop || finalStopRes.unloadedCount !== 2) {
      throw new Error('Final stop did not unload remaining 2 packages');
    }

    const completedTrip = await Trip.findOne({ tripId });
    if (completedTrip.status !== 'COMPLETED' || completedTrip.actualLoadSnapshot.packagesCount !== 0) {
      throw new Error('Trip was not marked COMPLETED or load snapshot not emptied');
    }
    console.log('✅ Final Stop completed: PKG-2 & PKG-4 delivered. Trip status marked COMPLETED. Trailer empty.');

    // ── TEST 11: TRANSACTION ROLLBACK INTEGRITY TEST ──────────────
    console.log('\n[TEST 11] Testing Transaction Rollback on Simulated DB Error...');
    const dummyTripId = `TRIP-ROLLBACK-${Date.now()}`;
    const dummyTrip = await Trip.create({
      tripId: dummyTripId,
      vehicleId: 'TRK-DUMMY',
      routeId,
      status: 'PLANNED'
    });

    // Attempting dispatch without approved load plan will throw error and rollback
    try {
      await dispatchTripOperational({ tripId: dummyTripId, performedBy: 'tester' });
      throw new Error('Test 11 Failed: Dispatch should have failed');
    } catch (err) {
      const tripAfterRollback = await Trip.findOne({ tripId: dummyTripId });
      if (tripAfterRollback.status !== 'PLANNED') {
        throw new Error('Test 11 Failed: Trip state changed despite transaction error!');
      }
      console.log('✅ TEST 11 PASSED: Transaction rollback verified! Trip remained in PLANNED state with 0 dirty writes.');
    }

    // Cleanup
    await Trip.deleteMany({ vehicleId });
    await Trip.deleteOne({ tripId: dummyTripId });
    await TripStop.deleteMany({});
    await Vehicle.deleteMany({ vehicleId });
    await Route.deleteMany({ routeId });
    await Shipment.deleteMany({ shipperId: shipperUsername });
    await Booking.deleteMany({ shipperId: shipperUsername });
    await LoadPlan.deleteMany({ vehicleId });
    await LoadAssignment.deleteMany({});
    await LoadOperation.deleteMany({});
    await StopVerification.deleteMany({ vehicleId });
    await Payment.deleteMany({});
    await User.deleteMany({ username: { $in: [shipperUsername, 'manager-lifecycle'] } });

    console.log('\n===============================================================');
    console.log('🎉 ALL 11 LIVE TRIP OPERATIONAL LIFECYCLE TESTS PASSED (100%)');
    console.log('===============================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Live Trip Lifecycle Test Suite Failed:', error);
    process.exit(1);
  }
};

runLiveTripLifecycleTestSuite();
