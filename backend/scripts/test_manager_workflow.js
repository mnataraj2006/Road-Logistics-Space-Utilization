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
import User from '../models/User.js';

import {
  createTrip,
  getCandidateShipmentsForTrip,
  previewOptimization,
  generateTripLoadPlan,
  approveTripLoadPlan,
  rejectTripLoadPlan,
  dispatchPlannedTrip
} from '../controllers/tripController.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const mockReq = (params = {}, body = {}, user = { username: 'test-manager', role: 'logistics_manager' }) => ({
  params,
  body,
  query: {},
  user
});

const mockRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.data = data; return res; };
  return res;
};

const runManagerWorkflowTestSuite = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/road_logistics';
    console.log('Connecting to MongoDB...', mongoUri);
    await mongoose.connect(mongoUri);

    console.log('\n===============================================================');
    console.log('STARTING LOGISTICS MANAGER WORKFLOW & OPTIMIZER TEST SUITE');
    console.log('===============================================================');

    const routeId = 'RTE-MGR-TEST-1';
    const vehicleId = 'TRK-MGR-TEST-1';
    const shipperUsername = 'shipper-mgr-test';

    // Cleanup
    await Trip.deleteMany({ vehicleId });
    await TripStop.deleteMany({});
    await Vehicle.deleteMany({ vehicleId });
    await Route.deleteMany({ routeId });
    await Shipment.deleteMany({ shipperId: shipperUsername });
    await Booking.deleteMany({ shipperId: shipperUsername });
    await LoadPlan.deleteMany({ vehicleId });
    await LoadAssignment.deleteMany({});
    await User.deleteMany({ username: { $in: [shipperUsername, 'test-manager'] } });

    const managerUser = await User.create({
      username: 'test-manager',
      email: 'manager@cargolytics.ai',
      password: 'password123',
      role: 'logistics_manager',
      name: 'Test Logistics Manager'
    });

    const shipperUser = await User.create({
      username: shipperUsername,
      email: 'shipper@cargolytics.ai',
      password: 'password123',
      role: 'customer',
      name: 'Test Shipper'
    });

    const route = await Route.create({
      routeId,
      source: 'Chennai',
      destination: 'Madurai',
      distance: 480,
      baseRate: 200,
      stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai'],
      stopsDetails: [
        { stopId: 'STP-1', locationName: 'Chennai', sequenceNumber: 1, qrToken: 'TKN-CHE-1', status: 'Ready' },
        { stopId: 'STP-2', locationName: 'Salem', sequenceNumber: 2, qrToken: 'TKN-SLM-2', status: 'Ready' },
        { stopId: 'STP-3', locationName: 'Coimbatore', sequenceNumber: 3, qrToken: 'TKN-CBE-3', status: 'Ready' },
        { stopId: 'STP-4', locationName: 'Madurai', sequenceNumber: 4, qrToken: 'TKN-MDU-4', status: 'Ready' }
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
      routeLane: routeId
    });

    // 1. Create Planned Trip
    console.log('\n[STEP 1] Creating new planned trip...');
    const reqCreateTrip = mockReq({}, {
      vehicleId,
      routeId,
      plannedDeparture: new Date(),
      driverId: 'driver-ravi'
    }, managerUser);
    const resCreateTrip = mockRes();
    await createTrip(reqCreateTrip, resCreateTrip);
    if (resCreateTrip.statusCode !== 201 || !resCreateTrip.data?.trip?.tripId) {
      throw new Error('Step 1 Failed: Could not create trip');
    }
    const tripId = resCreateTrip.data.trip.tripId;
    console.log(`✅ STEP 1 PASSED: Trip ${tripId} created in PLANNED status.`);

    // 2. Create Candidate Shipments
    console.log('\n[STEP 2] Creating pending candidate shipments for route...');
    const shipmentsData = [
      { shipmentId: 'SHP-MGR-1', pickup: 'Chennai', delivery: 'Salem', volume: 25, weight: 4000, priority: 'STANDARD' },
      { shipmentId: 'SHP-MGR-2', pickup: 'Salem', delivery: 'Madurai', volume: 30, weight: 5000, priority: 'EXPRESS' },
      { shipmentId: 'SHP-MGR-3', pickup: 'Chennai', delivery: 'Madurai', volume: 40, weight: 8000, priority: 'URGENT' },
      { shipmentId: 'SHP-MGR-4', pickup: 'Coimbatore', delivery: 'Madurai', volume: 20, weight: 3000, priority: 'STANDARD' }
    ];

    for (const sd of shipmentsData) {
      await Shipment.create({
        shipmentId: sd.shipmentId,
        customer: shipperUser._id,
        shipperId: shipperUsername,
        cargoDescription: 'Industrial Cargo',
        packageCount: 1,
        volume: sd.volume,
        weight: sd.weight,
        priority: sd.priority,
        pickupStop: sd.pickup,
        deliveryStop: sd.delivery,
        requestedDate: new Date(),
        status: 'PENDING'
      });
      await Booking.create({
        bookingId: `BKG-${sd.shipmentId}`,
        shipmentId: sd.shipmentId,
        customer: shipperUser._id,
        shipper: shipperUser._id,
        shipperId: shipperUsername,
        routeId,
        fromStop: sd.pickup,
        toStop: sd.delivery,
        volume: sd.volume,
        weight: sd.weight,
        revenue: sd.volume * 200,
        price: sd.volume * 200,
        date: new Date(),
        status: 'PENDING'
      });
    }

    // 3. Query Candidate Shipments for Trip
    console.log('\n[STEP 3] Fetching candidates for trip...');
    const reqCandidates = mockReq({ tripId }, {}, managerUser);
    const resCandidates = mockRes();
    await getCandidateShipmentsForTrip(reqCandidates, resCandidates);
    if (resCandidates.data.candidatesCount < 4) {
      throw new Error(`Step 3 Failed: Expected at least 4 candidates, got ${resCandidates.data.candidatesCount}`);
    }
    console.log(`✅ STEP 3 PASSED: Retrieved ${resCandidates.data.candidatesCount} candidate shipments.`);

    // 4. Preview Optimization (Zero Database Mutations)
    console.log('\n[STEP 4] Running in-memory optimization preview...');
    const reqPreview = mockReq({ tripId }, {}, managerUser);
    const resPreview = mockRes();
    await previewOptimization(reqPreview, resPreview);
    if (!resPreview.data?.preview || resPreview.data?.optimizationResult?.assignments.length === 0) {
      throw new Error('Step 4 Failed: Optimization preview failed');
    }
    const plansBefore = await LoadPlan.countDocuments({ tripId });
    if (plansBefore !== 0) {
      throw new Error('Step 4 Failed: Preview mutated database state by creating a LoadPlan document!');
    }
    console.log(`✅ STEP 4 PASSED: In-memory preview succeeded with score ${resPreview.data.optimizationResult.objectiveScore}. 0 DB mutations!`);

    // 5. Generate Persistent Load Plan (v1)
    console.log('\n[STEP 5] Generating persistent LoadPlan v1...');
    const reqGen = mockReq({ tripId }, {}, managerUser);
    const resGen = mockRes();
    await generateTripLoadPlan(reqGen, resGen);
    if (resGen.statusCode !== 201 || resGen.data.loadPlan.version !== 1) {
      throw new Error('Step 5 Failed: Could not generate load plan v1');
    }
    const loadPlanV1Id = resGen.data.loadPlan.loadPlanId;
    console.log(`✅ STEP 5 PASSED: LoadPlan v1 (${loadPlanV1Id}) generated with status 'GENERATED'.`);

    // 6. Test Optimistic Locking Concurrency Conflict
    console.log('\n[STEP 6] Testing optimistic locking concurrency conflict (expectedVersion: 99 != 1)...');
    const reqConflict = mockReq({ tripId, loadPlanId: loadPlanV1Id }, { expectedVersion: 99 }, managerUser);
    const resConflict = mockRes();
    await approveTripLoadPlan(reqConflict, resConflict);
    if (resConflict.statusCode !== 409) {
      throw new Error(`Step 6 Failed: Expected 409 Conflict, got ${resConflict.statusCode}`);
    }
    console.log('✅ STEP 6 PASSED: Concurrency conflict detected and rejected with HTTP 409.');

    // 7. Approve Load Plan v1
    console.log('\n[STEP 7] Approving LoadPlan v1...');
    const reqApprove = mockReq({ tripId, loadPlanId: loadPlanV1Id }, { expectedVersion: 1 }, managerUser);
    const resApprove = mockRes();
    await approveTripLoadPlan(reqApprove, resApprove);
    if (resApprove.data?.loadPlan?.status !== 'APPROVED') {
      throw new Error('Step 7 Failed: Plan was not marked as APPROVED');
    }
    const tripAfterApprove = await Trip.findOne({ tripId });
    if (tripAfterApprove.status !== 'READY_FOR_DISPATCH') {
      throw new Error(`Step 7 Failed: Trip status should be READY_FOR_DISPATCH, got ${tripAfterApprove.status}`);
    }
    console.log(`✅ STEP 7 PASSED: LoadPlan v1 APPROVED. Trip ${tripId} status is READY_FOR_DISPATCH.`);

    // 8. Re-optimize & Generate v2 (Superseding v1)
    console.log('\n[STEP 8] Re-optimizing to generate LoadPlan v2...');
    const resGenV2 = mockRes();
    await generateTripLoadPlan(reqGen, resGenV2);
    if (resGenV2.data?.loadPlan?.version !== 2) {
      throw new Error('Step 8 Failed: Expected load plan version 2');
    }
    const loadPlanV2Id = resGenV2.data.loadPlan.loadPlanId;

    // Approve v2
    const reqApproveV2 = mockReq({ tripId, loadPlanId: loadPlanV2Id }, { expectedVersion: 2 }, managerUser);
    const resApproveV2 = mockRes();
    await approveTripLoadPlan(reqApproveV2, resApproveV2);

    const oldV1Plan = await LoadPlan.findOne({ loadPlanId: loadPlanV1Id });
    if (oldV1Plan.status !== 'SUPERSEDED') {
      throw new Error('Step 8 Failed: LoadPlan v1 should be marked SUPERSEDED after v2 approval');
    }
    console.log('✅ STEP 8 PASSED: LoadPlan v2 generated and approved! v1 successfully marked SUPERSEDED.');

    // 9. Dispatch Trip
    console.log('\n[STEP 9] Dispatching trip (Locking load plan immutably)...');
    const reqDispatch = mockReq({ tripId }, {}, managerUser);
    const resDispatch = mockRes();
    await dispatchPlannedTrip(reqDispatch, resDispatch);
    if (resDispatch.data?.trip?.status !== 'IN_TRANSIT') {
      throw new Error('Step 9 Failed: Trip was not marked IN_TRANSIT');
    }
    const activePlan = await LoadPlan.findOne({ loadPlanId: loadPlanV2Id });
    if (!activePlan.isImmutable || activePlan.status !== 'ACTIVE') {
      throw new Error('Step 9 Failed: Approved load plan must be ACTIVE and isImmutable = true');
    }
    console.log(`✅ STEP 9 PASSED: Trip ${tripId} DISPATCHED. LoadPlan v2 is locked IMMUTABLE.`);

    // 10. Attempting to reject/modify immutable plan must fail
    console.log('\n[STEP 10] Testing rejection of immutable active plan after dispatch...');
    const reqReject = mockReq({ tripId, loadPlanId: loadPlanV2Id }, { reason: 'Late change' }, managerUser);
    const resReject = mockRes();
    await rejectTripLoadPlan(reqReject, resReject);
    if (resReject.statusCode !== 400) {
      throw new Error('Step 10 Failed: Modifying immutable plan should have been rejected with 400');
    }
    console.log('✅ STEP 10 PASSED: Modifications to immutable load plan correctly blocked after dispatch.');

    // Cleanup
    await Trip.deleteMany({ vehicleId });
    await TripStop.deleteMany({});
    await Vehicle.deleteMany({ vehicleId });
    await Route.deleteMany({ routeId });
    await Shipment.deleteMany({ shipperId: shipperUsername });
    await Booking.deleteMany({ shipperId: shipperUsername });
    await LoadPlan.deleteMany({ vehicleId });
    await LoadAssignment.deleteMany({});
    await User.deleteMany({ username: { $in: [shipperUsername, 'test-manager'] } });

    console.log('\n===============================================================');
    console.log('🎉 ALL 10 LOGISTICS MANAGER WORKFLOW TESTS PASSED (100%)');
    console.log('===============================================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Manager Workflow Test Suite Failed:', error);
    process.exit(1);
  }
};

runManagerWorkflowTestSuite();
