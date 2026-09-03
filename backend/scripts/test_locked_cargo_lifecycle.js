import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import Trip from '../models/Trip.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import {
  getCandidateShipmentsForTrip,
  previewOptimization,
  approveTripLoadPlan,
  unlockTripLoadPlan,
  getTripLoadPlan
} from '../controllers/tripController.js';

dotenv.config({ path: './backend/.env' });

const mockRes = () => {
  const res = {};
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.data = data;
    return res;
  };
  return res;
};

const mockReq = (params = {}, body = {}, user = { username: 'test_manager', _id: new mongoose.Types.ObjectId() }) => ({
  params,
  body,
  user
});

async function runLifecycleTests() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/road_logistics_db');
  console.log('Connected to MongoDB for Lifecycle Verification Tests.');

  try {
    const testTripId = 'TRIP-LIFECYCLE-TEST-001';
    const testRouteId = 'CHN-BLR-EXP';
    const testVehicleId = 'TN-09-LIFECYCLE-001';

    // 0. Clean up previous test run
    await Trip.deleteOne({ tripId: testTripId });
    await LoadPlan.deleteMany({ tripId: testTripId });
    await LoadAssignment.deleteMany({ loadPlanId: new RegExp(`LP-${testTripId}`) });
    await Shipment.deleteMany({ shipmentId: { $in: ['SHP-LIFE-01', 'SHP-LIFE-02', 'SHP-LIFE-03'] } });
    await Booking.deleteMany({ bookingId: { $in: ['BKG-LIFE-01', 'BKG-LIFE-02', 'BKG-LIFE-03'] } });

    // Ensure vehicle & route exist
    let vehicle = await Vehicle.findOne({ vehicleId: testVehicleId });
    if (!vehicle) {
      vehicle = await Vehicle.create({
        vehicleId: testVehicleId,
        type: 'Heavy Truck',
        dimensions: { length: 13.6, width: 2.45, height: 2.8 },
        capacityVolume: 93.3,
        capacityWeight: 20000,
        routeLane: testRouteId,
        baseLocation: 'Chennai Logistics Hub'
      });
    }

    let route = await Route.findOne({ routeId: testRouteId });
    if (!route) {
      route = await Route.create({
        routeId: testRouteId,
        source: 'Chennai',
        destination: 'Bangalore',
        stops: ['Kanchipuram', 'Vellore', 'Hosur'],
        stopsDetails: [
          { locationName: 'Chennai', stopOrder: 0 },
          { locationName: 'Kanchipuram', stopOrder: 1 },
          { locationName: 'Vellore', stopOrder: 2 },
          { locationName: 'Hosur', stopOrder: 3 },
          { locationName: 'Bangalore', stopOrder: 4 }
        ],
        distance: 350
      });
    }

    const testTrip = await Trip.create({
      tripId: testTripId,
      vehicle: vehicle._id,
      vehicleId: testVehicleId,
      route: route._id,
      routeId: testRouteId,
      status: 'PLANNED',
      scheduledDate: new Date()
    });

    // Create 2 test shipments
    await Shipment.create([
      {
        shipmentId: 'SHP-LIFE-01',
        customer: new mongoose.Types.ObjectId(),
        shipperId: 'Shipper A',
        cargoDescription: 'Industrial Machine Spares',
        packageCount: 2,
        length: 1.5,
        width: 1.2,
        height: 1.4,
        volume: 5.04,
        weight: 1200,
        pickupStop: 'Chennai',
        deliveryStop: 'Vellore',
        requestedDate: new Date(),
        status: 'BOOKED',
        allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
        isLocked: false
      },
      {
        shipmentId: 'SHP-LIFE-02',
        customer: new mongoose.Types.ObjectId(),
        shipperId: 'Shipper B',
        cargoDescription: 'Precision Electronic Parts',
        packageCount: 3,
        length: 1.2,
        width: 1.0,
        height: 1.2,
        volume: 4.32,
        weight: 800,
        pickupStop: 'Chennai',
        deliveryStop: 'Hosur',
        requestedDate: new Date(),
        status: 'BOOKED',
        allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
        isLocked: false
      }
    ]);

    await Booking.create([
      {
        bookingId: 'BKG-LIFE-01',
        shipmentId: 'SHP-LIFE-01',
        shipperId: 'Shipper A',
        cargoDescription: 'Industrial Machine Spares',
        volume: 5.04,
        weight: 1200,
        fromStop: 'Chennai',
        toStop: 'Vellore',
        revenue: 15000,
        date: new Date(),
        status: 'PENDING',
        allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
        isLocked: false
      },
      {
        bookingId: 'BKG-LIFE-02',
        shipmentId: 'SHP-LIFE-02',
        shipperId: 'Shipper B',
        cargoDescription: 'Precision Electronic Parts',
        volume: 4.32,
        weight: 800,
        fromStop: 'Chennai',
        toStop: 'Hosur',
        revenue: 18000,
        date: new Date(),
        status: 'PENDING',
        allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
        isLocked: false
      }
    ]);

    console.log('\n--- TEST 1: Initial Candidate Pool ---');
    const reqCand1 = mockReq({ tripId: testTripId });
    const resCand1 = mockRes();
    await getCandidateShipmentsForTrip(reqCand1, resCand1);
    console.log(`Candidates Found: ${resCand1.data.candidatesCount}`);
    if (resCand1.data.candidatesCount !== 2) {
      throw new Error(`TEST 1 Failed: Expected 2 candidates, got ${resCand1.data.candidatesCount}`);
    }
    console.log('✅ TEST 1 PASSED: Initial candidate pool contains 2 available consignments.');

    console.log('\n--- TEST 2: Approve & Lock Load Plan ---');
    const reqApprove = mockReq({ tripId: testTripId }, { expectedVersion: 1 });
    const resApprove = mockRes();
    await approveTripLoadPlan(reqApprove, resApprove);
    console.log(`Plan Status: ${resApprove.data.loadPlan?.status}, Trip Status: ${resApprove.data.trip?.status}`);

    const updatedShipments = await Shipment.find({ shipmentId: { $in: ['SHP-LIFE-01', 'SHP-LIFE-02'] } });
    for (const s of updatedShipments) {
      console.log(`Shipment ${s.shipmentId} -> status: ${s.status}, isLocked: ${s.isLocked}, allocatedTripId: ${s.allocatedTripId}`);
      if (!s.isLocked || s.status !== 'LOCKED' || s.allocatedTripId !== testTripId) {
        throw new Error(`TEST 2 Failed: Shipment ${s.shipmentId} was not properly locked!`);
      }
    }
    console.log('✅ TEST 2 PASSED: Consignments atomically locked and persisted in DB.');

    console.log('\n--- TEST 3: Candidate Pool After Approval ---');
    const reqCand2 = mockReq({ tripId: testTripId });
    const resCand2 = mockRes();
    await getCandidateShipmentsForTrip(reqCand2, resCand2);
    console.log(`Candidates Count: ${resCand2.data.candidatesCount}, Allocated Cargo Count: ${resCand2.data.allocatedCargoCount}`);
    if (resCand2.data.candidatesCount !== 0) {
      throw new Error(`TEST 3 Failed: Locked cargo still returned in candidates! Count: ${resCand2.data.candidatesCount}`);
    }
    if (resCand2.data.allocatedCargoCount !== 2) {
      throw new Error(`TEST 3 Failed: Allocated cargo count should be 2, got ${resCand2.data.allocatedCargoCount}`);
    }
    console.log('✅ TEST 3 PASSED: Locked consignments correctly excluded from Candidate Pool (0 candidates, 2 locked).');

    console.log('\n--- TEST 4: Duplicate Allocation Rejection ---');
    const reqPrevConflict = mockReq({ tripId: testTripId }, { selectedShipmentIds: ['SHP-LIFE-01'] });
    // Simulate another trip trying to steal locked cargo
    const reqOtherTripConflict = mockReq({ tripId: 'TRIP-OTHER' }, { selectedShipmentIds: ['SHP-LIFE-01'] });
    // Mock other trip in DB
    const otherTrip = await Trip.create({
      tripId: 'TRIP-OTHER',
      vehicle: vehicle._id,
      vehicleId: testVehicleId,
      route: route._id,
      routeId: testRouteId,
      status: 'PLANNED',
      scheduledDate: new Date()
    });

    const resConflict = mockRes();
    await previewOptimization(reqOtherTripConflict, resConflict);
    console.log(`Conflict Response Code: ${resConflict.statusCode}, Message: ${resConflict.data?.message}`);
    if (resConflict.statusCode !== 409) {
      throw new Error(`TEST 4 Failed: Expected 409 Conflict for duplicate allocation, got ${resConflict.statusCode}`);
    }
    await Trip.deleteOne({ tripId: 'TRIP-OTHER' });
    console.log('✅ TEST 4 PASSED: Backend strictly rejected duplicate allocation on locked cargo.');

    console.log('\n--- TEST 5: Add New Unallocated Cargo ---');
    await Shipment.create({
      shipmentId: 'SHP-LIFE-03',
      customer: new mongoose.Types.ObjectId(),
      shipperId: 'Shipper C',
      cargoDescription: 'Textile Fabric Rolls',
      packageCount: 1,
      length: 1.0,
      width: 0.8,
      height: 1.0,
      volume: 0.8,
      weight: 300,
      pickupStop: 'Chennai',
      deliveryStop: 'Bangalore',
      requestedDate: new Date(),
      status: 'BOOKED',
      allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
      isLocked: false
    });

    const reqCand3 = mockReq({ tripId: testTripId });
    const resCand3 = mockRes();
    await getCandidateShipmentsForTrip(reqCand3, resCand3);
    console.log(`Candidates Count after adding new cargo: ${resCand3.data.candidatesCount}`);
    if (resCand3.data.candidatesCount !== 1) {
      throw new Error(`TEST 5 Failed: Expected 1 candidate (SHP-LIFE-03), got ${resCand3.data.candidatesCount}`);
    }
    console.log('✅ TEST 5 PASSED: Only the newly registered unallocated cargo appears in the candidate pool.');

    console.log('\n--- TEST 6: Unlock & Re-Optimize Workflow ---');
    const reqUnlock = mockReq({ tripId: testTripId });
    const resUnlock = mockRes();
    await unlockTripLoadPlan(reqUnlock, resUnlock);
    console.log(`Unlock response: ${resUnlock.data?.message}`);

    const reqCand4 = mockReq({ tripId: testTripId });
    const resCand4 = mockRes();
    await getCandidateShipmentsForTrip(reqCand4, resCand4);
    console.log(`Candidates Count after unlock: ${resCand4.data.candidatesCount}`);
    if (resCand4.data.candidatesCount !== 3) {
      throw new Error(`TEST 6 Failed: Expected 3 candidate consignments after unlock, got ${resCand4.data.candidatesCount}`);
    }
    console.log('✅ TEST 6 PASSED: Unlock releases all locked cargo back to the candidate pool (now 3 available).');

    console.log('\n🎉 ALL 6 ALLOCATION LIFECYCLE & LOCKING TESTS PASSED PERFECTLY!\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ LIFECYCLE TEST FAILED:', err);
    process.exit(1);
  }
}

runLifecycleTests();
