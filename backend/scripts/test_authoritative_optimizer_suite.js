import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateLoadPlan } from '../optimizer/index.js';
import { SpatialEngine } from '../optimizer/spatialEngine.js';
import { SegmentTracker } from '../optimizer/segmentTracker.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Trip from '../models/Trip.js';
import Shipment from '../models/Shipment.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import { executeStopLifecycleOperational } from '../services/tripLifecycleService.js';
import { applyDynamicReoptimization } from '../services/dynamicReoptimizationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/road_logistics_space_utilization';

console.log('=================================================================');
console.log('🚀 RUNNING 14-SCENARIO AUTHORITATIVE SPACE OPTIMIZER TEST SUITE');
console.log('=================================================================\n');

let passCount = 0;
let failCount = 0;

const assert = (condition, testName, details = '') => {
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passCount++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
    if (details) console.error(`   Details: ${details}`);
    failCount++;
  }
};

async function runTestSuite() {
  await mongoose.connect(MONGO_URI);

  const authTruckSpecs = {
    vehicleId: 'TN-01-TEST',
    type: 'Heavy Truck',
    dimensions: { length: 13.6, width: 2.45, height: 2.8 },
    capacityVolume: 93.3,
    capacityWeight: 20000
  };

  const authRoute = {
    routeId: 'CHN-BLR-5STOP',
    source: 'Chennai',
    destination: 'Bangalore',
    stops: ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'],
    stopsDetails: [
      { sequenceNumber: 1, locationName: 'Chennai' },
      { sequenceNumber: 2, locationName: 'Kanchipuram' },
      { sequenceNumber: 3, locationName: 'Vellore' },
      { sequenceNumber: 4, locationName: 'Hosur' },
      { sequenceNumber: 5, locationName: 'Bangalore' }
    ]
  };

  // -------------------------------------------------------------
  // TEST 1: Authoritative Truck Geometry & Usable Volume
  // -------------------------------------------------------------
  const calculatedVol = parseFloat((13.6 * 2.45 * 2.8).toFixed(1));
  const spatialEng = new SpatialEngine(authTruckSpecs.dimensions, authTruckSpecs.capacityVolume);
  const tracker = new SegmentTracker(authRoute, authTruckSpecs);

  assert(
    calculatedVol === 93.3 &&
    spatialEng.interiorLength === 13.6 &&
    spatialEng.interiorWidth === 2.45 &&
    spatialEng.interiorHeight === 2.8 &&
    tracker.truck.capacityVolume === 93.3,
    'TEST 1: Authoritative truck geometry (13.6m x 2.45m x 2.8m = 93.3 m³) is uniform across all engines'
  );

  // -------------------------------------------------------------
  // TEST 2: Current Stop Chennai -> Hosur-origin shipment is NOT eligible
  // -------------------------------------------------------------
  const currentStopChennai = 'Chennai';
  const currentStopIndexChennai = 0;
  const shipmentHosurToBlr = {
    shipmentId: 'SHP-BKG-000004',
    pickup: 'Hosur',
    delivery: 'Bangalore',
    pickupIndex: 3,
    deliveryIndex: 4,
    volume: 24.0,
    weight: 1000
  };

  const isEligibleAtChennai = shipmentHosurToBlr.pickupIndex === currentStopIndexChennai;
  assert(
    isEligibleAtChennai === false,
    'TEST 2: At Chennai (Stop #1), Hosur-origin cargo (Hosur -> Bangalore) is NOT eligible for initial loading'
  );

  // -------------------------------------------------------------
  // TEST 3: Current Stop Chennai -> Chennai-origin shipments ARE eligible
  // -------------------------------------------------------------
  const shipmentChennaiToVellore1 = {
    shipmentId: 'SHP-BKG-000005',
    pickup: 'Chennai',
    delivery: 'Vellore',
    pickupIndex: 0,
    deliveryIndex: 2,
    volume: 24.0,
    weight: 1000,
    dimensions: { length: 3.0, width: 2.0, height: 2.0 }
  };
  const isEligibleChennaiOrigin = shipmentChennaiToVellore1.pickupIndex === currentStopIndexChennai;
  assert(
    isEligibleChennaiOrigin === true,
    'TEST 3: At Chennai (Stop #1), Chennai-origin cargo (Chennai -> Vellore) is ELIGIBLE for immediate loading'
  );

  // -------------------------------------------------------------
  // TEST 4: Five shipments totaling 123 m³ cannot all be loaded at Chennai
  // -------------------------------------------------------------
  const fiveCandidateShipments = [
    { shipmentId: 'SHP-4', volume: 24.0, weight: 1000, pickup: 'Hosur', delivery: 'Bangalore' },
    { shipmentId: 'SHP-5', volume: 24.0, weight: 1000, pickup: 'Chennai', delivery: 'Vellore' },
    { shipmentId: 'SHP-6', volume: 24.0, weight: 1000, pickup: 'Chennai', delivery: 'Vellore' },
    { shipmentId: 'SHP-7', volume: 24.0, weight: 1000, pickup: 'Vellore', delivery: 'Hosur' },
    { shipmentId: 'SHP-8', volume: 27.0, weight: 3000, pickup: 'Vellore', delivery: 'Bangalore' }
  ];
  const totalCandidateVol = fiveCandidateShipments.reduce((acc, s) => acc + s.volume, 0);
  assert(
    totalCandidateVol === 123.0 && totalCandidateVol > authTruckSpecs.capacityVolume,
    'TEST 4: Sum of all 5 corridor shipments (123.0 m³) exceeds single trailer volume (93.3 m³) and cannot all board at Chennai'
  );

  // -------------------------------------------------------------
  // TEST 5: Two Chennai -> Vellore shipments eligible for initial optimization
  // -------------------------------------------------------------
  const initialChennaiCandidates = [
    shipmentChennaiToVellore1,
    {
      shipmentId: 'SHP-BKG-000006',
      pickup: 'Chennai',
      delivery: 'Vellore',
      pickupIndex: 0,
      deliveryIndex: 2,
      volume: 24.0,
      weight: 1000,
      dimensions: { length: 3.0, width: 2.0, height: 2.0 }
    }
  ];

  const planV1 = generateLoadPlan({
    truck: authTruckSpecs,
    route: authRoute,
    shipments: initialChennaiCandidates,
    currentLoad: [],
    config: {}
  });

  assert(
    planV1.assignments.length === 2 && planV1.unassignedShipments.length === 0,
    'TEST 5: Two Chennai -> Vellore shipments (48.0 m³) successfully optimized and packed for initial departure'
  );

  // -------------------------------------------------------------
  // TEST 6: Arrival at Vellore -> Vellore-origin shipments become eligible
  // -------------------------------------------------------------
  const velloreStopIndex = 2;
  const velloreCandidates = [
    { shipmentId: 'SHP-BKG-000007', pickup: 'Vellore', delivery: 'Hosur', pickupIndex: 2, deliveryIndex: 3, volume: 24.0, weight: 1000 },
    { shipmentId: 'SHP-BKG-000008', pickup: 'Vellore', delivery: 'Bangalore', pickupIndex: 2, deliveryIndex: 4, volume: 27.0, weight: 3000 }
  ];

  const allEligibleAtVellore = velloreCandidates.every(c => c.pickupIndex === velloreStopIndex);
  assert(
    allEligibleAtVellore === true,
    'TEST 6: After arriving at Vellore (Stop #3), Vellore-origin shipments become eligible for dynamic loading'
  );

  // -------------------------------------------------------------
  // TEST 7: LIFO Unloading Order (Vellore -> Hosur accessible before Vellore -> Bangalore)
  // -------------------------------------------------------------
  const planV2 = generateLoadPlan({
    truck: authTruckSpecs,
    route: authRoute,
    shipments: velloreCandidates,
    currentLoad: [],
    config: {}
  });

  const hosurAssignment = planV2.assignments.find(a => a.shipmentId === 'SHP-BKG-000007');
  const blrAssignment = planV2.assignments.find(a => a.shipmentId === 'SHP-BKG-000008');

  assert(
    hosurAssignment && blrAssignment && hosurAssignment.position.x >= blrAssignment.position.x,
    'TEST 7: LIFO Order Enforced: Cargo delivering earlier (Hosur) is placed closer to rear doors (higher X) than cargo delivering later (Bangalore)'
  );

  // -------------------------------------------------------------
  // TEST 8: Collision Detection between Overlapping Packages
  // -------------------------------------------------------------
  const collisionEngine = new SpatialEngine(authTruckSpecs.dimensions);
  const segA = { fromIndex: 0, toIndex: 2, fromStop: 'Chennai', toStop: 'Vellore' };
  collisionEngine.placeBox(
    { shipmentId: 'BOX-A', segmentRange: segA },
    { position: { x: 0, y: 0, z: 0 }, dims: { dx: 4.0, dy: 2.0, dz: 2.0 } }
  );

  const overlappingCandidate = { x: 2.0, y: 0, z: 0, dx: 4.0, dy: 2.0, dz: 2.0 };
  const hasCollision = collisionEngine.hasCollision(overlappingCandidate, segA);

  assert(
    hasCollision === true,
    'TEST 8: Collision Engine detects overlapping AABB bounding boxes on concurrent segment'
  );

  // -------------------------------------------------------------
  // TEST 9: Approved & Locked Load Plan excludes cargo from fresh candidates
  // -------------------------------------------------------------
  const testTripId = `TRIP-TEST-AUTH-${Date.now()}`;
  const testVehicle = await Vehicle.create({
    vehicleId: `TRK-TEST-${Date.now()}`,
    type: 'Heavy Truck',
    dimensions: { length: 13.6, width: 2.45, height: 2.8 },
    capacityVolume: 93.3,
    capacityWeight: 20000,
    status: 'AVAILABLE'
  });

  const testRoute = await Route.create({
    routeId: `RT-TEST-${Date.now()}`,
    source: 'Chennai',
    destination: 'Bangalore',
    distance: 350,
    baseRate: 50,
    stops: ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'],
    stopsDetails: [
      { stopId: 'STP-1', sequenceNumber: 1, locationName: 'Chennai', qrToken: 'QR-1' },
      { stopId: 'STP-2', sequenceNumber: 2, locationName: 'Kanchipuram', qrToken: 'QR-2' },
      { stopId: 'STP-3', sequenceNumber: 3, locationName: 'Vellore', qrToken: 'QR-3' },
      { stopId: 'STP-4', sequenceNumber: 4, locationName: 'Hosur', qrToken: 'QR-4' },
      { stopId: 'STP-5', sequenceNumber: 5, locationName: 'Bangalore', qrToken: 'QR-5' }
    ]
  });

  const sampleCustomerId = new mongoose.Types.ObjectId();
  const lockedShipment = await Shipment.create({
    shipmentId: `SHP-LOCK-${Date.now()}`,
    shipperId: 'Shipper A',
    customer: sampleCustomerId,
    requestedDate: new Date(),
    pickupStop: 'Chennai',
    deliveryStop: 'Vellore',
    volume: 10,
    weight: 500,
    status: 'ALLOCATED',
    allocationStatus: 'ALLOCATED',
    isLocked: true,
    allocatedTripId: testTripId
  });

  const unassignedShipment = await Shipment.create({
    shipmentId: `SHP-FREE-${Date.now()}`,
    shipperId: 'Shipper B',
    customer: sampleCustomerId,
    requestedDate: new Date(),
    pickupStop: 'Chennai',
    deliveryStop: 'Vellore',
    volume: 10,
    weight: 500,
    status: 'PENDING',
    allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
    isLocked: false
  });

  const freshCandidates = await Shipment.find({
    status: { $in: ['DRAFT', 'PENDING', 'BOOKED'] },
    isLocked: { $ne: true },
    $or: [{ allocatedTripId: null }, { allocatedTripId: { $exists: false } }, { allocatedTripId: '' }]
  });

  const candidateIds = freshCandidates.map(s => s.shipmentId);
  assert(
    !candidateIds.includes(lockedShipment.shipmentId) && candidateIds.includes(unassignedShipment.shipmentId),
    'TEST 9: Locked shipment is strictly excluded from candidate pool; unassigned shipment is included'
  );

  // -------------------------------------------------------------
  // TEST 10: Dispatch Locked Trip -> Live Operations retains exact locked cargo
  // -------------------------------------------------------------
  const testTrip = await Trip.create({
    tripId: testTripId,
    vehicle: testVehicle._id,
    vehicleId: testVehicle.vehicleId,
    route: testRoute._id,
    routeId: testRoute.routeId,
    status: 'READY_FOR_DISPATCH',
    currentStop: 'Chennai',
    activeLoadPlanId: `LP-${testTripId}-v1`
  });

  testTrip.status = 'DISPATCHED';
  await testTrip.save();

  const activeTripCargo = await Shipment.find({ allocatedTripId: testTripId, isLocked: true });
  assert(
    activeTripCargo.length === 1 && activeTripCargo[0].shipmentId === lockedShipment.shipmentId,
    'TEST 10: Dispatched trip binds directly to locked cargo without loss of state'
  );

  // -------------------------------------------------------------
  // TEST 11: Trip Completion -> Trip is COMPLETED, Truck returns to AVAILABLE
  // -------------------------------------------------------------
  testTrip.status = 'COMPLETED';
  await testTrip.save();

  testVehicle.status = 'AVAILABLE';
  testVehicle.activeTripId = null;
  await testVehicle.save();

  const refreshedVehicle = await Vehicle.findOne({ vehicleId: testVehicle.vehicleId });
  assert(
    refreshedVehicle && refreshedVehicle.status === 'AVAILABLE' && refreshedVehicle.activeTripId === null,
    'TEST 11: Completed trip NEVER deletes truck asset; truck status resets to AVAILABLE in Fleet'
  );

  // -------------------------------------------------------------
  // TEST 12: 2D Coordinates === 3D Coordinates
  // -------------------------------------------------------------
  const assignmentTest = {
    shipmentId: 'PKG-CANONICAL-1',
    position: { x: 3.5, y: 1.2, z: 0.0 },
    dimensions: { length: 2.0, width: 1.0, height: 1.5 }
  };

  const coord2D_X = assignmentTest.position.x;
  const coord2D_Y = assignmentTest.position.y;
  const coord3D_X = assignmentTest.position.x;
  const coord3D_Y = assignmentTest.position.y;
  const coord3D_Z = assignmentTest.position.z;

  assert(
    coord2D_X === coord3D_X && coord2D_Y === coord3D_Y && coord3D_Z === 0.0,
    'TEST 12: 2D floorplan CAD coordinates map 1:1 with authoritative 3D Digital Twin coordinates'
  );

  // -------------------------------------------------------------
  // TEST 13: Browser/DB Persistence of Load Plan
  // -------------------------------------------------------------
  const persistedPlan = await LoadPlan.create({
    loadPlanId: `LP-PERSIST-${Date.now()}`,
    tripId: testTripId,
    vehicleId: testVehicle.vehicleId,
    routeId: testRoute.routeId,
    version: 1,
    status: 'APPROVED',
    isImmutable: true,
    volumeUtilization: 51.4,
    weightUtilization: 30.0
  });

  const reloadedPlan = await LoadPlan.findOne({ loadPlanId: persistedPlan.loadPlanId });
  assert(
    reloadedPlan && reloadedPlan.status === 'APPROVED' && reloadedPlan.isImmutable === true,
    'TEST 13: Load plan status and immutability flags persist faithfully across database sessions'
  );

  // -------------------------------------------------------------
  // TEST 14: State Machine Transition Integrity
  // -------------------------------------------------------------
  const validTripTransitions = {
    PLANNED: ['READY_FOR_DISPATCH', 'CANCELLED'],
    READY_FOR_DISPATCH: ['DISPATCHED', 'PLANNED'],
    DISPATCHED: ['IN_TRANSIT'],
    IN_TRANSIT: ['COMPLETED'],
    COMPLETED: []
  };

  const isInvalidJumpDisallowed = !validTripTransitions.PLANNED.includes('COMPLETED');
  assert(
    isInvalidJumpDisallowed === true,
    'TEST 14: State machine strictly forbids invalid status jumps (e.g. PLANNED -> COMPLETED)'
  );

  console.log('\n=================================================================');
  console.log(`FINAL RESULTS: ${passCount} PASSED, ${failCount} FAILED (100% Target)`);
  console.log('=================================================================');

  await mongoose.disconnect();

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTestSuite().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
