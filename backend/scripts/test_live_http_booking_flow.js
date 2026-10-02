// Uses global fetch built into Node.js 18+
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import Booking from '../models/Booking.js';
import Shipment from '../models/Shipment.js';
import Payment from '../models/Payment.js';

const BASE_URL = 'http://localhost:5000';

const runLiveHttpBookingFlow = async () => {
  console.log('\n================================================================================');
  console.log('STARTING LIVE HTTP END-TO-END BOOKING FLOW VERIFICATION (PORT 5000)');
  console.log('================================================================================\n');

  try {
    // Connect to DB for independent database verification
    await mongoose.connect(process.env.MONGO_URI);

    // STEP 1: CUSTOMER LOGIN
    console.log('[STEP 1] Customer Login via POST /api/auth/login...');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'demo.customer@roadlogistics.com',
        password: 'password123'
      })
    });

    const loginData = await loginRes.json();
    if (!loginRes.ok || !loginData.token) {
      throw new Error(`Login failed: ${loginRes.status} ${JSON.stringify(loginData)}`);
    }
    const token = loginData.token;
    console.log(`  [PASS] Login successful! User: ${loginData.username}, Role: ${loginData.role}`);

    // STEP 2: SEARCH SPACE
    console.log('\n[STEP 2] Capacity Search via POST /api/capacity/search (Chennai -> Madurai)...');
    const today = new Date().toISOString().split('T')[0];
    const searchRes = await fetch(`${BASE_URL}/api/capacity/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        pickup: 'Chennai',
        delivery: 'Madurai',
        date: today,
        volume: 5,
        weight: 500
      })
    });

    const searchData = await searchRes.json();
    if (!searchRes.ok || !searchData.results || searchData.results.length === 0) {
      throw new Error(`Search failed: ${searchRes.status} ${JSON.stringify(searchData)}`);
    }
    console.log(`  [PASS] Matched ${searchData.results.length} available truck(s).`);
    const selectedTruck = searchData.results[0];
    console.log(`  [INFO] Selected Truck: ${selectedTruck.vehicleId}, Lane: ${selectedTruck.route?.routeId}, Quoted Price: ₹${selectedTruck.estimatedPrice}`);

    // STEP 3: BOOKING SUBMISSION OVER HTTP
    console.log('\n[STEP 3] Capacity Booking via POST /api/capacity/book...');
    const bookRes = await fetch(`${BASE_URL}/api/capacity/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        vehicleId: selectedTruck.vehicleId,
        routeId: selectedTruck.route?.routeId,
        pickup: 'Chennai',
        delivery: 'Madurai',
        date: today,
        volume: 5,
        weight: 500,
        cargoDescription: 'Computer Hardware & Monitors',
        invoiceNumber: 'INV-LIVE-001',
        invoiceValue: 150000
      })
    });

    const bookData = await bookRes.json();
    console.log(`  [INFO] HTTP Status: ${bookRes.status}`);
    console.log(`  [INFO] Response Body:`, JSON.stringify(bookData, null, 2));

    if (bookRes.status !== 201) {
      throw new Error(`Booking submission failed: HTTP ${bookRes.status}`);
    }

    // STEP 4: VERIFY RESPONSE CONTRACT & ELIMINATION OF BUG-UI-003
    console.log('\n[STEP 4] Verifying Unified Canonical Booking Response Contract...');
    if (bookData.success !== true) throw new Error('bookData.success !== true');
    if (!bookData.bookingId) throw new Error('Missing top-level bookingId in response!');
    if (!bookData.booking || !bookData.booking.bookingId) throw new Error('Missing nested booking.bookingId!');
    if (bookData.bookingId !== bookData.booking.bookingId) {
      throw new Error(`Mismatch between top-level bookingId (${bookData.bookingId}) and booking.bookingId (${bookData.booking.bookingId})`);
    }

    // Check frontend parsing simulation:
    const frontendBookingId = bookData.bookingId || bookData.booking?.bookingId;
    if (frontendBookingId === undefined || frontendBookingId === null || frontendBookingId === '') {
      throw new Error(`CRITICAL BUG: Frontend parser evaluated to '${frontendBookingId}'!`);
    }
    console.log(`  [PASS] Canonical Contract Verified!`);
    console.log(`  [PASS] Top-level bookingId: ${bookData.bookingId}`);
    console.log(`  [PASS] Nested booking.bookingId: ${bookData.booking.bookingId}`);
    console.log(`  [PASS] Frontend parsed bookingId: ${frontendBookingId}`);
    console.log(`  [PASS] NO 'undefined', NO 'null', NO fake ID!`);

    // STEP 5: DATABASE PERSISTENCE VERIFICATION
    console.log('\n[STEP 5] Database Persistence Verification...');
    const dbBooking = await Booking.findOne({ bookingId: bookData.bookingId });
    if (!dbBooking) throw new Error(`Booking ${bookData.bookingId} not found in MongoDB!`);
    if (dbBooking.bookingId !== frontendBookingId) {
      throw new Error(`DB bookingId (${dbBooking.bookingId}) !== Frontend displayed ID (${frontendBookingId})`);
    }
    console.log(`  [PASS] Persisted MongoDB bookingId: ${dbBooking.bookingId} matches API and Frontend exactly!`);
    console.log(`  [PASS] Persisted Status: ${dbBooking.status}, Revenue: ₹${dbBooking.price || dbBooking.revenue}`);
    console.log(`  [PASS] Persisted Customer: ${dbBooking.customerId || dbBooking.customer}`);

    // STEP 6: VERIFY MY BOOKINGS PAGE API (GET /api/bookings)
    console.log('\n[STEP 6] Customer Bookings List via GET /api/bookings...');
    const listRes = await fetch(`${BASE_URL}/api/bookings`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const listData = await listRes.json();
    if (!listRes.ok || !Array.isArray(listData)) {
      throw new Error(`GET /api/bookings failed: ${listRes.status}`);
    }

    const matchedInList = listData.find(b => b.bookingId === bookData.bookingId);
    if (!matchedInList) {
      throw new Error(`Newly created booking ${bookData.bookingId} NOT found in customer's bookings list!`);
    }
    console.log(`  [PASS] Booking ${matchedInList.bookingId} is present on Customer Bookings page!`);
    console.log(`  [PASS] Status: ${matchedInList.status}, Vehicle: ${matchedInList.vehicleId}, Segment: ${matchedInList.fromStop} → ${matchedInList.toStop}, Price: ₹${matchedInList.price}`);

    // STEP 7: ERROR SCENARIOS VERIFICATION OVER LIVE HTTP
    console.log('\n[STEP 7] Error Scenarios over Live HTTP...');

    // 7A: Invalid Route Direction
    console.log('  Testing 7A: Invalid Route Direction (Reverse: Madurai -> Chennai)...');
    const revRes = await fetch(`${BASE_URL}/api/capacity/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        vehicleId: selectedTruck.vehicleId,
        routeId: selectedTruck.route?.routeId,
        pickup: 'Madurai',
        delivery: 'Chennai',
        date: today,
        volume: 5,
        weight: 500
      })
    });
    const revData = await revRes.json();
    if (revRes.status !== 400 || revData.success !== false || revData.bookingId) {
      throw new Error(`Expected 400 rejection without bookingId, got ${revRes.status}`);
    }
    console.log(`  [PASS] 7A: Invalid direction rejected with HTTP 400 (success: false, no fake bookingId)`);

    // 7B: Capacity Overload (150 m³ > truck capacity)
    console.log('  Testing 7B: Capacity Overload (150 m³)...');
    const overRes = await fetch(`${BASE_URL}/api/capacity/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        vehicleId: selectedTruck.vehicleId,
        routeId: selectedTruck.route?.routeId,
        pickup: 'Chennai',
        delivery: 'Madurai',
        date: today,
        volume: 150,
        weight: 500
      })
    });
    const overData = await overRes.json();
    if (overRes.status !== 409 || overData.success !== false) {
      throw new Error(`Expected 409 conflict, got ${overRes.status}`);
    }
    console.log(`  [PASS] 7B: Capacity overload rejected with HTTP 409 Conflict: "${overData.message}"`);

    // 7C: Unauthorized / IDOR Access Attempt (Unauthenticated request)
    console.log('  Testing 7C: Unauthenticated Booking Request...');
    const unauthRes = await fetch(`${BASE_URL}/api/capacity/book`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleId: selectedTruck.vehicleId,
        pickup: 'Chennai',
        delivery: 'Madurai',
        date: today,
        volume: 2,
        weight: 200
      })
    });
    if (unauthRes.status !== 401) {
      throw new Error(`Expected 401 Unauthorized, got ${unauthRes.status}`);
    }
    console.log(`  [PASS] 7C: Unauthenticated booking strictly rejected with HTTP 401 Unauthorized`);

    console.log('\n================================================================================');
    console.log('🎉 ALL LIVE HTTP WORKFLOW CHECKS PASSED WITH 100% SUCCESS!');
    console.log('================================================================================\n');

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ LIVE HTTP WORKFLOW CHECK FAILED:', err);
    try {
      await mongoose.disconnect();
    } catch (e) {}
    process.exit(1);
  }
};

runLiveHttpBookingFlow();
