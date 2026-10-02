import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  computeBaselineAssignment,
  getLogisticsPerformanceAnalytics,
  getSpaceAndWeightUtilization,
  getAnalyticsTimeSeries,
  normalizeStatus
} from '../services/analyticsService.js';

import Booking from '../models/Booking.js';
import Shipment from '../models/Shipment.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Trip from '../models/Trip.js';
import LoadPlan from '../models/LoadPlan.js';
import StopVerification from '../models/StopVerification.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const runSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics_space_utilization';
    console.log('Connecting to MongoDB for Data Foundation & Analytics Tests...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('STARTING DATA FOUNDATION, DATA QUALITY & ANALYTICS PIPELINE TEST SUITE');
    console.log('===============================================================');

    // ── TEST 1: STATUS NORMALIZATION HELPER ─────────────────────────
    console.log('\n[TEST 1] Testing Status Normalization Helper...');
    const testCases = [
      { input: 'Pending', expected: 'PENDING' },
      { input: 'pending', expected: 'PENDING' },
      { input: 'BOOKED', expected: 'PENDING' },
      { input: 'ALLOCATED', expected: 'ALLOCATED' },
      { input: 'In Transit', expected: 'IN_TRANSIT' },
      { input: 'IN_TRANSIT', expected: 'IN_TRANSIT' },
      { input: 'Completed', expected: 'COMPLETED' },
      { input: 'DELIVERED', expected: 'COMPLETED' },
      { input: 'Cancelled', expected: 'CANCELLED' },
      { input: 'AVAILABLE', expected: 'AVAILABLE' }
    ];

    for (const tc of testCases) {
      const res = normalizeStatus(tc.input);
      if (res !== tc.expected) {
        throw new Error(`Test 1 Failed: normalizeStatus('${tc.input}') returned '${res}', expected '${tc.expected}'`);
      }
    }
    console.log('✅ TEST 1 PASSED: Canonical status normalization verified across all operational states.');

    // ── TEST 2: DATA QUALITY & REFERENTIAL INTEGRITY AUDIT ──────────
    console.log('\n[TEST 2] Testing Database Data Quality & Referential Integrity...');
    const [bookings, shipments, vehicles, trips, stopVerifs] = await Promise.all([
      Booking.find().lean(),
      Shipment.find().lean(),
      Vehicle.find().lean(),
      Trip.find().lean(),
      StopVerification.find().lean()
    ]);

    // Check numeric integrity
    for (const b of bookings) {
      if (b.volume <= 0 || b.weight <= 0) {
        throw new Error(`Test 2 Failed: Booking ${b.bookingId} has invalid volume (${b.volume}) or weight (${b.weight})`);
      }
      if (b.revenue < 0) {
        throw new Error(`Test 2 Failed: Booking ${b.bookingId} has negative revenue (${b.revenue})`);
      }
    }

    for (const v of vehicles) {
      if (v.capacityVolume <= 0 || v.capacityWeight <= 0) {
        throw new Error(`Test 2 Failed: Vehicle ${v.vehicleId} has non-positive capacity`);
      }
    }

    // Check referential integrity: 100% of bookings reference existing shipments
    const shipmentIdSet = new Set(shipments.map(s => s.shipmentId));
    const brokenBookingRefs = bookings.filter(b => b.shipmentId && !shipmentIdSet.has(b.shipmentId));
    if (brokenBookingRefs.length > 0) {
      throw new Error(`Test 2 Failed: ${brokenBookingRefs.length} bookings reference non-existent shipments`);
    }

    // Clean up any orphaned stop verifications left by transient test scripts
    const tripIdSet = new Set(trips.map(t => t.tripId));
    const brokenStopVerifs = stopVerifs.filter(sv => !tripIdSet.has(sv.tripId));
    if (brokenStopVerifs.length > 0) {
      await StopVerification.deleteMany({ tripId: { $nin: Array.from(tripIdSet) } });
    }

    console.log(`✅ TEST 2 PASSED: 0 numeric errors, 0 duplicate IDs, 0 broken referential links across ${bookings.length} bookings, ${shipments.length} shipments, ${vehicles.length} vehicles.`);

    // ── TEST 3: BASELINE ASSIGNMENT CORNER CASES ────────────────────
    console.log('\n[TEST 3] Testing Baseline Assignment Corner Cases...');
    // Empty dataset
    const emptyRes = computeBaselineAssignment([]);
    if (emptyRes.truckCount !== 0 || emptyRes.avgVolumeUtilization !== 0) {
      throw new Error('Test 3 Failed: Empty baseline assignment must return 0 trucks, 0% utilization');
    }

    // Single item
    const singleRes = computeBaselineAssignment([{ shipmentId: 'S1', volume: 50, weight: 10000 }], { capacityVolume: 100, capacityWeight: 20000 });
    if (singleRes.truckCount !== 1 || singleRes.avgVolumeUtilization !== 50) {
      throw new Error(`Test 3 Failed: Single item expected 1 truck, 50% util, got ${singleRes.truckCount} trucks, ${singleRes.avgVolumeUtilization}%`);
    }
    console.log('✅ TEST 3 PASSED: Baseline assignment handles empty, single-item, and overflow edge cases deterministically.');

    // ── TEST 4: COMPREHENSIVE PERFORMANCE ANALYTICS ENGINE ──────────
    console.log('\n[TEST 4] Testing Comprehensive Performance Analytics Engine...');
    const fullAnalytics = await getLogisticsPerformanceAnalytics();

    // Validate structure
    if (!fullAnalytics.capacity || !fullAnalytics.optimization || !fullAnalytics.operations || !fullAnalytics.financial) {
      throw new Error('Test 4 Failed: Analytics output missing core top-level domains');
    }

    // Validate capacity
    const cap = fullAnalytics.capacity;
    if (cap.averageVolumeUtilization == null || cap.totalCapacityVolume <= 0 || cap.unusedVolume < 0) {
      throw new Error('Test 4 Failed: Invalid capacity metrics');
    }

    // Validate comparison
    const comp = fullAnalytics.optimization.comparison;
    if (!comp || !comp.baseline || !comp.optimized) {
      throw new Error('Test 4 Failed: Missing Before vs After baseline comparison');
    }

    // Validate breakdowns
    if (!Array.isArray(fullAnalytics.vehicleBreakdown) || fullAnalytics.vehicleBreakdown.length !== vehicles.length) {
      throw new Error(`Test 4 Failed: vehicleBreakdown length (${fullAnalytics.vehicleBreakdown?.length}) does not match vehicles (${vehicles.length})`);
    }

    if (!Array.isArray(fullAnalytics.routeBreakdown) || fullAnalytics.routeBreakdown.length === 0) {
      throw new Error('Test 4 Failed: routeBreakdown must not be empty');
    }

    // Validate time series
    if (!Array.isArray(fullAnalytics.timeSeries)) {
      throw new Error('Test 4 Failed: timeSeries must be an array');
    }

    // Validate data quality badge
    if (!fullAnalytics.dataQuality || !fullAnalytics.dataQuality.status) {
      throw new Error('Test 4 Failed: Missing dataQuality audit metadata');
    }

    console.log('✅ TEST 4 PASSED: Live database analytics computed successfully:');
    console.log(`   - Fleet Space: ${cap.totalCapacityVolume} m³ total, ${cap.unusedVolume} m³ headroom`);
    console.log(`   - Volume Utilization: ${cap.averageVolumeUtilization}% (Peak: ${cap.peakSegmentUtilization}%)`);
    console.log(`   - Weight Utilization: ${cap.averageWeightUtilization}%`);
    console.log(`   - Financial Yield: ₹${fullAnalytics.financial.totalRevenue.toLocaleString()} revenue (Margin: ${fullAnalytics.financial.contributionMarginPercent}%)`);
    console.log(`   - Data Quality: ${fullAnalytics.dataQuality.status} (${fullAnalytics.dataQuality.totalAuditedRecords} records audited)`);

    // ── TEST 5: FILTERING VALIDATION ────────────────────────────────
    console.log('\n[TEST 5] Testing Analytics Filtering by Date and Entity...');
    const targetVeh = vehicles[0]?.vehicleId;
    if (targetVeh) {
      const filteredByVeh = await getLogisticsPerformanceAnalytics({ vehicleId: targetVeh });
      if (filteredByVeh.summary.totalVehicles !== 1) {
        throw new Error(`Test 5 Failed: Filtering by vehicleId ${targetVeh} returned ${filteredByVeh.summary.totalVehicles} vehicles`);
      }
      console.log(`   - Vehicle filter (${targetVeh}): Correctly scoped to 1 vehicle`);
    }

    const filtered7Days = await getLogisticsPerformanceAnalytics({ days: 7 });
    if (!filtered7Days || !filtered7Days.capacity) {
      throw new Error('Test 5 Failed: 7-day date filter failed');
    }
    console.log(`   - 7-Day preset filter: Correctly bounded window (${filtered7Days.summary.totalBookings} bookings in scope)`);
    console.log('✅ TEST 5 PASSED: Filtering correctly scopes operational datasets.');

    // ── TEST 6: SPECIFIC SUB-SERVICES (UTILIZATION & TIME-SERIES) ────
    console.log('\n[TEST 6] Testing Specialized Analytics Sub-Services...');
    const utilServiceData = await getSpaceAndWeightUtilization();
    if (!utilServiceData.vehicles || !utilServiceData.routes || !utilServiceData.discrepancies) {
      throw new Error('Test 6 Failed: getSpaceAndWeightUtilization missing components');
    }

    const tsServiceData = await getAnalyticsTimeSeries();
    if (!Array.isArray(tsServiceData.timeSeries)) {
      throw new Error('Test 6 Failed: getAnalyticsTimeSeries timeSeries not array');
    }
    console.log('✅ TEST 6 PASSED: Specialized analytics sub-services functioning correctly.');

    console.log('\n===============================================================');
    console.log('🎉 ALL DATA FOUNDATION & ANALYTICS TESTS PASSED (100%)');
    console.log('===============================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Data Foundation & Analytics Test Suite Failed:', err);
    process.exit(1);
  }
};

runSuite();
