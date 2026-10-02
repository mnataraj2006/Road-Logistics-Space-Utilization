import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import {
  assertTestDatabase,
  isTestDatabaseName,
  extractDbNameFromUri,
  resolveTestMongoUri,
  connectTestDB,
  createTestRunId,
  safeDeleteMany,
  FORBIDDEN_PRODUCTION_NAMES
} from '../config/testDbGuard.js';

import TripStop from '../models/TripStop.js';
import LoadAssignment from '../models/LoadAssignment.js';
import LoadOperation from '../models/LoadOperation.js';
import Booking from '../models/Booking.js';

const runGuardRegressionSuite = async () => {
  let passed = 0;
  let failed = 0;

  const assertEqual = (actual, expected, message) => {
    if (actual === expected) {
      passed++;
      console.log(`  [PASS] ${message} (Expected: ${expected}, Got: ${actual})`);
    } else {
      failed++;
      console.error(`  [FAIL] ${message} (Expected: ${expected}, Got: ${actual})`);
      throw new Error(`Assertion failed: ${message}`);
    }
  };

  const assertTrue = (condition, message) => {
    if (condition) {
      passed++;
      console.log(`  [PASS] ${message}`);
    } else {
      failed++;
      console.error(`  [FAIL] ${message}`);
      throw new Error(`Assertion failed: ${message}`);
    }
  };

  const assertThrows = (fn, expectedSubstring, message) => {
    let threw = false;
    let actualError = '';
    try {
      fn();
    } catch (err) {
      threw = true;
      actualError = err.message || String(err);
    }
    if (threw && (!expectedSubstring || actualError.includes(expectedSubstring))) {
      passed++;
      console.log(`  [PASS] ${message} (Threw expected error: "${actualError}")`);
    } else {
      failed++;
      console.error(`  [FAIL] ${message} (Expected throw containing "${expectedSubstring}", got threw=${threw}, msg="${actualError}")`);
      throw new Error(`Assertion failed: ${message}`);
    }
  };

  const assertAsyncThrows = async (asyncFn, expectedSubstring, message) => {
    let threw = false;
    let actualError = '';
    try {
      await asyncFn();
    } catch (err) {
      threw = true;
      actualError = err.message || String(err);
    }
    if (threw && (!expectedSubstring || actualError.includes(expectedSubstring))) {
      passed++;
      console.log(`  [PASS] ${message} (Threw expected error: "${actualError}")`);
    } else {
      failed++;
      console.error(`  [FAIL] ${message} (Expected throw containing "${expectedSubstring}", got threw=${threw}, msg="${actualError}")`);
      throw new Error(`Assertion failed: ${message}`);
    }
  };

  console.log('\n================================================================================');
  console.log('STARTING BUG-TEST-004 DATABASE SAFETY GUARD REGRESSION TEST SUITE');
  console.log('================================================================================\n');

  try {
    // -------------------------------------------------------------------------
    // TEST 1 — VALID TEST DATABASE (NODE_ENV=test, db=road_logistics_test) -> ALLOW
    // -------------------------------------------------------------------------
    console.log('[TEST 1] Valid Test Database: Verification allowlist...');
    assertTrue(isTestDatabaseName('road_logistics_test'), 'road_logistics_test is recognized as safe test db');
    assertTrue(isTestDatabaseName('road_logistics_space_utilization_test'), 'road_logistics_space_utilization_test is recognized as safe test db');
    assertTrue(isTestDatabaseName('test_cargolytics'), 'test_cargolytics is recognized as safe test db');
    assertTrue(isTestDatabaseName('test'), 'test is recognized as safe test db');
    assertTrue(isTestDatabaseName('cargolytics-test'), 'cargolytics-test is recognized as safe test db');

    // Simulate mock connection in test mode
    process.env.NODE_ENV = 'test';
    const mockTestConn = { readyState: 1, name: 'road_logistics_test' };
    const guardRes1 = assertTestDatabase(mockTestConn);
    assertEqual(guardRes1.safe, true, 'assertTestDatabase allows valid test database');
    assertEqual(guardRes1.dbName, 'road_logistics_test', 'assertTestDatabase reports verified dbName');

    // -------------------------------------------------------------------------
    // TEST 2 — DEVELOPMENT DATABASE (NODE_ENV=development, db=road_logistics) -> REJECT
    // -------------------------------------------------------------------------
    console.log('\n[TEST 2] Development Database Rejection...');
    process.env.NODE_ENV = 'development';
    const mockDevConn = { readyState: 1, name: 'road_logistics' };
    assertThrows(
      () => assertTestDatabase(mockDevConn),
      'NODE_ENV must be \'test\'',
      'assertTestDatabase rejects development NODE_ENV'
    );

    // Even if NODE_ENV=test is forged, development db name must be rejected!
    process.env.NODE_ENV = 'test';
    assertThrows(
      () => assertTestDatabase(mockDevConn),
      'NOT a test database',
      'assertTestDatabase strictly rejects un-suffixed development database road_logistics'
    );

    // -------------------------------------------------------------------------
    // TEST 3 — PRODUCTION DATABASE -> REJECT
    // -------------------------------------------------------------------------
    console.log('\n[TEST 3] Production Database Rejection (Denylist Verification)...');
    process.env.NODE_ENV = 'test';
    for (const prodName of FORBIDDEN_PRODUCTION_NAMES) {
      const mockProdConn = { readyState: 1, name: prodName };
      assertThrows(
        () => assertTestDatabase(mockProdConn),
        'NOT a test database',
        `assertTestDatabase strictly rejects forbidden database '${prodName}'`
      );
      assertEqual(isTestDatabaseName(prodName), false, `isTestDatabaseName('${prodName}') returns false`);
    }

    // -------------------------------------------------------------------------
    // TEST 4 — MISSING DATABASE NAME -> REJECT
    // -------------------------------------------------------------------------
    console.log('\n[TEST 4] Missing / Blank Database Name Rejection...');
    assertThrows(
      () => assertTestDatabase({ readyState: 1, name: '' }),
      'Unable to determine connected database name',
      'Rejects empty database name'
    );
    assertThrows(
      () => assertTestDatabase({ readyState: 1, name: null }),
      'Unable to determine connected database name',
      'Rejects null database name'
    );
    assertThrows(
      () => assertTestDatabase({ readyState: 1 }),
      'Unable to determine connected database name',
      'Rejects undefined database name'
    );

    // -------------------------------------------------------------------------
    // TEST 5 — MISSING / INVALID TEST URI RESOLUTION -> REJECT
    // -------------------------------------------------------------------------
    console.log('\n[TEST 5] Test URI Resolution & Validation...');
    assertThrows(
      () => resolveTestMongoUri('mongodb://localhost:27017/production'),
      'does not qualify as a safe test database',
      'resolveTestMongoUri rejects non-test custom URI'
    );
    assertThrows(
      () => resolveTestMongoUri('mongodb://localhost:27017/road_logistics_space_utilization'),
      'does not qualify as a safe test database',
      'resolveTestMongoUri rejects production application URI'
    );

    // Valid URI resolution
    const resolvedSafe = resolveTestMongoUri('mongodb://localhost:27017/road_logistics_test');
    assertEqual(resolvedSafe, 'mongodb://localhost:27017/road_logistics_test', 'resolveTestMongoUri accepts valid test URI');

    // -------------------------------------------------------------------------
    // TEST 6 — SHARED DATABASE DERIVATION -> SAFELY ISOLATES TO _test
    // -------------------------------------------------------------------------
    console.log('\n[TEST 6] Shared Database URI Safe Transformation...');
    const originalMongoUri = process.env.MONGO_URI;
    process.env.MONGO_URI = 'mongodb+srv://user:pass@cluster0.net/road_logistics_space_utilization?appName=Cluster0';
    delete process.env.TEST_MONGO_URI;
    delete process.env.MONGO_TEST_URI;

    const autoIsolatedUri = resolveTestMongoUri();
    assertTrue(
      autoIsolatedUri.includes('/road_logistics_space_utilization_test?'),
      'Automatic transformation replaces shared DB with isolated _test database'
    );
    assertTrue(
      !autoIsolatedUri.includes('/road_logistics_space_utilization?'),
      'Shared DB name is completely eliminated from test connection target'
    );

    // Restore original URI
    process.env.MONGO_URI = originalMongoUri;

    // -------------------------------------------------------------------------
    // TEST 7 — DESTRUCTIVE OPERATION WITHOUT GUARD -> REJECT
    // -------------------------------------------------------------------------
    console.log('\n[TEST 7] safeDeleteMany Unscoped Global Delete Rejection...');
    // Connect to actual safe test database
    const testDbMeta = await connectTestDB();
    assertEqual(testDbMeta.connection.readyState, 1, 'connectTestDB connects successfully');
    assertTrue(testDbMeta.dbName.endsWith('_test') || testDbMeta.dbName.includes('test'), 'Connected to verified test DB');

    // Attempt unguarded unscoped deleteMany({})
    await assertAsyncThrows(
      async () => {
        await safeDeleteMany(TripStop, {});
      },
      'Unscoped deleteMany({}) on \'TripStop\' is prohibited',
      'safeDeleteMany strictly rejects empty filter {} without explicit override'
    );

    await assertAsyncThrows(
      async () => {
        await safeDeleteMany(LoadAssignment, {});
      },
      'Unscoped deleteMany({}) on \'LoadAssignment\' is prohibited',
      'safeDeleteMany strictly rejects empty filter {} on LoadAssignment'
    );

    // -------------------------------------------------------------------------
    // TEST 8 — FAIL-CLOSED ON DISCONNECTED OR UNCERTAIN STATE
    // -------------------------------------------------------------------------
    console.log('\n[TEST 8] Fail-Closed on Disconnected Connection...');
    assertThrows(
      () => assertTestDatabase({ readyState: 0, name: 'road_logistics_test' }),
      'Database connection is not established',
      'assertTestDatabase fails closed when readyState === 0'
    );
    assertThrows(
      () => assertTestDatabase(null),
      'Database connection is not established',
      'assertTestDatabase fails closed when connection is null'
    );

    // -------------------------------------------------------------------------
    // TEST 9 — SAFETY CANARY PROOF (Canary isolation verification)
    // -------------------------------------------------------------------------
    console.log('\n[TEST 9] Safety Canary Isolation Proof...');
    const testRunId = createTestRunId('CANARY-TEST');
    
    // Create a canary document with testRunId A
    const canaryBooking = await Booking.create({
      bookingId: `BKG-CANARY-${Date.now()}`,
      status: 'ALLOCATED',
      vehicleId: 'TRK-CANARY-1',
      date: new Date(),
      volume: 1,
      weight: 100,
      fromStop: 'Chennai',
      toStop: 'Bangalore',
      price: 1000,
      revenue: 1000,
      shipperId: 'shipper-canary',
      cargoDescription: 'IMPORTANT PROTECTED CANARY'
    });

    // Execute scoped delete for a DIFFERENT test run
    const otherTestTripId = 'TRIP-OTHER-RUN';
    await safeDeleteMany(TripStop, { tripId: otherTestTripId });

    // Verify canary STILL EXISTS!
    const reloadedCanary = await Booking.findById(canaryBooking._id);
    assertTrue(!!reloadedCanary, 'Canary document survived scoped test cleanup completely intact');
    assertEqual(reloadedCanary.bookingId, canaryBooking.bookingId, 'Canary bookingId remains identical');

    // Clean up only the canary itself
    await Booking.deleteOne({ _id: canaryBooking._id });

    console.log('\n================================================================================');
    console.log(`TEST SUITE COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log('================================================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ GUARD REGRESSION TEST FAILED:', err);
    try {
      await mongoose.disconnect();
    } catch {}
    process.exit(1);
  }
};

runGuardRegressionSuite();
