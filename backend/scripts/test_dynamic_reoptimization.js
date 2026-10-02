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
import {
  computeDynamicReoptimization,
  applyDynamicReoptimization
} from '../services/dynamicReoptimizationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const runDynamicReoptimizationTestSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics';
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('STARTING DYNAMIC RE-OPTIMIZATION FIRST-CLASS DOMAIN TEST SUITE');
    console.log('===============================================================');

    const routeId = 'RTE-REOPT-4STOP';
    const vehicleId = 'TRK-REOPT-1';
    const shipperUsername = 'shipper-reopt';

    // Cleanup
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
    await User.deleteMany({ username: { $in: [shipperUsername, 'manager-reopt'] } });

    const managerUser = await User.create({
      username: 'manager-reopt',
      email: 'mgr@reopt.ai',
      password: 'password123',
      role: 'logistics_manager',
      name: 'Dynamic Reopt Manager'
    });

    const shipperUser = await User.create({
      username: shipperUsername,
      email: 'shipper@reopt.ai',
      password: 'password123',
      role: 'customer',
      name: 'Dynamic Reopt Shipper'
    });

    // 4-Stop Route: A (Chennai) -> B (Salem) -> C (Coimbatore) -> D (Madurai)
    const route = await Route.create({
      routeId,
      source: 'Chennai',
      destination: 'Madurai',
      distance: 480,
      baseRate: 200,
      stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai'],
      stopsDetails: [
        { stopId: 'STP-A', locationName: 'Chennai', sequenceNumber: 1, qrToken: 'QR-A-1', status: 'Ready' },
        { stopId: 'STP-B', locationName: 'Salem', sequenceNumber: 2, qrToken: 'QR-B-2', status: 'Upcoming' },
        { stopId: 'STP-C', locationName: 'Coimbatore', sequenceNumber: 3, qrToken: 'QR-C-3', status: 'Upcoming' },
        { stopId: 'STP-D', locationName: 'Madurai', sequenceNumber: 4, qrToken: 'QR-D-4', status: 'Upcoming' }
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

    const tripId = `TRIP-REOPT-${Date.now()}`;
    const trip = await Trip.create({
      tripId,
      vehicle: vehicle._id,
      vehicleId,
      route: route._id,
      routeId,
      carrierId: 'carrier-fastlane',
      driverId: 'driver-mohan',
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

    // 1. Initial Plan v1 with:
    // SHP-1: A -> B (30 m³, 4000 kg)
    // SHP-2: A -> D (40 m³, 8000 kg)
    // SHP-3: B -> D (30 m³, 5000 kg)
    const initialShipments = [
      { id: 'SHP-1', pickup: 'Chennai', delivery: 'Salem', vol: 30, wt: 4000 },
      { id: 'SHP-2', pickup: 'Chennai', delivery: 'Madurai', vol: 40, wt: 8000 },
      { id: 'SHP-3', pickup: 'Salem', delivery: 'Madurai', vol: 30, wt: 5000 }
    ];

    for (const b of initialShipments) {
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
        transactionId: `TXN-REOPT-${b.id}`
      });
    }

    const planV1 = await LoadPlan.create({
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
      objectiveScore: 85,
      overallUtilization: { volume: 70, weight: 65 }
    });

    for (let i = 0; i < initialShipments.length; i++) {
      const s = initialShipments[i];
      await LoadAssignment.create({
        loadPlan: planV1._id,
        loadPlanId: planV1.loadPlanId,
        shipmentId: s.id,
        bookingId: `BKG-${s.id}`,
        customer: shipperUsername,
        priority: 'STANDARD',
        segmentRange: { fromStop: s.pickup, toStop: s.delivery, fromIndex: i, toIndex: i + 1 },
        loadingSequence: i + 1,
        unloadingSequence: 3 - i,
        dimensions: { length: 2.0, width: 1.2, height: 1.5 },
        volume: s.vol,
        weight: s.wt,
        position: { x: i * 2, y: 0, z: 0 },
        status: 'ASSIGNED'
      });
    }

    // ── STEP 1: DISPATCH FROM ORIGIN (A / CHENNAI) ───────────────
    console.log('\n[STEP 1] Dispatching trip from Stop A (Chennai)...');
    const dispatchRes = await dispatchTripOperational({ tripId, performedBy: 'manager-reopt' });
    if (dispatchRes.trip.status !== 'IN_TRANSIT') throw new Error('Dispatch failed');
    console.log('✅ STEP 1 PASSED: Dispatched from Chennai. Loaded SHP-1 (30m³) & SHP-2 (40m³). Total on trailer = 70m³.');

    // ── STEP 2: ARRIVE & VERIFY STOP B (SALEM) ───────────────────
    console.log('\n[STEP 2] Arriving and processing Stop B (Salem)...');
    const stopBRes = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      stopId: 'STP-B',
      qrToken: 'QR-B-2',
      idempotencyKey: 'IDEM-REOPT-STOP-B',
      performedBy: 'driver-mohan'
    });

    if (stopBRes.unloadedCount !== 1 || stopBRes.loadedCount !== 1) {
      throw new Error('Stop B did not unload SHP-1 and load SHP-3');
    }
    console.log('✅ STEP 2 PASSED: At Salem: SHP-1 delivered (30m³ freed). SHP-3 loaded (30m³).');
    console.log(`Trailer state: SHP-2 (40m³) + SHP-3 (30m³) = 70m³ used, 30m³ available.`);

    // ── STEP 3: SUBMIT NEW OPPORTUNITY SHIPMENT (C -> D) ─────────
    console.log('\n[STEP 3] Shipper creates new opportunity shipment SHP-NEW-CD (Coimbatore -> Madurai, 20m³, 2500kg)...');
    const newShipment = await Shipment.create({
      shipmentId: 'SHP-NEW-CD',
      customer: shipperUser._id,
      shipperId: shipperUsername,
      cargoDescription: 'Newly available industrial parts',
      packageCount: 1,
      volume: 20,
      weight: 2500,
      priority: 'EXPRESS',
      pickupStop: 'Coimbatore',
      deliveryStop: 'Madurai',
      requestedDate: new Date(),
      status: 'PENDING'
    });

    const newBkg = await Booking.create({
      bookingId: 'BKG-SHP-NEW-CD',
      shipmentId: 'SHP-NEW-CD',
      customer: shipperUser._id,
      shipper: shipperUser._id,
      shipperId: shipperUsername,
      routeId,
      fromStop: 'Coimbatore',
      toStop: 'Madurai',
      volume: 20,
      weight: 2500,
      revenue: 4500,
      price: 4500,
      date: new Date(),
      status: 'PENDING'
    });
    console.log('✅ STEP 3 PASSED: SHP-NEW-CD registered in PENDING status.');

    // ── STEP 4: PREVIEW DYNAMIC RE-OPTIMIZATION (0 DB MUTATIONS) ───
    console.log('\n[STEP 4] Running in-memory Dynamic Re-Optimization Preview at Stop B (Salem)...');
    const previewResult = await computeDynamicReoptimization({
      tripId,
      additionalCandidateShipmentIds: ['SHP-NEW-CD'],
      reason: 'Freed capacity allocated to downstream leg Coimbatore -> Madurai'
    });

    if (!previewResult.comparison || previewResult.comparison.diff.newlyAssignedCount !== 1) {
      throw new Error('Step 4 Failed: Re-optimization failed to assign SHP-NEW-CD');
    }

    const { comparison } = previewResult;
    console.log('\n--- BEFORE VS AFTER RE-OPTIMIZATION COMPARISON ---');
    console.log(`Current Stop: ${comparison.currentStop} (Stop #${comparison.currentStopIndex + 1})`);
    console.log(`Immutable Delivered History: ${comparison.immutableDeliveredCount} shipment(s) preserved.`);
    console.log(`Locked on Trailer: ${comparison.lockedLoadedCount} shipment(s) preserved.`);
    console.log(`Plan Version Transition: v${comparison.previousPlanVersion} ➔ v${comparison.proposedPlanVersion}`);
    console.log(`Previous Remaining Free Headroom: ${comparison.metricsBefore.freeVolume} m³`);
    console.log(`Newly Assigned Shipments: ${comparison.diff.newlyAssigned.map(s => `${s.shipmentId} (${s.pickup}➔${s.delivery}, ${s.volume}m³)`).join(', ')}`);
    console.log(`Proposed Peak Fill: ${comparison.metricsAfter.peakVolumeUtilization}% Vol, ${comparison.metricsAfter.peakWeightUtilization}% Wt`);
    console.log(`Summary: "${comparison.summaryText}"`);
    console.log('--------------------------------------------------');

    // Confirm 0 DB mutations occurred during preview
    const plansCountBefore = await LoadPlan.countDocuments({ tripId });
    if (plansCountBefore !== 1) {
      throw new Error('Step 4 Failed: Preview mutated database state!');
    }
    console.log('✅ STEP 4 PASSED: Dynamic re-optimization computed with 0 DB mutations.');

    // ── STEP 5: APPLY DYNAMIC RE-OPTIMIZATION & VERSIONING ────────
    console.log('\n[STEP 5] Applying Dynamic Re-Optimization as LoadPlan v2...');
    const applyResult = await applyDynamicReoptimization({
      tripId,
      additionalCandidateShipmentIds: ['SHP-NEW-CD'],
      autoApprove: true,
      reason: 'Downstream capacity optimization after Salem unloads',
      performedBy: 'manager-reopt'
    });

    if (!applyResult.success || applyResult.loadPlan.version !== 2 || applyResult.loadPlan.status !== 'ACTIVE') {
      throw new Error('Step 5 Failed: LoadPlan v2 was not created as ACTIVE');
    }

    // Verify old plan v1 is now SUPERSEDED
    const oldPlan = await LoadPlan.findOne({ loadPlanId: `LP-${tripId}-v1` });
    if (oldPlan.status !== 'SUPERSEDED') {
      throw new Error('Step 5 Failed: Plan v1 should be SUPERSEDED');
    }

    // Verify newly assigned shipment is now ALLOCATED
    const newShipmentAfter = await Shipment.findOne({ shipmentId: 'SHP-NEW-CD' });
    const newBkgAfter = await Booking.findOne({ bookingId: 'BKG-SHP-NEW-CD' });
    if (newShipmentAfter.status !== 'ALLOCATED' || newBkgAfter.status !== 'ALLOCATED') {
      throw new Error('Step 5 Failed: SHP-NEW-CD was not updated to ALLOCATED');
    }
    console.log('✅ STEP 5 PASSED: LoadPlan v2 persisted & ACTIVE! Plan v1 safely SUPERSEDED in audit history.');

    // ── STEP 6: CONTINUE TRIP THROUGH STOP C (COIMBATORE) ─────────
    console.log('\n[STEP 6] Proceeding to Stop C (Coimbatore) to pick up newly assigned SHP-NEW-CD...');
    const stopCRes = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      stopId: 'STP-C',
      qrToken: 'QR-C-3',
      idempotencyKey: 'IDEM-REOPT-STOP-C',
      performedBy: 'driver-mohan'
    });

    if (stopCRes.loadedCount !== 1 || stopCRes.packagesToLoad[0].shipmentId !== 'SHP-NEW-CD') {
      throw new Error('Step 6 Failed: SHP-NEW-CD was not loaded at Stop C');
    }
    console.log('✅ STEP 6 PASSED: At Coimbatore: SHP-NEW-CD successfully picked up and loaded IN_TRANSIT.');

    // ── STEP 7: FINAL STOP D (MADURAI) & COMPLETE TRIP ───────────
    console.log('\n[STEP 7] Proceeding to Final Stop D (Madurai)...');
    const stopDRes = await executeStopLifecycleOperational({
      tripId,
      vehicleId,
      stopId: 'STP-D',
      qrToken: 'QR-D-4',
      idempotencyKey: 'IDEM-REOPT-STOP-D',
      performedBy: 'driver-mohan'
    });

    if (!stopDRes.isFinalStop || stopDRes.unloadedCount !== 3) {
      throw new Error(`Step 7 Failed: Expected 3 packages unloaded at Madurai (SHP-2, SHP-3, SHP-NEW-CD), got ${stopDRes.unloadedCount}`);
    }

    const finalTripDoc = await Trip.findOne({ tripId });
    if (finalTripDoc.status !== 'COMPLETED') {
      throw new Error('Step 7 Failed: Trip status is not COMPLETED');
    }
    console.log('✅ STEP 7 PASSED: Final stop completed. Delivered all 3 remaining cargo items. Trip COMPLETED.');

    // Cleanup
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
    await User.deleteMany({ username: { $in: [shipperUsername, 'manager-reopt'] } });

    console.log('\n===============================================================');
    console.log('🎉 ALL DYNAMIC RE-OPTIMIZATION DOMAIN TESTS PASSED (100%)');
    console.log('===============================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Dynamic Re-Optimization Test Suite Failed:', error);
    process.exit(1);
  }
};

runDynamicReoptimizationTestSuite();
