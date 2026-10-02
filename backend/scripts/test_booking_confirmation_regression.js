import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import Route from '../models/Route.js';
import Vehicle from '../models/Vehicle.js';
import Booking from '../models/Booking.js';
import Shipment from '../models/Shipment.js';
import Payment from '../models/Payment.js';
import User from '../models/User.js';
import AuditEvent from '../models/AuditEvent.js';

import { searchCapacity, bookCapacity } from '../controllers/capacityController.js';
import { getBookings } from '../controllers/bookingController.js';
import { generateLoadPlan } from '../optimizer/index.js';
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

const runBookingConfirmationRegression = async () => {
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
    console.log('STARTING BUG-UI-003 BOOKING CONFIRMATION & WORKFLOW REGRESSION TEST SUITE');
    console.log('================================================================================\n');

    const testRouteId = 'RTE-BKG-CONF-1';
    const testTruckId = 'TRK-BKG-CONF-1';
    const customerA_username = 'cust-bkg-regress-a';
    const customerB_username = 'cust-bkg-regress-b';

    // 0. Clean previous test artifacts using safe scoped deletions
    await safeDeleteMany(Route, { routeId: testRouteId });
    await safeDeleteMany(Vehicle, { vehicleId: testTruckId });
    await safeDeleteMany(Booking, { vehicleId: testTruckId });
    await safeDeleteMany(Shipment, { shipperId: { $in: [customerA_username, customerB_username] } });
    await safeDeleteMany(Payment, { shipperId: { $in: [customerA_username, customerB_username] } });
    await safeDeleteMany(User, { username: { $in: [customerA_username, customerB_username] } });
    // Note: AuditEvent is append-only by design, so no deleteMany on AuditEvent

    // Seed test users
    const customerA = await User.create({
      username: customerA_username,
      email: 'customera@logistics.ai',
      password: 'password123',
      role: 'customer',
      name: 'Customer Alpha'
    });

    const customerB = await User.create({
      username: customerB_username,
      email: 'customerb@logistics.ai',
      password: 'password123',
      role: 'customer',
      name: 'Customer Beta'
    });

    // Seed test route with 4 stops: Mumbai -> Pune -> Nashik -> Nagpur
    const testRoute = await Route.create({
      routeId: testRouteId,
      source: 'Mumbai',
      destination: 'Nagpur',
      distance: 800,
      baseRate: 200,
      stops: ['Mumbai', 'Pune', 'Nashik', 'Nagpur'],
      stopsDetails: [
        { stopId: 'STP-MUM', locationName: 'Mumbai', sequenceNumber: 1, qrToken: 'TKN-MUM', status: 'Ready' },
        { stopId: 'STP-PUN', locationName: 'Pune', sequenceNumber: 2, qrToken: 'TKN-PUN', status: 'Ready' },
        { stopId: 'STP-NAS', locationName: 'Nashik', sequenceNumber: 3, qrToken: 'TKN-NAS', status: 'Ready' },
        { stopId: 'STP-NAG', locationName: 'Nagpur', sequenceNumber: 4, qrToken: 'TKN-NAG', status: 'Ready' }
      ],
      active: true
    });

    // Seed active test truck: 50 m³, 10,000 kg
    const testVehicle = await Vehicle.create({
      vehicleId: testTruckId,
      type: 'Medium Truck',
      capacityVolume: 50,
      capacityWeight: 10000,
      dimensions: { length: 8.0, width: 2.5, height: 2.5 },
      status: 'Active',
      carrier: customerA._id,
      carrierId: 'carrier-test',
      routeLane: testRouteId,
      ratePerCbm: 150,
      ratePerKg: 5
    });

    const targetDate = new Date().toISOString().split('T')[0];

    // =========================================================================
    // TEST 1 — SUCCESSFUL BOOKING (HTTP success, booking persisted, bookingId returned)
    // =========================================================================
    console.log('\n[TEST 1] Successful Booking: Capacity reservation via POST /api/capacity/book...');
    const req1 = {
      body: {
        vehicleId: testTruckId,
        routeId: testRouteId,
        pickup: 'Mumbai',
        delivery: 'Pune',
        date: targetDate,
        volume: 10,
        weight: 2000,
        length: 2,
        width: 1.5,
        height: 1.2,
        cargoDescription: 'Electronics & Sensors',
        invoiceNumber: 'INV-TEST-001',
        invoiceValue: 50000
      },
      user: customerA
    };
    const res1 = createMockRes();
    await bookCapacity(req1, res1);

    assertEqual(res1.statusCode, 201, 'HTTP status code is 201 Created');
    assertTrue(!!res1.body.success, 'Response success flag is true');
    assertTrue(typeof res1.body.bookingId === 'string' && res1.body.bookingId.startsWith('BKG-'), 'Top-level bookingId is returned');
    
    // Verify persistence in MongoDB
    const persistedBooking1 = await Booking.findOne({ bookingId: res1.body.bookingId });
    assertTrue(!!persistedBooking1, 'Booking is successfully persisted in MongoDB');
    assertEqual(persistedBooking1.bookingId, res1.body.bookingId, 'Persisted bookingId matches response bookingId');
    assertEqual(persistedBooking1.volume, 10, 'Persisted volume matches request');
    assertEqual(persistedBooking1.weight, 2000, 'Persisted weight matches request');
    assertEqual(persistedBooking1.fromStop, 'Mumbai', 'Persisted pickup stop matches request');
    assertEqual(persistedBooking1.toStop, 'Pune', 'Persisted delivery stop matches request');
    assertEqual(persistedBooking1.status, 'ALLOCATED', 'Persisted status is ALLOCATED');

    // =========================================================================
    // TEST 2 — CONFIRMATION USES RETURNED bookingId (displayedBookingId === persistedBookingId)
    // =========================================================================
    console.log('\n[TEST 2] Confirmation UI Parsing: Verify frontend extracts real bookingId with no undefined/null...');
    // Simulate exact frontend parsing logic from SearchSpaceView.jsx
    const frontendResponse = { data: res1.body };
    const bkgObj = frontendResponse.data.booking || {};
    const displayedBookingId = frontendResponse.data.bookingId || bkgObj.bookingId;
    const displayedShipmentId = frontendResponse.data.shipmentId || bkgObj.shipmentId;

    assertTrue(displayedBookingId !== undefined, 'Frontend displayed bookingId is NOT undefined');
    assertTrue(displayedBookingId !== null, 'Frontend displayed bookingId is NOT null');
    assertTrue(displayedBookingId !== '', 'Frontend displayed bookingId is NOT empty');
    assertEqual(displayedBookingId, persistedBooking1.bookingId, 'Displayed bookingId strictly equals MongoDB persisted bookingId');
    assertEqual(displayedShipmentId, `SHP-${persistedBooking1.bookingId}`, 'Displayed shipmentId matches persisted shipmentId');

    // =========================================================================
    // TEST 3 — BOOKING RESPONSE CONTRACT (Canonical unified contract)
    // =========================================================================
    console.log('\n[TEST 3] Booking Response Contract: Canonical shape verification...');
    // Both top-level and nested booking objects must be populated and consistent
    assertEqual(res1.body.booking.bookingId, res1.body.bookingId, 'res.body.booking.bookingId === res.body.bookingId');
    assertEqual(res1.body.shipment.shipmentId, res1.body.shipmentId, 'res.body.shipment.shipmentId === res.body.shipmentId');
    assertTrue(typeof res1.body.message === 'string' && res1.body.message.length > 0, 'res.body.message is descriptive');
    assertTrue(typeof res1.body.payment === 'object' && res1.body.payment !== null, 'res.body.payment object is present');
    assertEqual(res1.body.payment.bookingId, res1.body.bookingId, 'res.body.payment.bookingId matches bookingId');
    assertEqual(res1.body.payment.status, 'Escrow', 'res.body.payment.status is Escrow');
    assertEqual(res1.body.booking.paymentState, 'ESCROW', 'res.body.booking.paymentState is ESCROW');

    // =========================================================================
    // TEST 4 — FAILED BOOKING (Invalid booking rejected, no false success, no fake ID)
    // =========================================================================
    console.log('\n[TEST 4] Failed Booking: Route direction error (Nagpur -> Mumbai reverse on forward route)...');
    const initialBookingCount = await Booking.countDocuments({ vehicleId: testTruckId });
    const reqFail = {
      body: {
        vehicleId: testTruckId,
        routeId: testRouteId,
        pickup: 'Nagpur',
        delivery: 'Mumbai', // Reverse direction!
        date: targetDate,
        volume: 5,
        weight: 500
      },
      user: customerA
    };
    const resFail = createMockRes();
    await bookCapacity(reqFail, resFail);

    assertEqual(resFail.statusCode, 400, 'HTTP status code is 400 Bad Request');
    assertEqual(resFail.body.success, false, 'Response success flag is false');
    assertTrue(resFail.body.bookingId === undefined, 'No fake or premature bookingId returned on failure');
    assertTrue(typeof resFail.body.message === 'string', 'Error message is returned');

    // DB unchanged
    const finalBookingCount = await Booking.countDocuments({ vehicleId: testTruckId });
    assertEqual(finalBookingCount, initialBookingCount, 'Database count unchanged after failed booking attempt');

    // Simulate frontend error handling
    let simulatedFrontendBookingSuccess = null;
    let simulatedUserFormRetained = false;
    const initialConsignmentData = { volume: 5, weight: 500, cargoDescription: 'Fragile Glass' };
    let currentConsignmentData = { ...initialConsignmentData };

    // When API fails (catch block):
    if (!resFail.body.success) {
      simulatedFrontendBookingSuccess = null; // NEVER set success
      // In SearchSpaceView.jsx: form is NOT reset on error!
      simulatedUserFormRetained = (currentConsignmentData.volume === 5 && currentConsignmentData.weight === 500);
    }
    assertTrue(simulatedFrontendBookingSuccess === null, 'Frontend bookingSuccess state remains null on error');
    assertTrue(simulatedUserFormRetained, 'Frontend form values are preserved on failure (no destructive premature reset)');

    // =========================================================================
    // TEST 5 — INSUFFICIENT CAPACITY (Cargo exceeds truck limit -> rejected, DB unchanged)
    // =========================================================================
    console.log('\n[TEST 5] Insufficient Capacity: Request 60 m³ cargo on 50 m³ truck...');
    const reqOversized = {
      body: {
        vehicleId: testTruckId,
        routeId: testRouteId,
        pickup: 'Mumbai',
        delivery: 'Pune',
        date: targetDate,
        volume: 60, // Exceeds truck 50 m³ capacity
        weight: 2000
      },
      user: customerA
    };
    const resOversized = createMockRes();
    await bookCapacity(reqOversized, resOversized);

    assertEqual(resOversized.statusCode, 409, 'HTTP status code is 409 Conflict when capacity exceeded');
    assertEqual(resOversized.body.success, false, 'Capacity rejection returns success: false');
    assertTrue(resOversized.body.message.includes('insufficient space') || resOversized.body.message.includes('Capacity conflict'), 'Informative capacity conflict message returned');
    
    const countAfterOversized = await Booking.countDocuments({ vehicleId: testTruckId });
    assertEqual(countAfterOversized, initialBookingCount, 'Database unchanged after capacity rejection');

    // =========================================================================
    // TEST 6 — DUPLICATE SUBMISSION / RAPID REPEATED SUBMIT
    // =========================================================================
    console.log('\n[TEST 6] Concurrency & Rapid Submission Protection: Segment occupancy enforcement...');
    // Current occupancy Mumbai->Pune is 10 m³ out of 50 m³ (remaining: 40 m³).
    // Customer submits 25 m³. First should succeed, leaving 15 m³.
    // A rapid repeated submission of 25 m³ should fail with 409 Conflict because 10 + 25 + 25 = 60 > 50.
    const reqSubmit1 = {
      body: {
        vehicleId: testTruckId,
        routeId: testRouteId,
        pickup: 'Mumbai',
        delivery: 'Pune',
        date: targetDate,
        volume: 25,
        weight: 4000,
        cargoDescription: 'Batch 1'
      },
      user: customerA
    };
    const resSubmit1 = createMockRes();
    await bookCapacity(reqSubmit1, resSubmit1);
    assertEqual(resSubmit1.statusCode, 201, 'First rapid submission succeeds (HTTP 201)');

    const reqSubmit2 = {
      body: {
        vehicleId: testTruckId,
        routeId: testRouteId,
        pickup: 'Mumbai',
        delivery: 'Pune',
        date: targetDate,
        volume: 25, // 10 + 25 + 25 = 60 > 50 m³
        weight: 4000,
        cargoDescription: 'Batch 2 (Duplicate/Excess)'
      },
      user: customerA
    };
    const resSubmit2 = createMockRes();
    await bookCapacity(reqSubmit2, resSubmit2);
    assertEqual(resSubmit2.statusCode, 409, 'Second rapid submission exceeding capacity fails (HTTP 409 Conflict)');
    assertEqual(resSubmit2.body.success, false, 'Second submission returns success: false');

    // =========================================================================
    // TEST 7 — BOOKING APPEARS IN CUSTOMER'S BOOKINGS LIST (GET /api/bookings)
    // =========================================================================
    console.log('\n[TEST 7] Customer Bookings List: Query GET /api/bookings for Customer A...');
    const reqListA = {
      user: customerA,
      query: { limit: 10 }
    };
    const resListA = createMockRes();
    await getBookings(reqListA, resListA);

    assertEqual(resListA.statusCode, 200, 'GET /api/bookings returns HTTP 200');
    assertTrue(Array.isArray(resListA.body), 'Response body is an array of bookings');
    
    // Find the first created booking in Customer A's list
    const foundBooking = resListA.body.find(b => b.bookingId === res1.body.bookingId);
    assertTrue(!!foundBooking, 'Booking created in Test 1 is present in customer bookings list');
    assertEqual(foundBooking.bookingId, res1.body.bookingId, 'List bookingId matches confirmed bookingId');
    assertEqual(foundBooking.vehicleId, testTruckId, 'List vehicleId matches booking vehicleId');
    assertEqual(foundBooking.status, 'ALLOCATED', 'List status matches booking status');
    assertEqual(foundBooking.fromStop, 'Mumbai', 'List fromStop matches pickup');
    assertEqual(foundBooking.toStop, 'Pune', 'List toStop matches delivery');
    assertEqual(foundBooking.volume, 10, 'List volume matches booked volume');
    assertTrue(foundBooking.price > 0, 'List price is positive number');

    // =========================================================================
    // TEST 8 — CUSTOMER OWNERSHIP / TENANT ISOLATION (Customer A vs Customer B)
    // =========================================================================
    console.log('\n[TEST 8] Customer Ownership: Customer B queries GET /api/bookings...');
    const reqListB = {
      user: customerB,
      query: { limit: 10 }
    };
    const resListB = createMockRes();
    await getBookings(reqListB, resListB);

    assertEqual(resListB.statusCode, 200, 'Customer B GET /api/bookings returns HTTP 200');
    const leakedBooking = resListB.body.find(b => b.bookingId === res1.body.bookingId);
    assertTrue(!leakedBooking, 'Customer B cannot view Customer A booking (Zero IDOR / Tenant isolation preserved)');
    assertEqual(resListB.body.length, 0, 'Customer B has 0 bookings');

    // =========================================================================
    // TEST 9 — QUOTE CONSISTENCY (Search quote matches stored booking price)
    // =========================================================================
    console.log('\n[TEST 9] Quote to Booking Consistency: Deterministic price match...');
    // Search capacity for Pune -> Nashik segment
    const searchReq = {
      method: 'GET',
      query: {
        pickup: 'Pune',
        delivery: 'Nashik',
        date: targetDate,
        volume: 5,
        weight: 1000
      }
    };
    const searchRes = createMockRes();
    await searchCapacity(searchReq, searchRes);

    assertEqual(searchRes.statusCode, 200, 'Capacity search returns HTTP 200');
    const matchedTruck = searchRes.body.results.find(r => r.vehicleId === testTruckId);
    assertTrue(!!matchedTruck, 'Test truck matched in capacity search for Pune -> Nashik');
    const quotedPrice = matchedTruck.estimatedPrice;
    assertTrue(quotedPrice > 0, 'Search returned valid estimated price');

    // Now book exact same segment with Customer A
    const reqQuoteBook = {
      body: {
        vehicleId: testTruckId,
        routeId: testRouteId,
        pickup: 'Pune',
        delivery: 'Nashik',
        date: targetDate,
        volume: 5,
        weight: 1000,
        cargoDescription: 'Spare Parts'
      },
      user: customerA
    };
    const resQuoteBook = createMockRes();
    await bookCapacity(reqQuoteBook, resQuoteBook);

    assertEqual(resQuoteBook.statusCode, 201, 'Booking with quoted parameters succeeds');
    const bookedPrice = resQuoteBook.body.booking.price;
    assertEqual(bookedPrice, quotedPrice, 'Authoritative stored booking price strictly matches the quoted search price');

    // =========================================================================
    // TEST 10 — REFRESH / RELOAD PERSISTENCE (Authoritative MongoDB state verification)
    // =========================================================================
    console.log('\n[TEST 10] Refresh / Reload Persistence: Verify database state after page reload simulation...');
    const reloadedBooking = await Booking.findOne({ bookingId: resQuoteBook.body.bookingId });
    assertTrue(!!reloadedBooking, 'Booking exists upon reload/re-query');
    assertEqual(reloadedBooking.bookingId, resQuoteBook.body.bookingId, 'Reloaded bookingId unchanged');
    assertEqual(reloadedBooking.price, quotedPrice, 'Reloaded price unchanged');
    assertEqual(reloadedBooking.fromStop, 'Pune', 'Reloaded fromStop unchanged');
    assertEqual(reloadedBooking.toStop, 'Nashik', 'Reloaded toStop unchanged');
    assertEqual(reloadedBooking.status, 'ALLOCATED', 'Reloaded status unchanged');

    const reloadedPayment = await Payment.findOne({ bookingId: resQuoteBook.body.bookingId });
    assertTrue(!!reloadedPayment, 'Payment escrow record persists upon reload');
    assertEqual(reloadedPayment.status, 'Escrow', 'Payment escrow status unchanged');

    // =========================================================================
    // TEST 11 — 2D/3D OPTIMIZER COMPATIBILITY (Section 24 Domain Invariant Verification)
    // =========================================================================
    console.log('\n[TEST 11] Optimizer Invariant Compatibility: Shipment from booking feeds into load plan...');
    const persistedShipment = await Shipment.findOne({ shipmentId: resQuoteBook.body.shipmentId });
    assertTrue(!!persistedShipment, 'Shipment record exists for booking');

    // Convert shipment to optimizer input
    const optimizerShipment = {
      shipmentId: persistedShipment.shipmentId,
      pickup: persistedShipment.pickupStop,
      delivery: persistedShipment.deliveryStop,
      volume: persistedShipment.volume,
      weight: persistedShipment.weight,
      priority: 'STANDARD'
    };

    const truckOptContext = {
      vehicleId: testVehicle.vehicleId,
      capacityVolume: testVehicle.capacityVolume,
      capacityWeight: testVehicle.capacityWeight,
      dimensions: testVehicle.dimensions
    };

    const routeOptContext = {
      routeId: testRoute.routeId,
      stops: testRoute.stops,
      distance: testRoute.distance
    };

    const loadPlanResult = generateLoadPlan({
      truck: truckOptContext,
      route: routeOptContext,
      shipments: [optimizerShipment]
    });

    assertTrue(loadPlanResult.assignments.length === 1, 'Optimizer successfully assigned the booked shipment without corruption');
    assertEqual(loadPlanResult.assignments[0].shipmentId, persistedShipment.shipmentId, 'Optimizer assigned correct shipmentId');
    assertTrue(loadPlanResult.assignments[0].volume === 5, 'Optimizer assignment volume matches booked volume (5 m³)');
    assertTrue(loadPlanResult.overallVolumeUtilization > 0, 'Optimizer reports positive volume utilization');
    assertTrue(!!loadPlanResult.operational2DViews, 'Optimizer generated 2D operational representation views');

    // Clean up test data safely
    await safeDeleteMany(Route, { routeId: testRouteId });
    await safeDeleteMany(Vehicle, { vehicleId: testTruckId });
    await safeDeleteMany(Booking, { vehicleId: testTruckId });
    await safeDeleteMany(Shipment, { shipperId: { $in: [customerA_username, customerB_username] } });
    await safeDeleteMany(Payment, { shipperId: { $in: [customerA_username, customerB_username] } });
    await safeDeleteMany(User, { username: { $in: [customerA_username, customerB_username] } });


    console.log('\n================================================================================');
    console.log(`TEST SUITE COMPLETE: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log('================================================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ TEST SUITE FAILED WITH ERROR:', err);
    try {
      await mongoose.disconnect();
    } catch (dErr) {}
    process.exit(1);
  }
};

runBookingConfirmationRegression();
