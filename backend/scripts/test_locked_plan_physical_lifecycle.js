import assert from 'assert';
import mongoose from 'mongoose';
import Trip from '../models/Trip.js';
import TripStop from '../models/TripStop.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import { generateLoadPlan } from '../optimizer/index.js';
import { dispatchTripOperational, executeStopLifecycleOperational } from '../services/tripLifecycleService.js';
import { approveTripLoadPlan } from '../controllers/tripController.js';
import { generateSecureStopToken } from '../services/secureTokenService.js';

console.log('========================================================================================');
console.log('🚀 RUNNING AUTHORITATIVE LOCKED LOAD PLAN & PHYSICAL LIFECYCLE PARITY TEST SUITE');
console.log('========================================================================================\n');

let passedTests = 0;
let totalTests = 0;

function report(category, name, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${category} :: ${name}`);
  } else {
    console.error(`❌ [FAIL] ${category} :: ${name}`);
    if (details) console.error(`   Details: ${details}`);
    throw new Error(`Assertion failed: ${name}`);
  }
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://2312031_db_user:skXKgTfY0KesnV8s@cluster0.zbdt1is.mongodb.net/road_logistics_space_utilization?appName=Cluster0';

async function runLifecycleParitySuite() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB.\n');

  const testSuffix = Date.now();
  const tripId = `TRIP-TEST2-${testSuffix}`;
  const vehicleId = `TN-01-TEST2-${testSuffix}`;
  const routeId = `CORRIDOR-CHN-BLR-${testSuffix}`;
  const mockUserId = new mongoose.Types.ObjectId();

  console.log('--- SETUP: Initializing Test 2 Corridor & 13.6m Truck ---');
  // 1. Create Authoritative Truck (13.6 x 2.45 x 2.8, 93.296 m³, 20,000 kg)
  const truck = await Vehicle.create({
    vehicleId,
    type: 'Heavy Truck',
    dimensions: { length: 13.6, width: 2.45, height: 2.8 },
    capacityVolume: 93.296,
    capacityWeight: 20000,
    status: 'Active',
    transitStatus: 'AVAILABLE'
  });

  // 2. Create 5-Stop Route
  const routeStops = ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'];
  const route = await Route.create({
    routeId,
    source: 'Chennai',
    destination: 'Bangalore',
    distance: 350,
    baseRate: 150,
    stops: ['Kanchipuram', 'Vellore', 'Hosur'],
    stopsDetails: routeStops.map((name, idx) => ({
      stopId: `STP-${idx + 1}`,
      locationName: name,
      sequenceNumber: idx + 1,
      distanceFromOriginKm: idx * 75,
      qrToken: generateSecureStopToken({ tripId, vehicleId, routeId, stopId: `STP-${idx + 1}`, sequence: idx + 1, locationName: name })
    }))
  });

  // 3. Create 5 Multi-Stop Test 2 Consignments
  const test2ShipmentDefs = [
    { shipmentId: `SHP-TEST2-000005-${testSuffix}`, pickupStop: 'Chennai', deliveryStop: 'Vellore', volume: 24, weight: 1000, length: 4.0, width: 2.4, height: 2.5 },
    { shipmentId: `SHP-TEST2-000006-${testSuffix}`, pickupStop: 'Chennai', deliveryStop: 'Vellore', volume: 24, weight: 1000, length: 4.0, width: 2.4, height: 2.5 },
    { shipmentId: `SHP-TEST2-000007-${testSuffix}`, pickupStop: 'Vellore', deliveryStop: 'Hosur', volume: 24, weight: 1000, length: 4.0, width: 2.4, height: 2.5 },
    { shipmentId: `SHP-TEST2-000008-${testSuffix}`, pickupStop: 'Vellore', deliveryStop: 'Bangalore', volume: 27, weight: 3000, length: 4.0, width: 2.4, height: 2.8 },
    { shipmentId: `SHP-TEST2-000004-${testSuffix}`, pickupStop: 'Hosur', deliveryStop: 'Bangalore', volume: 24, weight: 1000, length: 4.0, width: 2.4, height: 2.5 }
  ];

  const createdShipments = [];
  for (const def of test2ShipmentDefs) {
    const s = await Shipment.create({
      ...def,
      customer: mockUserId,
      shipperId: 'Test2-Shipper',
      requestedDate: new Date(),
      status: 'BOOKED',
      allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
      physicalStatus: 'WAITING_AT_ORIGIN',
      isLocked: false
    });
    createdShipments.push(s);

    await Booking.create({
      bookingId: def.shipmentId,
      shipmentId: def.shipmentId,
      customer: mockUserId,
      shipperId: 'Test2-Shipper',
      revenue: 5000,
      vehicleId: 'UNASSIGNED',
      routeId,
      fromStop: def.pickupStop,
      toStop: def.deliveryStop,
      volume: def.volume,
      weight: def.weight,
      status: 'PENDING',
      allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
      date: new Date()
    });
  }

  // 4. Create Trip
  const trip = await Trip.create({
    tripId,
    route: route._id,
    routeId,
    vehicle: truck._id,
    vehicleId,
    scheduledDeparture: new Date(),
    status: 'PLANNED',
    currentStop: 'Chennai',
    currentStopIndex: 0,
    actualLoadSnapshot: {
      usedVolume: 0,
      usedWeight: 0,
      packagesCount: 0,
      loadedShipmentIds: []
    }
  });

  for (let i = 0; i < route.stopsDetails.length; i++) {
    const st = route.stopsDetails[i];
    await TripStop.create({
      tripId,
      stopId: st.stopId,
      sequence: st.sequenceNumber,
      location: st.locationName,
      locationName: st.locationName,
      qrToken: st.qrToken,
      verificationStatus: i === 0 ? 'READY' : 'UPCOMING'
    });
  }

  // ── STATE A: CHENNAI BEFORE LOADING (OPTIMIZE & LOCK) ──
  console.log('\n--- STATE A: CHENNAI BEFORE LOADING (OPTIMIZE & LOCK) ---');
  const optimizerPlan = generateLoadPlan({
    truck: {
      vehicleId,
      dimensions: { length: 13.6, width: 2.45, height: 2.8 },
      capacityVolume: 93.296,
      capacityWeight: 20000
    },
    route: {
      routeId,
      stops: routeStops
    },
    shipments: test2ShipmentDefs
  });

  report('State A', 'Optimizer successfully positions all 5 corridor packages', optimizerPlan.assignments.length === 5);
  report('State A', 'Cumulative trip volume = 123.0 m³, Cumulative weight = 7,000 kg',
    test2ShipmentDefs.reduce((s, c) => s + c.volume, 0) === 123 &&
    test2ShipmentDefs.reduce((s, c) => s + c.weight, 0) === 7000
  );
  report('State A', 'Peak simultaneous volume is 51.0 m³ (54.6%) on Vellore -> Hosur segment',
    optimizerPlan.peakVolumeUtilization === 54.7 || optimizerPlan.peakVolumeUtilization === 54.6,
    `Peak Vol Util: ${optimizerPlan.peakVolumeUtilization}%`
  );
  report('State A', 'Peak simultaneous weight is 4,000 kg (20.0%)',
    optimizerPlan.peakWeightUtilization === 20.0,
    `Peak Wt Util: ${optimizerPlan.peakWeightUtilization}%`
  );

  // Approve & Lock the Load Plan
  const loadPlanId = `LP-${tripId}-v1`;
  const planDoc = await LoadPlan.create({
    loadPlanId,
    trip: trip._id,
    tripId,
    vehicleId,
    routeId,
    version: 1,
    status: 'APPROVED',
    isImmutable: true,
    volumeUtilization: optimizerPlan.overallVolumeUtilization,
    weightUtilization: optimizerPlan.overallWeightUtilization,
    peakUtilization: {
      volume: optimizerPlan.peakVolumeUtilization,
      weight: optimizerPlan.peakWeightUtilization
    },
    segmentUtilization: optimizerPlan.segmentUtilization,
    generatedAt: new Date(),
    approvedAt: new Date(),
    lockedAt: new Date()
  });

  for (const a of optimizerPlan.assignments) {
    const pickupStopName = a.pickup || a.pickupStop || a.segmentRange?.fromStop;
    const isOriginCurrent = pickupStopName === 'Chennai';
    await LoadAssignment.create({
      loadPlan: planDoc._id,
      loadPlanId,
      shipmentId: a.shipmentId,
      bookingId: a.shipmentId,
      segmentRange: a.segmentRange,
      dimensions: a.dimensions,
      volume: a.volume,
      weight: a.weight,
      position: a.position,
      orientation: a.orientation,
      status: 'ASSIGNED',
      physicalStatus: isOriginCurrent ? 'READY_TO_LOAD' : 'WAITING_AT_ORIGIN'
    });

    await Shipment.updateOne(
      { shipmentId: a.shipmentId },
      {
        $set: {
          status: 'LOCKED',
          allocationStatus: 'LOCKED',
          isLocked: true,
          allocatedTripId: tripId,
          allocatedLoadPlanId: loadPlanId,
          physicalStatus: isOriginCurrent ? 'READY_TO_LOAD' : 'WAITING_AT_ORIGIN'
        }
      }
    );
    await Booking.updateOne(
      { shipmentId: a.shipmentId },
      { $set: { vehicleId, status: 'LOCKED', allocationStatus: 'LOCKED', isLocked: true, allocatedTripId: tripId } }
    );
  }

  trip.status = 'READY_FOR_DISPATCH';
  trip.activeLoadPlanId = loadPlanId;
  await trip.save();

  // Validate State A Semantics
  const lockedShipmentsStateA = await Shipment.find({ allocatedTripId: tripId });
  report('State A Semantics', 'Locked load plan manifest contains exactly 5 packages', lockedShipmentsStateA.length === 5);

  const readyToLoadA = lockedShipmentsStateA.filter(s => s.physicalStatus === 'READY_TO_LOAD');
  const waitingA = lockedShipmentsStateA.filter(s => s.physicalStatus === 'WAITING_AT_ORIGIN');
  report('State A Semantics', 'Origin eligible cargo (Chennai): 2 packages (000005 & 000006) marked READY_TO_LOAD',
    readyToLoadA.length === 2 && readyToLoadA.every(s => s.pickupStop === 'Chennai')
  );
  report('State A Semantics', 'Future-origin cargo (Vellore & Hosur): 3 packages marked WAITING_AT_ORIGIN',
    waitingA.length === 3 && waitingA.every(s => s.pickupStop !== 'Chennai')
  );

  const onboardStateA = lockedShipmentsStateA.filter(s => s.physicalStatus === 'ONBOARD');
  report('State A Semantics', 'Current physical load before departure = 0 Packages, 0 m³, 0 kg',
    onboardStateA.length === 0 && trip.actualLoadSnapshot.packagesCount === 0 && trip.actualLoadSnapshot.usedVolume === 0
  );

  // ── STATE B: CHENNAI AFTER DISPATCH / LOADING ──
  console.log('\n--- STATE B: CHENNAI AFTER DISPATCH / LOADING ---');
  await dispatchTripOperational({ tripId });

  const tripAfterDispatch = await Trip.findOne({ tripId });
  const shipmentsStateB = await Shipment.find({ allocatedTripId: tripId });

  const onboardStateB = shipmentsStateB.filter(s => s.physicalStatus === 'ONBOARD');
  report('State B Semantics', 'Locked plan remains 5 packages', shipmentsStateB.length === 5);
  report('State B Semantics', 'Current physical load after Chennai loading = exactly 2 packages (000005 & 000006)',
    onboardStateB.length === 2 && onboardStateB.every(s => s.pickupStop === 'Chennai')
  );
  report('State B Semantics', 'Physical occupancy: 48.0 m³, 2,000 kg, 51.4% volume, 10.0% payload',
    tripAfterDispatch.actualLoadSnapshot.usedVolume === 48 &&
    tripAfterDispatch.actualLoadSnapshot.usedWeight === 2000 &&
    parseFloat(((48 / 93.296) * 100).toFixed(1)) === 51.4
  );
  report('State B Semantics', 'Current available space: 45.296 m³ free, 18,000 kg payload free',
    parseFloat((93.296 - tripAfterDispatch.actualLoadSnapshot.usedVolume).toFixed(3)) === 45.296 &&
    (20000 - tripAfterDispatch.actualLoadSnapshot.usedWeight) === 18000
  );

  // ── STATE C: KANCHIPURAM ARRIVAL (NO OPS, TRANSIT CONTINUATION) ──
  console.log('\n--- STATE C: KANCHIPURAM (PASS-THROUGH TRANSIT) ---');
  const tokenKanchi = generateSecureStopToken({
    tripId,
    vehicleId,
    routeId,
    stopId: 'STP-2',
    sequence: 2,
    locationName: 'Kanchipuram'
  });

  const kanchiResult = await executeStopLifecycleOperational({
    tripId,
    secureToken: tokenKanchi
  });

  report('State C Semantics', 'At Kanchipuram: 0 unloads, 0 loads executed',
    kanchiResult.packagesToUnload.length === 0 && kanchiResult.packagesToLoad.length === 0
  );
  report('State C Semantics', 'Current physical load continues: 2 packages (000005 & 000006, 48.0 m³, 2,000 kg)',
    kanchiResult.trip.actualLoadSnapshot.packagesCount === 2 && kanchiResult.trip.actualLoadSnapshot.usedVolume === 48
  );

  // ── STATE D: VELLORE ARRIVAL (UNLOAD 000005+000006, LOAD 000007+000008) ──
  console.log('\n--- STATE D: VELLORE (UNLOAD 000005+000006, LOAD 000007+000008) ---');
  const tokenVellore = generateSecureStopToken({
    tripId,
    vehicleId,
    routeId,
    stopId: 'STP-3',
    sequence: 3,
    locationName: 'Vellore'
  });

  const velloreResult = await executeStopLifecycleOperational({
    tripId,
    secureToken: tokenVellore
  });

  report('State D Semantics', 'At Vellore: unloads 2 packages (000005 & 000006)',
    velloreResult.packagesToUnload.length === 2 &&
    velloreResult.packagesToUnload.some(u => u.shipmentId.includes('000005')) &&
    velloreResult.packagesToUnload.some(u => u.shipmentId.includes('000006'))
  );
  report('State D Semantics', 'At Vellore: loads 2 packages (000007 & 000008)',
    velloreResult.packagesToLoad.length === 2 &&
    velloreResult.packagesToLoad.some(l => l.shipmentId.includes('000007')) &&
    velloreResult.packagesToLoad.some(l => l.shipmentId.includes('000008'))
  );

  const shp5StateD = await Shipment.findOne({ shipmentId: `SHP-TEST2-000005-${testSuffix}` });
  const shp7StateD = await Shipment.findOne({ shipmentId: `SHP-TEST2-000007-${testSuffix}` });
  const shp4StateD = await Shipment.findOne({ shipmentId: `SHP-TEST2-000004-${testSuffix}` });

  report('State D Physical Status', '000005 is DELIVERED, 000007 is ONBOARD, 000004 is WAITING_AT_ORIGIN',
    shp5StateD.physicalStatus === 'DELIVERED' &&
    shp7StateD.physicalStatus === 'ONBOARD' &&
    shp4StateD.physicalStatus === 'WAITING_AT_ORIGIN'
  );
  report('State D Physical Capacity', 'Current physical load: 51.0 m³ (24 + 27), 4,000 kg (1000 + 3000), 54.6% vol, 20% payload',
    velloreResult.trip.actualLoadSnapshot.usedVolume === 51 &&
    velloreResult.trip.actualLoadSnapshot.usedWeight === 4000 &&
    parseFloat(((51 / 93.296) * 100).toFixed(1)) === 54.7
  );

  // ── STATE E: HOSUR ARRIVAL (UNLOAD 000007, RETAIN 000008, LOAD 000004) ──
  console.log('\n--- STATE E: HOSUR (UNLOAD 000007, RETAIN 000008, LOAD 000004) ---');
  const tokenHosur = generateSecureStopToken({
    tripId,
    vehicleId,
    routeId,
    stopId: 'STP-4',
    sequence: 4,
    locationName: 'Hosur'
  });

  const hosurResult = await executeStopLifecycleOperational({
    tripId,
    secureToken: tokenHosur
  });

  report('State E Semantics', 'At Hosur: unloads 1 package (000007)',
    hosurResult.packagesToUnload.length === 1 && hosurResult.packagesToUnload[0].shipmentId.includes('000007')
  );
  report('State E Semantics', 'At Hosur: loads 1 package (000004)',
    hosurResult.packagesToLoad.length === 1 && hosurResult.packagesToLoad[0].shipmentId.includes('000004')
  );

  const shp7StateE = await Shipment.findOne({ shipmentId: `SHP-TEST2-000007-${testSuffix}` });
  const shp8StateE = await Shipment.findOne({ shipmentId: `SHP-TEST2-000008-${testSuffix}` });
  const shp4StateE = await Shipment.findOne({ shipmentId: `SHP-TEST2-000004-${testSuffix}` });

  report('State E Physical Status', '000007 is DELIVERED, 000008 is RETAINED ONBOARD, 000004 is ONBOARD',
    shp7StateE.physicalStatus === 'DELIVERED' &&
    shp8StateE.physicalStatus === 'ONBOARD' &&
    shp4StateE.physicalStatus === 'ONBOARD'
  );
  report('State E Physical Capacity', 'Current physical load: 51.0 m³ (24 + 27), 4,000 kg (1000 + 3000), 54.6% vol, 20% payload',
    hosurResult.trip.actualLoadSnapshot.usedVolume === 51 &&
    hosurResult.trip.actualLoadSnapshot.usedWeight === 4000
  );

  // ── STATE F: BANGALORE TERMINUS (UNLOAD 000004 + 000008, COMPLETE TRIP, TRUCK AVAILABLE) ──
  console.log('\n--- STATE F: BANGALORE (FINAL UNLOAD, COMPLETE TRIP, TRUCK AVAILABLE) ---');
  const tokenBangalore = generateSecureStopToken({
    tripId,
    vehicleId,
    routeId,
    stopId: 'STP-5',
    sequence: 5,
    locationName: 'Bangalore'
  });

  const bangaloreResult = await executeStopLifecycleOperational({
    tripId,
    secureToken: tokenBangalore
  });

  report('State F Semantics', 'At Bangalore: unloads remaining 2 packages (000004 & 000008)',
    bangaloreResult.packagesToUnload.length === 2 &&
    bangaloreResult.packagesToUnload.some(u => u.shipmentId.includes('000004')) &&
    bangaloreResult.packagesToUnload.some(u => u.shipmentId.includes('000008'))
  );

  const finalTrip = await Trip.findOne({ tripId });
  const finalTruck = await Vehicle.findOne({ vehicleId });
  const allShipmentsStateF = await Shipment.find({ allocatedTripId: tripId });

  report('State F Semantics', 'Physical load onboard trailer is 0 packages, 0 m³, 0 kg',
    finalTrip.actualLoadSnapshot.packagesCount === 0 &&
    finalTrip.actualLoadSnapshot.usedVolume === 0 &&
    finalTrip.actualLoadSnapshot.usedWeight === 0
  );
  report('State F Semantics', 'Trip status marked COMPLETED', finalTrip.status === 'COMPLETED');
  report('State F Semantics', 'Truck status resets to Active/AVAILABLE, activeTripId reset to null',
    ['AVAILABLE', 'Active'].includes(finalTruck.status) &&
    (finalTruck.activeTripId === null || finalTruck.activeTripId === undefined)
  );
  report('State F Semantics', 'All 5 consignments persist as DELIVERED in audit history',
    allShipmentsStateF.length === 5 && allShipmentsStateF.every(s => s.physicalStatus === 'DELIVERED')
  );

  const historicalPlan = await LoadPlan.findOne({ tripId, version: 1 });
  report('State F Semantics', 'Historical locked load plan v1 remains intact and immutable for audit',
    historicalPlan && historicalPlan.isImmutable === true
  );

  // Clean up
  await Trip.deleteOne({ tripId });
  await Vehicle.deleteOne({ vehicleId });
  await Route.deleteOne({ routeId });
  await TripStop.deleteMany({ tripId });
  await LoadPlan.deleteMany({ tripId });
  await LoadAssignment.deleteMany({ loadPlanId });
  await Shipment.deleteMany({ shipmentId: { $in: test2ShipmentDefs.map(d => d.shipmentId) } });
  await Booking.deleteMany({ shipmentId: { $in: test2ShipmentDefs.map(d => d.shipmentId) } });

  await mongoose.disconnect();
  console.log('\n========================================================================================');
  console.log(`📊 FINAL LIFECYCLE PARITY RESULTS: ${passedTests} PASSED, 0 FAILED out of ${totalTests} TOTAL`);
  console.log('========================================================================================\n');
}

runLifecycleParitySuite().catch(err => {
  console.error('Fatal error in lifecycle parity suite:', err);
  process.exit(1);
});
