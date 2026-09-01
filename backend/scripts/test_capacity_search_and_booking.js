import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import Route from '../models/Route.js';
import Vehicle from '../models/Vehicle.js';
import Booking from '../models/Booking.js';
import Shipment from '../models/Shipment.js';
import User from '../models/User.js';
import { searchAvailableTruckSpace, bookTruckCapacity } from '../services/capacitySearchService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const runCapacitySearchTestSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics';
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('STARTING AUTOMATED CAPACITY SEARCH & BOOKING TEST SUITE');
    console.log('===============================================================');

    // 0. Setup Mock Data
    const testRouteId = 'RTE-TEST-CAP-1';
    const testTruckId1 = 'TRK-TEST-CAP-1'; // Capacity: 100 m³, 20,000 kg
    const testTruckId2 = 'TRK-TEST-CAP-2'; // Inactive
    const testCustomerUsername = 'cust-test-capacity';

    await Route.deleteMany({ routeId: testRouteId });
    await Vehicle.deleteMany({ vehicleId: { $in: [testTruckId1, testTruckId2] } });
    await Booking.deleteMany({ vehicleId: { $in: [testTruckId1, testTruckId2] } });
    await Shipment.deleteMany({ shipperId: testCustomerUsername });
    await User.deleteMany({ username: testCustomerUsername });

    const customerUser = await User.create({
      username: testCustomerUsername,
      email: 'testcustomer@cargolytics.ai',
      password: 'password123',
      role: 'customer',
      name: 'Test Customer'
    });

    const route = await Route.create({
      routeId: testRouteId,
      source: 'Chennai',
      destination: 'Madurai',
      distance: 480,
      baseRate: 200,
      stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai'],
      stopsDetails: [
        { stopId: 'STP-1', locationName: 'Chennai', sequenceNumber: 1, qrToken: 'TKN-CHE', status: 'Ready' },
        { stopId: 'STP-2', locationName: 'Salem', sequenceNumber: 2, qrToken: 'TKN-SLM', status: 'Ready' },
        { stopId: 'STP-3', locationName: 'Coimbatore', sequenceNumber: 3, qrToken: 'TKN-CBE', status: 'Ready' },
        { stopId: 'STP-4', locationName: 'Madurai', sequenceNumber: 4, qrToken: 'TKN-MDU', status: 'Ready' }
      ],
      active: true
    });

    const vehicleActive = await Vehicle.create({
      vehicleId: testTruckId1,
      type: 'Heavy Truck',
      capacityVolume: 100, // m³
      capacityWeight: 20000, // kg
      status: 'Active',
      carrier: customerUser._id,
      carrierId: 'test-carrier',
      routeLane: testRouteId,
      ratePerCbm: 150,
      ratePerKg: 5
    });

    const vehicleInactive = await Vehicle.create({
      vehicleId: testTruckId2,
      type: 'Heavy Truck',
      capacityVolume: 100,
      capacityWeight: 20000,
      status: 'In Maintenance', // Inactive!
      carrier: customerUser._id,
      carrierId: 'test-carrier',
      routeLane: testRouteId
    });

    const todayStr = new Date().toISOString().split('T')[0];

    // TEST 1: Exact Fit on Entire Route
    console.log('\n[TEST 1] Testing Exact Fit on entire route (Chennai -> Madurai)...');
    const search1 = await searchAvailableTruckSpace({
      pickup: 'Chennai',
      delivery: 'Madurai',
      date: todayStr,
      volume: 100,
      weight: 20000
    });
    const match1 = search1.results.find(r => r.vehicleId === testTruckId1);
    if (!match1 || match1.availableVolume !== 100 || match1.availableWeight !== 20000) {
      throw new Error('TEST 1 Failed: Expected exact fit match for full capacity');
    }
    console.log('✅ TEST 1 PASSED: Found exact fit match with 100% capacity.');

    // TEST 2: Volume Overflow Rejection
    console.log('\n[TEST 2] Testing Volume Overflow Rejection (Volume: 105 m³ > 100 m³)...');
    const search2 = await searchAvailableTruckSpace({
      pickup: 'Chennai',
      delivery: 'Madurai',
      date: todayStr,
      volume: 105,
      weight: 10000
    });
    const match2 = search2.results.find(r => r.vehicleId === testTruckId1);
    if (match2) throw new Error('TEST 2 Failed: Volume overflow should have been rejected');
    console.log('✅ TEST 2 PASSED: Over-volume cargo correctly rejected.');

    // TEST 3: Weight Overflow Rejection
    console.log('\n[TEST 3] Testing Weight Overflow Rejection (Weight: 25,000 kg > 20,000 kg)...');
    const search3 = await searchAvailableTruckSpace({
      pickup: 'Chennai',
      delivery: 'Madurai',
      date: todayStr,
      volume: 50,
      weight: 25000
    });
    const match3 = search3.results.find(r => r.vehicleId === testTruckId1);
    if (match3) throw new Error('TEST 3 Failed: Weight overflow should have been rejected');
    console.log('✅ TEST 3 PASSED: Over-weight cargo correctly rejected.');

    // TEST 4 & 5: Partial-Route Occupancy & Multi-Stop Overlap
    console.log('\n[TEST 4 & 5] Booking partial route: Chennai -> Salem (60 m³, 10,000 kg)...');
    // Book Chennai -> Salem
    await bookTruckCapacity({
      vehicleId: testTruckId1,
      routeId: testRouteId,
      pickup: 'Chennai',
      delivery: 'Salem',
      date: todayStr,
      volume: 60,
      weight: 10000,
      customerUser
    });

    console.log('Searching space for downstream hop: Salem -> Madurai (90 m³, 18,000 kg)...');
    const searchDownstream = await searchAvailableTruckSpace({
      pickup: 'Salem',
      delivery: 'Madurai',
      date: todayStr,
      volume: 90,
      weight: 18000
    });
    const matchDownstream = searchDownstream.results.find(r => r.vehicleId === testTruckId1);
    if (!matchDownstream) {
      throw new Error('TEST 4/5 Failed: Downstream space Salem -> Madurai should be 100% free (100 m³)');
    }
    console.log('✅ TEST 4 & 5 PASSED: Segment isolation verified! Space freed at Salem is fully usable for Salem -> Madurai.');

    // TEST 6: Invalid Route Direction
    console.log('\n[TEST 6] Testing Invalid Route Direction (Reverse: Madurai -> Salem)...');
    const searchReverse = await searchAvailableTruckSpace({
      pickup: 'Madurai',
      delivery: 'Salem',
      date: todayStr,
      volume: 10,
      weight: 1000
    });
    const matchReverse = searchReverse.results.find(r => r.vehicleId === testTruckId1);
    if (matchReverse) throw new Error('TEST 6 Failed: Reverse direction must be rejected');
    console.log('✅ TEST 6 PASSED: Reverse direction rejected.');

    // TEST 7: Insufficient Segment Capacity Rejection
    console.log('\n[TEST 7] Testing Insufficient Segment Capacity on overlapping leg (Chennai -> Coimbatore for 50 m³)...');
    // Currently on Chennai -> Salem, 60 m³ is used. Remaining is 40 m³. Asking for 50 m³ must fail.
    const searchOverload = await searchAvailableTruckSpace({
      pickup: 'Chennai',
      delivery: 'Coimbatore',
      date: todayStr,
      volume: 50,
      weight: 5000
    });
    const matchOverload = searchOverload.results.find(r => r.vehicleId === testTruckId1);
    if (matchOverload) throw new Error('TEST 7 Failed: Overlapping segment capacity violation was not rejected');
    console.log('✅ TEST 7 PASSED: Overlapping segment capacity overload correctly rejected.');

    // TEST 8: Inactive Vehicle Rejection
    console.log('\n[TEST 8] Testing Inactive Vehicle Rejection (TRK-TEST-CAP-2 in maintenance)...');
    const searchInactive = await searchAvailableTruckSpace({
      pickup: 'Chennai',
      delivery: 'Madurai',
      date: todayStr,
      volume: 10,
      weight: 1000
    });
    const matchInactive = searchInactive.results.find(r => r.vehicleId === testTruckId2);
    if (matchInactive) throw new Error('TEST 8 Failed: Inactive vehicle appeared in search results');
    console.log('✅ TEST 8 PASSED: Inactive vehicle filtered out.');

    // TEST 9: Concurrent Booking Race Condition Protection
    console.log('\n[TEST 9] Testing Concurrent Race Condition Protection...');
    // Remaining space on Chennai -> Salem is 40 m³. Two users concurrently try to book 30 m³ each (Total = 60 m³ > 40 m³).
    // Exactly ONE must succeed, and ONE must fail with 409 Conflict.
    let successCount = 0;
    let conflictCount = 0;

    const sessionA = await mongoose.startSession();
    const sessionB = await mongoose.startSession();

    const bookA = (async () => {
      try {
        sessionA.startTransaction();
        await bookTruckCapacity({
          vehicleId: testTruckId1,
          routeId: testRouteId,
          pickup: 'Chennai',
          delivery: 'Salem',
          date: todayStr,
          volume: 30,
          weight: 5000,
          customerUser,
          session: sessionA
        });
        await sessionA.commitTransaction();
        successCount++;
      } catch (err) {
        await sessionA.abortTransaction();
        if (err?.code === 112 || err?.codeName === 'WriteConflict' || err?.status === 409 || err?.message?.includes('Capacity conflict') || err?.message?.includes('insufficient')) {
          conflictCount++;
        }
      } finally {
        sessionA.endSession();
      }
    })();

    const bookB = (async () => {
      try {
        sessionB.startTransaction();
        await bookTruckCapacity({
          vehicleId: testTruckId1,
          routeId: testRouteId,
          pickup: 'Chennai',
          delivery: 'Salem',
          date: todayStr,
          volume: 30,
          weight: 5000,
          customerUser,
          session: sessionB
        });
        await sessionB.commitTransaction();
        successCount++;
      } catch (err) {
        await sessionB.abortTransaction();
        if (err?.code === 112 || err?.codeName === 'WriteConflict' || err?.status === 409 || err?.message?.includes('Capacity conflict') || err?.message?.includes('insufficient')) {
          conflictCount++;
        }
      } finally {
        sessionB.endSession();
      }
    })();

    await Promise.all([bookA, bookB]);

    console.log(`Concurrent Booking Results: Successful Bookings = ${successCount}, Rejected Conflicts = ${conflictCount}`);
    if (successCount !== 1 || conflictCount !== 1) {
      throw new Error(`TEST 9 Failed: Expected 1 success and 1 conflict, got ${successCount} successes and ${conflictCount} conflicts`);
    }
    console.log('✅ TEST 9 PASSED: Concurrency race condition prevented! Exactly 1 booking committed, 1 rolled back.');

    // Cleanup
    await Route.deleteMany({ routeId: testRouteId });
    await Vehicle.deleteMany({ vehicleId: { $in: [testTruckId1, testTruckId2] } });
    await Booking.deleteMany({ vehicleId: { $in: [testTruckId1, testTruckId2] } });
    await Shipment.deleteMany({ shipperId: testCustomerUsername });
    await User.deleteMany({ username: testCustomerUsername });

    console.log('\n===============================================================');
    console.log('🎉 ALL 9 CAPACITY SEARCH & BOOKING TEST SCENARIOS PASSED (100%)');
    console.log('===============================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Capacity Test Suite Failed:', error);
    process.exit(1);
  }
};

runCapacitySearchTestSuite();
