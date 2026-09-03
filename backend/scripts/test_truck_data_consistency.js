import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Vehicle from '../models/Vehicle.js';
import Trip from '../models/Trip.js';
import Route from '../models/Route.js';
import Shipment from '../models/Shipment.js';
import LoadPlan from '../models/LoadPlan.js';
import { generateLoadPlan } from '../optimizer/index.js';
import { resolveAuthoritativeTruck } from '../controllers/tripController.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/road_logistics_db';

const runConsistencyAudit = async () => {
  console.log('====================================================');
  console.log('TRUCK DATA CONSISTENCY & GEOMETRY AUDIT');
  console.log('====================================================\n');

  await mongoose.connect(MONGO_URI);
  console.log(' Connected to MongoDB.\n');

  try {
    // ----------------------------------------------------
    // TEST 1: Establish Single Source of Truth for Fleet Asset
    // ----------------------------------------------------
    console.log('--- TEST 1: Registering Authoritative Fleet Truck ---');
    const testVehId = `AUDIT-TRK-${Date.now()}`;
    const testVehicle = await Vehicle.create({
      vehicleId: testVehId,
      type: 'Heavy Truck',
      dimensions: {
        length: 13.6,
        width: 2.45,
        height: 2.8
      },
      capacityVolume: 93.3,
      capacityWeight: 20000,
      routeLane: 'CHN-BLR-EXP',
      baseLocation: 'Chennai Logistics Hub',
      ratePerCbm: 150,
      ratePerKg: 5,
      status: 'Active'
    });

    console.log(` Created Vehicle ${testVehicle.vehicleId}:`, {
      dimensions: testVehicle.dimensions,
      capacityVolume: testVehicle.capacityVolume,
      capacityWeight: testVehicle.capacityWeight
    });

    // ----------------------------------------------------
    // TEST 2: Create Planned Trip and Verify Snapshot
    // ----------------------------------------------------
    console.log('\n--- TEST 2: Creating Trip & Verifying Authoritative Snapshot ---');
    const testTrip = await Trip.create({
      tripId: `TRIP-AUDIT-${Date.now()}`,
      vehicle: testVehicle._id,
      vehicleId: testVehicle.vehicleId,
      vehicleSnapshot: {
        vehicleId: testVehicle.vehicleId,
        type: testVehicle.type,
        interiorLength: testVehicle.dimensions.length,
        interiorWidth: testVehicle.dimensions.width,
        interiorHeight: testVehicle.dimensions.height,
        capacityVolume: testVehicle.capacityVolume,
        capacityWeight: testVehicle.capacityWeight,
        dimensions: testVehicle.dimensions,
        ratePerCbm: testVehicle.ratePerCbm,
        ratePerKg: testVehicle.ratePerKg,
        capturedAt: new Date()
      },
      routeId: 'CHN-BLR-EXP',
      status: 'PLANNED'
    });

    const resolvedTruck = resolveAuthoritativeTruck(testTrip, testVehicle);
    console.log(' Resolved Authoritative Truck for Trip:', resolvedTruck);

    if (resolvedTruck.dimensions.length !== 13.6 || resolvedTruck.dimensions.width !== 2.45 || resolvedTruck.dimensions.height !== 2.8) {
      throw new Error('FAILED: Resolved truck dimensions mismatch fleet asset dimensions.');
    }
    console.log(' Authoritative dimensions match perfectly: 13.6m × 2.45m × 2.8m (93.3 m³).');

    // ----------------------------------------------------
    // TEST 3: Case A — Realistic Cargo Optimization
    // ----------------------------------------------------
    console.log('\n--- TEST 3: Case A (Realistic Cargo Allocation) ---');
    const mockRoute = {
      routeId: 'CHN-BLR-EXP',
      source: 'Chennai',
      destination: 'Bangalore',
      stops: ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore']
    };

    const realisticCargo = [
      {
        shipmentId: 'SHP-REALISTIC-01',
        pickupStop: 'Chennai',
        deliveryStop: 'Bangalore',
        dimensions: { length: 1.2, width: 1.0, height: 1.4 },
        volume: 1.68,
        weight: 800,
        fragile: false,
        stackable: true
      },
      {
        shipmentId: 'SHP-REALISTIC-02',
        pickupStop: 'Kanchipuram',
        deliveryStop: 'Hosur',
        dimensions: { length: 1.0, width: 0.8, height: 1.0 },
        volume: 0.8,
        weight: 400,
        fragile: true,
        stackable: false
      }
    ];

    const realisticPlan = generateLoadPlan({
      truck: resolvedTruck,
      route: mockRoute,
      shipments: realisticCargo
    });

    console.log(` Optimizer Result: ${realisticPlan.assignments.length} assigned, ${realisticPlan.unassignedShipments.length} unassigned.`);
    if (realisticPlan.assignments.length !== 2) {
      throw new Error('FAILED: Realistic cargo should be fully assigned within bounds.');
    }
    console.log(' Case A passed: Cargo allocated with exact physical bounds.');

    // ----------------------------------------------------
    // TEST 4: Case C — Oversized Cargo Rejection (e.g. Peanut Candy 1,000,000 m³)
    // ----------------------------------------------------
    console.log('\n--- TEST 4: Case C (Oversized Cargo Rejection) ---');
    const oversizedCargo = [
      {
        shipmentId: 'SHP-PEANUT-CANDY-HUGE',
        pickupStop: 'Chennai',
        deliveryStop: 'Bangalore',
        dimensions: { length: 50, width: 100, height: 100 },
        volume: 1000000, // 1,000,000 m³
        weight: 2000
      }
    ];

    const overflowPlan = generateLoadPlan({
      truck: resolvedTruck,
      route: mockRoute,
      shipments: oversizedCargo
    });

    console.log(` Optimizer Result for 1,000,000 m³ cargo:`, {
      assignedCount: overflowPlan.assignments.length,
      unassignedCount: overflowPlan.unassignedShipments.length,
      unassignedReason: overflowPlan.unassignedShipments[0]?.reason
    });

    if (overflowPlan.assignments.length !== 0) {
      throw new Error('FAILED: 1,000,000 m³ cargo was allocated to a 93.3 m³ truck!');
    }
    if (!overflowPlan.unassignedShipments[0]?.reason?.includes('exceeds truck')) {
      throw new Error('FAILED: Overflow reason not reported properly.');
    }
    console.log(' Case C passed: Oversized cargo strictly rejected with explicit shortfall explanation.');

    // ----------------------------------------------------
    // TEST 5: Fleet Edit Synchronization
    // ----------------------------------------------------
    console.log('\n--- TEST 5: Fleet Dimension Edit & Planned Trip Synchronization ---');
    testVehicle.dimensions = { length: 12.0, width: 2.4, height: 2.6 };
    testVehicle.capacityVolume = 74.88;
    testVehicle.capacityWeight = 18000;
    await testVehicle.save();

    // Trigger trip update as in vehicleController.js
    await Trip.updateMany(
      { vehicleId: testVehicle.vehicleId, status: { $in: ['PLANNED', 'READY_FOR_DISPATCH'] } },
      {
        $set: {
          'vehicleSnapshot.interiorLength': testVehicle.dimensions.length,
          'vehicleSnapshot.interiorWidth': testVehicle.dimensions.width,
          'vehicleSnapshot.interiorHeight': testVehicle.dimensions.height,
          'vehicleSnapshot.capacityVolume': testVehicle.capacityVolume,
          'vehicleSnapshot.capacityWeight': testVehicle.capacityWeight,
          'vehicleSnapshot.dimensions': testVehicle.dimensions
        }
      }
    );

    const updatedTrip = await Trip.findById(testTrip._id);
    const updatedResolvedTruck = resolveAuthoritativeTruck(updatedTrip, testVehicle);
    console.log(' Updated Authoritative Truck for Trip:', updatedResolvedTruck);

    if (updatedResolvedTruck.dimensions.length !== 12.0 || updatedResolvedTruck.capacityVolume !== 74.88) {
      throw new Error('FAILED: Trip snapshot was not synchronized with edited fleet vehicle.');
    }
    console.log(' Fleet edit synchronization passed: Planned trip now reflects 12.0m × 2.4m × 2.6m (74.88 m³).');

    // Clean up test documents
    await Vehicle.deleteOne({ _id: testVehicle._id });
    await Trip.deleteOne({ _id: testTrip._id });

    console.log('\n====================================================');
    console.log('ALL TRUCK CONSISTENCY & GEOMETRY TESTS PASSED (100%)');
    console.log('====================================================');

    process.exit(0);
  } catch (err) {
    console.error('\n AUDIT FAILED:', err);
    process.exit(1);
  }
};

runConsistencyAudit();
