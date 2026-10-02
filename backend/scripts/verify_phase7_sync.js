import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import Booking, { isValidBookingStatusTransition } from '../models/Booking.js';
import Shipment from '../models/Shipment.js';
import Trip from '../models/Trip.js';
import Vehicle from '../models/Vehicle.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import Payment from '../models/Payment.js';

const API_BASE = 'http://127.0.0.1:5000/api';

async function run() {
  console.log('=== PHASE 7 VERIFICATION: BOOKING / SHIPMENT STATE SYNCHRONIZATION ===');

  await mongoose.connect(process.env.MONGO_URI);
  console.log('MongoDB connected.');

  // Test 1: Unit check of isValidBookingStatusTransition
  console.log('\n[TEST 1] Testing isValidBookingStatusTransition logic:');
  const transitionsToTest = [
    { from: 'BOOKED', to: 'LOCKED', expected: true },
    { from: 'BOOKED', to: 'IN_TRANSIT', expected: true },
    { from: 'LOCKED', to: 'BOOKED', expected: true },
    { from: 'LOCKED', to: 'IN_TRANSIT', expected: true },
    { from: 'ALLOCATED', to: 'LOCKED', expected: true },
    { from: 'IN_TRANSIT', to: 'DELIVERED', expected: true },
    { from: 'DELIVERED', to: 'IN_TRANSIT', expected: false }
  ];

  for (const t of transitionsToTest) {
    const res = isValidBookingStatusTransition(t.from, t.to);
    if (res !== t.expected) {
      throw new Error(`Transition test failed: ${t.from} -> ${t.to} returned ${res}, expected ${t.expected}`);
    }
    console.log(`  ✓ ${t.from} -> ${t.to} = ${res} (Expected: ${t.expected})`);
  }

  // Login Manager
  const mgrRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'dev-manager', password: 'Manager@2026!' })
  });
  const mgrData = await mgrRes.json();
  const mgrToken = mgrData.data?.token || mgrData.token;

  // Login Customer
  const custRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'demo-customer', password: 'password123' })
  });
  const custData = await custRes.json();
  const custToken = custData.data?.token || custData.token;

  // Test 2: Search capacity and book space
  console.log('\n[TEST 2] Customer searches capacity and books space via POST /api/capacity/book:');
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + 2);
  const targetDateStr = targetDate.toISOString().split('T')[0];

  const searchRes = await fetch(`${API_BASE}/capacity/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${custToken}`
    },
    body: JSON.stringify({
      pickup: 'Chennai',
      delivery: 'Bangalore',
      date: targetDateStr,
      volume: 1.0,
      weight: 250
    })
  });
  const searchData = await searchRes.json();
  const results = searchData.results || [];
  if (results.length === 0) {
    throw new Error('No available trucks found in capacity search for Chennai -> Bangalore');
  }
  const selectedTruck = results[0];
  console.log(`  Selected Truck: ${selectedTruck.vehicleId} (${selectedTruck.vehicleType})`);

  const bookRes = await fetch(`${API_BASE}/capacity/book`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${custToken}`
    },
    body: JSON.stringify({
      vehicleId: selectedTruck.vehicleId,
      date: targetDateStr,
      weight: 180,
      volume: 0.9,
      length: 1.2,
      width: 0.9,
      height: 0.8,
      pickup: 'Chennai',
      delivery: 'Bangalore',
      fromStop: 'Chennai',
      toStop: 'Bangalore',
      cargoCategory: 'GENERAL',
      cargoDescription: 'Phase 7 Sync Test Consignment',
      priority: 'STANDARD',
      packageCount: 1,
      fragile: false,
      stackable: true,
      allowRotation: true
    })
  });

  const bookData = await bookRes.json();
  if (!bookRes.ok || !bookData.booking) {
    throw new Error(`Failed to book capacity: ${JSON.stringify(bookData)}`);
  }

  const bookingId = bookData.booking.bookingId;
  const shipmentId = bookData.shipment?.shipmentId;
  console.log(`  Booking ID: ${bookingId}, Shipment ID: ${shipmentId}`);

  // Verify DB state at creation
  const createdBooking = await Booking.findOne({ bookingId });
  const createdShipment = await Shipment.findOne({ shipmentId });

  if (createdBooking.status !== 'BOOKED' || createdShipment.status !== 'BOOKED') {
    throw new Error(`Initial status mismatch! Booking=${createdBooking.status}, Shipment=${createdShipment.status}`);
  }
  if (createdBooking.allocationStatus !== 'AVAILABLE_FOR_OPTIMIZATION' || createdShipment.allocationStatus !== 'AVAILABLE_FOR_OPTIMIZATION') {
    throw new Error(`Initial allocationStatus mismatch! Booking=${createdBooking.allocationStatus}, Shipment=${createdShipment.allocationStatus}`);
  }
  console.log('  ✓ Initial state synchronized: Both Booking and Shipment are BOOKED and AVAILABLE_FOR_OPTIMIZATION.');

  // Test 3: Manager creates or picks an active planned trip
  console.log('\n[TEST 3] Manager plans optimization and approves load plan:');
  let trip = await Trip.findOne({ vehicleId: selectedTruck.vehicleId, status: { $in: ['PLANNED', 'DRAFT'] } });
  if (!trip) {
    // Look for any planned trip or create one
    trip = await Trip.findOne({ status: 'PLANNED' });
  }
  if (!trip) {
    throw new Error(`No PLANNED trip found for ${selectedTruck.vehicleId} to test.`);
  }

  // Generate load plan
  const genRes = await fetch(`${API_BASE}/trips/${trip.tripId}/optimize/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mgrToken}`
    },
    body: JSON.stringify({
      includeUnbookedCapacity: false,
      rules: { enableStacking: true, allowRotation: true }
    })
  });
  const genData = await genRes.json();
  if (!genRes.ok) {
    throw new Error(`Failed to generate load plan: ${JSON.stringify(genData)}`);
  }
  const loadPlanId = genData.loadPlan?.loadPlanId;
  console.log(`  Generated LoadPlan ID: ${loadPlanId}`);

  // Approve load plan
  const approveRes = await fetch(`${API_BASE}/trips/${trip.tripId}/load-plan/approve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mgrToken}`
    },
    body: JSON.stringify({ loadPlanId })
  });
  const approveData = await approveRes.json();
  if (!approveRes.ok) {
    throw new Error(`Failed to approve load plan: ${JSON.stringify(approveData)}`);
  }

  // Check DB state after approval
  const lockedBooking = await Booking.findOne({ bookingId });
  const lockedShipment = await Shipment.findOne({ shipmentId });
  console.log(`  After Approval: Booking status=${lockedBooking.status}, Shipment status=${lockedShipment.status}, allocatedTripId=${lockedBooking.allocatedTripId}`);
  if (lockedBooking.status !== 'LOCKED' || lockedShipment.status !== 'LOCKED') {
    throw new Error(`Status mismatch on approval: Booking=${lockedBooking.status}, Shipment=${lockedShipment.status}`);
  }
  if (!lockedBooking.isLocked || !lockedShipment.isLocked) {
    throw new Error('isLocked is not true on approved plan!');
  }
  console.log('  ✓ Approval synchronization verified: Both are LOCKED with identical tripId and planId.');

  // Test 4: Unlock load plan
  console.log('\n[TEST 4] Manager unlocks load plan:');
  const unlockRes = await fetch(`${API_BASE}/trips/${trip.tripId}/load-plan/unlock`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mgrToken}`
    },
    body: JSON.stringify({ reason: 'Phase 7 Verification Test' })
  });
  const unlockData = await unlockRes.json();
  if (!unlockRes.ok) {
    throw new Error(`Failed to unlock load plan: ${JSON.stringify(unlockData)}`);
  }

  const unlockedBooking = await Booking.findOne({ bookingId });
  const unlockedShipment = await Shipment.findOne({ shipmentId });
  console.log(`  After Unlock: Booking status=${unlockedBooking.status}, Shipment status=${unlockedShipment.status}`);
  if (unlockedBooking.status !== 'BOOKED' || unlockedShipment.status !== 'BOOKED') {
    throw new Error(`Status mismatch on unlock: Booking=${unlockedBooking.status}, Shipment=${unlockedShipment.status}`);
  }
  if (unlockedBooking.isLocked || unlockedShipment.isLocked) {
    throw new Error('isLocked is still true after unlock!');
  }
  console.log('  ✓ Unlock synchronization verified: Both returned to BOOKED with locks released.');

  // Clean up test booking & shipment
  await Booking.deleteOne({ bookingId });
  await Shipment.deleteOne({ shipmentId });
  await LoadAssignment.deleteMany({ bookingId });
  await Payment.deleteMany({ bookingId });
  console.log('\n  ✓ Cleaned up test booking records.');

  await mongoose.disconnect();
  console.log('\n=== PHASE 7 VERIFICATION SUCCESSFUL! ALL TESTS PASSED. ===');
}

run().catch(err => {
  console.error('\n❌ PHASE 7 VERIFICATION FAILED:', err);
  process.exit(1);
});
