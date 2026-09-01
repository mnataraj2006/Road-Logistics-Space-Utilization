import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import AuditEvent from '../models/AuditEvent.js';
import {
  recordAuditEvent,
  getShipmentLifecycleTrace,
  getUnallocatedCargoExplanations,
  queryAuditLedger
} from '../services/auditService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const runAuditTraceabilityTestSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics';
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('STARTING OPERATIONAL AUDIT & TRACEABILITY TEST SUITE');
    console.log('===============================================================');

    const testShipmentId = `BKG-AUDIT-${Date.now()}`;
    const testTripId = `TRIP-AUDIT-${Date.now()}`;

    // ── TEST 1: APPEND-ONLY IMMUTABILITY ENFORCEMENT ─────────────
    console.log('\n[TEST 1] Testing Append-Only Immutability Guard...');
    const testDoc = await recordAuditEvent({
      eventType: 'SHIPMENT_CREATED',
      entityType: 'Shipment',
      entityId: testShipmentId,
      actor: 'customer_tester',
      previousState: 'NONE',
      resultingState: 'DRAFT',
      metadata: { pickup: 'Chennai', delivery: 'Madurai', volume: 15, weight: 3000 }
    });

    if (!testDoc || !testDoc.eventId) {
      throw new Error('Test 1 Failed: Audit event could not be recorded');
    }

    // Try mutating the audit event (should be blocked by pre-hook)
    let mutationBlocked = false;
    try {
      await AuditEvent.updateOne({ eventId: testDoc.eventId }, { resultingState: 'CORRUPTED' });
    } catch (err) {
      mutationBlocked = true;
    }

    if (!mutationBlocked) {
      throw new Error('Test 1 Failed: AuditEvent allowed update mutation! Immutability violated.');
    }
    console.log('✅ TEST 1 PASSED: Append-only invariant enforced. Mutation strictly rejected.');

    // ── TEST 2: RECORDING MULTI-STEP OPERATIONAL LIFECYCLE ─────────
    console.log('\n[TEST 2] Recording Complete Multi-Step Operational Event Lifecycle...');
    
    // 1. Booking Created
    await recordAuditEvent({
      eventType: 'BOOKING_CREATED',
      entityType: 'Booking',
      entityId: testShipmentId,
      tripId: testTripId,
      actor: 'customer_tester',
      previousState: 'DRAFT',
      resultingState: 'ALLOCATED',
      metadata: { price: 3500 }
    });

    // 2. Load Plan Approved
    await recordAuditEvent({
      eventType: 'LOAD_PLAN_APPROVED',
      entityType: 'LoadPlan',
      entityId: `LP-${testTripId}-v1`,
      tripId: testTripId,
      actor: 'manager_alice',
      previousState: 'GENERATED',
      resultingState: 'APPROVED',
      metadata: { version: 1, assignedShipmentIds: [testShipmentId] }
    });

    // 3. Trip Dispatched
    await recordAuditEvent({
      eventType: 'TRIP_DISPATCHED',
      entityType: 'Trip',
      entityId: testTripId,
      tripId: testTripId,
      actor: 'manager_alice',
      previousState: 'READY_FOR_DISPATCH',
      resultingState: 'DISPATCHED',
      metadata: { vehicleId: 'TRK-FASTLANE-08' }
    });

    // 4. Package Loaded
    await recordAuditEvent({
      eventType: 'PACKAGE_LOADED',
      entityType: 'Shipment',
      entityId: testShipmentId,
      tripId: testTripId,
      actor: 'driver_bob',
      previousState: 'ALLOCATED',
      resultingState: 'IN_TRANSIT',
      metadata: { pickupStop: 'Chennai' }
    });

    // 5. Stop Arrival Verified
    await recordAuditEvent({
      eventType: 'STOP_ARRIVAL_VERIFIED',
      entityType: 'Stop',
      entityId: 'STP-SALEM-02',
      tripId: testTripId,
      actor: 'driver_bob',
      previousState: 'IN_TRANSIT',
      resultingState: 'VERIFIED',
      metadata: { location: 'Salem', verificationMethod: 'HMAC_SECURE_QR' }
    });

    // 6. Package Unloaded & Delivered
    await recordAuditEvent({
      eventType: 'PACKAGE_UNLOADED',
      entityType: 'Shipment',
      entityId: testShipmentId,
      tripId: testTripId,
      actor: 'driver_bob',
      previousState: 'IN_TRANSIT',
      resultingState: 'DELIVERED',
      metadata: { deliveryStop: 'Madurai' }
    });

    await recordAuditEvent({
      eventType: 'SHIPMENT_DELIVERED',
      entityType: 'Shipment',
      entityId: testShipmentId,
      tripId: testTripId,
      actor: 'driver_bob',
      previousState: 'IN_TRANSIT',
      resultingState: 'DELIVERED',
      metadata: { destination: 'Madurai' }
    });

    console.log('✅ TEST 2 PASSED: 7 sequential operational lifecycle events appended.');

    // ── TEST 3: ANSWERING "WHAT HAPPENED TO SHIPMENT BKG-X?" ──────
    console.log(`\n[TEST 3] Answering: "What happened to shipment ${testShipmentId}?"...`);
    const trace = await getShipmentLifecycleTrace(testShipmentId);

    if (trace.length < 5) {
      throw new Error(`Test 3 Failed: Expected at least 5 lifecycle events for ${testShipmentId}, got ${trace.length}`);
    }

    console.log(`✅ TEST 3 PASSED: Full lifecycle trace retrieved with ${trace.length} chronological events:`);
    trace.forEach((ev, i) => {
      console.log(`   ${i + 1}. [${ev.eventType}] ${ev.previousState || 'NONE'} -> ${ev.resultingState} by ${ev.actor}`);
    });

    // ── TEST 4: ANSWERING "WHY WAS THIS SHIPMENT NOT ALLOCATED?" ──
    console.log('\n[TEST 4] Answering: "Why was this shipment not allocated?"...');
    const rejectedShipmentId = `SHP-REJECTED-${Date.now()}`;
    await recordAuditEvent({
      eventType: 'ALLOCATION_REJECTED',
      entityType: 'Shipment',
      entityId: rejectedShipmentId,
      tripId: testTripId,
      actor: 'optimizer_engine',
      previousState: 'PENDING',
      resultingState: 'UNALLOCATED',
      metadata: {
        reason: 'Shipment length (15.0m) exceeds truck cargo interior length (13.6m).',
        violatedConstraints: ['PHYSICAL_DIMENSIONS_OVERFLOW', 'BOUNDARY_CONTAINMENT'],
        volume: 45,
        weight: 8000,
        routeSegment: 'Chennai → Madurai'
      }
    });

    const unallocated = await getUnallocatedCargoExplanations({ shipmentId: rejectedShipmentId });
    if (unallocated.length === 0 || !unallocated[0].reason.includes('exceeds truck cargo interior length')) {
      throw new Error('Test 4 Failed: Could not retrieve unallocated cargo explanation');
    }

    console.log(`✅ TEST 4 PASSED: Optimizer rejection explanation verified:`);
    console.log(`   Shipment: ${unallocated[0].shipmentId}`);
    console.log(`   Explanation: ${unallocated[0].reason}`);
    console.log(`   Violated Constraints: [${unallocated[0].violatedConstraints.join(', ')}]`);

    // ── TEST 5: QUERY AUDIT LEDGER WITH FILTERING ─────────────────
    console.log('\n[TEST 5] Testing Filtered Audit Ledger Query Engine...');
    const ledger = await queryAuditLedger({ tripId: testTripId });
    if (ledger.total < 6) {
      throw new Error(`Test 5 Failed: Expected at least 6 events for trip ${testTripId}, got ${ledger.total}`);
    }
    console.log(`✅ TEST 5 PASSED: Filtered ledger query returned ${ledger.total} records.`);

    console.log('\n===============================================================');
    console.log('🎉 ALL AUDIT & TRACEABILITY TESTS PASSED (100%)');
    console.log('===============================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Audit Test Suite Failed:', error);
    process.exit(1);
  }
};

runAuditTraceabilityTestSuite();
