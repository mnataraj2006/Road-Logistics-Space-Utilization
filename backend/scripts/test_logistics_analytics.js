import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  computeBaselineAssignment,
  getLogisticsPerformanceAnalytics
} from '../services/analyticsService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const runLogisticsAnalyticsTestSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics';
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('STARTING LOGISTICS PERFORMANCE & BASELINE ANALYTICS TEST SUITE');
    console.log('===============================================================');

    // ── TEST 1: VALID BASELINE ASSIGNMENT ALGORITHM ───────────────
    console.log('\n[TEST 1] Testing Valid Baseline Assignment Algorithm...');
    const testShipments = [
      { shipmentId: 'S1', volume: 40, weight: 8000 },
      { shipmentId: 'S2', volume: 35, weight: 7000 },
      { shipmentId: 'S3', volume: 30, weight: 6000 },
      { shipmentId: 'S4', volume: 45, weight: 9000 },
      { shipmentId: 'S5', volume: 25, weight: 5000 },
      { shipmentId: 'S6', volume: 30, weight: 6000 }
    ];

    const baseline = computeBaselineAssignment(testShipments, { capacityVolume: 100, capacityWeight: 20000 });
    console.log('Baseline output:', baseline);

    if (baseline.truckCount < 3) {
      throw new Error(`Test 1 Failed: Expected at least 3 baseline trucks for 205m³ volume, got ${baseline.truckCount}`);
    }
    if (baseline.avgVolumeUtilization <= 0 || baseline.avgVolumeUtilization > 100) {
      throw new Error(`Test 1 Failed: Invalid baseline utilization ${baseline.avgVolumeUtilization}%`);
    }
    console.log(`✅ TEST 1 PASSED: Baseline computed ${baseline.truckCount} trucks at ${baseline.avgVolumeUtilization}% avg utilization.`);

    // ── TEST 2: DATABASE-BACKED PERFORMANCE ANALYTICS ─────────────
    console.log('\n[TEST 2] Fetching Database-Backed Performance Analytics...');
    const analytics = await getLogisticsPerformanceAnalytics();

    // Verify Capacity Metrics
    if (analytics.capacity.averageVolumeUtilization == null || analytics.capacity.unusedVolume == null) {
      throw new Error('Test 2 Failed: Missing capacity metrics');
    }
    console.log(`✅ Capacity Metrics Verified:`);
    console.log(`   - Avg Volume Fill: ${analytics.capacity.averageVolumeUtilization}%`);
    console.log(`   - Avg Weight Fill: ${analytics.capacity.averageWeightUtilization}%`);
    console.log(`   - Peak Segment Fill: ${analytics.capacity.peakSegmentUtilization}%`);
    console.log(`   - Unused Headroom: ${analytics.capacity.unusedVolume} m³ / ${analytics.capacity.unusedWeight} kg`);

    // Verify Optimization & Comparison Metrics
    if (!analytics.optimization.comparison || !analytics.optimization.comparison.improvement) {
      throw new Error('Test 2 Failed: Missing Before vs After Optimization comparison metrics');
    }
    console.log(`✅ Optimization & Baseline Comparison Verified:`);
    console.log(`   - Baseline: ${analytics.optimization.comparison.baseline.truckCount} trucks @ ${analytics.optimization.comparison.baseline.averageVolumeUtilization}%`);
    console.log(`   - Optimized: ${analytics.optimization.comparison.optimized.truckCount} trucks @ ${analytics.optimization.comparison.optimized.averageVolumeUtilization}%`);
    console.log(`   - Improvement: ${analytics.optimization.comparison.improvement.summary}`);
    console.log(`   - Optimizer Success Rate: ${analytics.optimization.optimizerSuccessRate}%`);
    console.log(`   - Allocation Rate: ${analytics.optimization.allocationRate}%`);

    // Verify Operations Metrics
    if (analytics.operations.stopsCompleted == null || analytics.operations.packagesLoaded == null) {
      throw new Error('Test 2 Failed: Missing operational lifecycle metrics');
    }
    console.log(`✅ Operational Lifecycle Verified:`);
    console.log(`   - Stops Completed: ${analytics.operations.stopsCompleted}`);
    console.log(`   - Packages Loaded / Unloaded: ${analytics.operations.packagesLoaded}L / ${analytics.operations.packagesUnloaded}U`);
    console.log(`   - Re-optimizations: ${analytics.operations.reoptimizationCount}`);
    console.log(`   - Trip Completion Rate: ${analytics.operations.tripCompletionRate}%`);

    // Verify Financial Yield Metrics
    if (analytics.financial.totalRevenue == null || analytics.financial.contributionMargin == null) {
      throw new Error('Test 2 Failed: Missing financial metrics');
    }
    console.log(`✅ Financial Yield & Contribution Margin Verified:`);
    console.log(`   - Total Revenue: ₹${analytics.financial.totalRevenue.toLocaleString()}`);
    console.log(`   - Revenue / m³: ₹${analytics.financial.revenuePerUtilizedM3}`);
    console.log(`   - Estimated Operating Cost: ₹${analytics.financial.estimatedOperatingCost.toLocaleString()}`);
    console.log(`   - Contribution Margin: ₹${analytics.financial.contributionMargin.toLocaleString()} (${analytics.financial.contributionMarginPercent}%)`);

    console.log('\n===============================================================');
    console.log('🎉 ALL LOGISTICS PERFORMANCE ANALYTICS TESTS PASSED (100%)');
    console.log('===============================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Analytics Test Suite Failed:', error);
    process.exit(1);
  }
};

runLogisticsAnalyticsTestSuite();
