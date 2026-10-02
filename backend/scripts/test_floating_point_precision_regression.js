import { generateLoadPlan, GEOMETRY_EPSILON } from '../optimizer/index.js';
import { validatePackageWithinTruck } from '../optimizer/validator.js';

let totalTests = 0;
let passedTests = 0;

const assert = (condition, testName, details = '') => {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAILED: ${testName} - ${details}`);
    throw new Error(`Test assertion failed: ${testName}`);
  }
  passedTests++;
  console.log(`✅ PASSED: ${testName}`);
};

console.log('===============================================================');
console.log('RUNNING OPTIMIZER FLOATING-POINT PRECISION REGRESSION TEST SUITE');
console.log('===============================================================\n');

const standardTruck = {
  vehicleId: 'TRK-PRECISION-1',
  capacityVolume: 100,
  capacityWeight: 20000,
  dimensions: { length: 13.6, width: 2.45, height: 3.0 },
  status: 'Active'
};

const routeAB = {
  routeId: 'RTE-AB',
  stops: ['Chennai', 'Bengaluru'],
  distance: 350
};

// ---------------------------------------------------------------------------
// TEST 1: Exact boundary fit (Both volume-derived and explicit-dimension)
// ---------------------------------------------------------------------------
console.log('--- TEST 1: Exact Boundary Fit ---');
// Part A: Volume derived exact 100% fill (50m³ + 50m³ on 100m³ truck)
const shipmentsVol100 = [
  { shipmentId: 'EXACT-VOL-1', pickup: 'Chennai', delivery: 'Bengaluru', volume: 50, weight: 8000 },
  { shipmentId: 'EXACT-VOL-2', pickup: 'Chennai', delivery: 'Bengaluru', volume: 50, weight: 8000 }
];
const resVol100 = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: shipmentsVol100 });
assert(resVol100.assignments.length === 2, 'Test 1A - Volume derived: Both 50m³ items fit 100m³ truck exactly');
assert(resVol100.peakVolumeUtilization === 100.0, 'Test 1A - Volume derived: Exactly 100.0% volume utilization');

// Part B: Explicit dimensions exact fit (6.8m + 6.8m = 13.6m trailer length)
const shipmentsDims100 = [
  { shipmentId: 'EXACT-DIM-1', pickup: 'Chennai', delivery: 'Bengaluru', volume: 45, weight: 8000, dimensions: { length: 6.8, width: 2.45, height: 2.8 } },
  { shipmentId: 'EXACT-DIM-2', pickup: 'Chennai', delivery: 'Bengaluru', volume: 45, weight: 8000, dimensions: { length: 6.8, width: 2.45, height: 2.8 } }
];
const resDims100 = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: shipmentsDims100 });
assert(resDims100.assignments.length === 2, 'Test 1B - Explicit dimensions: Two 6.8m items fit 13.6m trailer exactly');
assert(resDims100.unassignedShipments.length === 0, 'Test 1B - Explicit dimensions: 0 unassigned shipments');

// ---------------------------------------------------------------------------
// TEST 2: Floating-point representation boundary
// ---------------------------------------------------------------------------
console.log('\n--- TEST 2: Floating-Point Representation Boundary ---');
// Sub-millimeter floating point fuzz on dimensions: 6.800000000000001m and 6.8m
const fpValidation = validatePackageWithinTruck({
  position: { x: 6.8, y: 0, z: 0 },
  dimensions: { dx: 6.800000000000001, dy: 2.45, dz: 2.8 },
  truckDimensions: { length: 13.6, width: 2.45, height: 2.8 }
});
assert(fpValidation.valid === true, 'Test 2 - IEEE-754 epsilon noise does not reject valid boundary fit');

// ---------------------------------------------------------------------------
// TEST 3: Genuine overflow rejection
// ---------------------------------------------------------------------------
console.log('\n--- TEST 3: Genuine Physical Overflow Rejection ---');
const shipmentsOverflow = [
  { shipmentId: 'OVERFLOW-1', pickup: 'Chennai', delivery: 'Bengaluru', volume: 45, weight: 8000, dimensions: { length: 6.8, width: 2.45, height: 2.8 } },
  { shipmentId: 'OVERFLOW-2', pickup: 'Chennai', delivery: 'Bengaluru', volume: 45, weight: 8000, dimensions: { length: 6.82, width: 2.45, height: 2.8 } }
];
const resOverflow = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: shipmentsOverflow });
assert(resOverflow.assignments.length === 1, 'Test 3 - Genuine overflow: Only 1 shipment accepted');
assert(resOverflow.unassignedShipments.length === 1, 'Test 3 - Genuine overflow: 6.82m package exceeding 13.6m rejected');

// ---------------------------------------------------------------------------
// TEST 4: Near-fit valid placement
// ---------------------------------------------------------------------------
console.log('\n--- TEST 4: Near-Fit Valid Placement ---');
const shipmentsNearFit = [
  { shipmentId: 'NEARFIT-1', pickup: 'Chennai', delivery: 'Bengaluru', volume: 45, weight: 8000, dimensions: { length: 6.8, width: 2.45, height: 2.8 } },
  { shipmentId: 'NEARFIT-2', pickup: 'Chennai', delivery: 'Bengaluru', volume: 45, weight: 8000, dimensions: { length: 6.79, width: 2.45, height: 2.8 } }
];
const resNearFit = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: shipmentsNearFit });
assert(resNearFit.assignments.length === 2, 'Test 4 - Near fit: 6.8m + 6.79m = 13.59m fits cleanly inside 13.6m trailer');

// ---------------------------------------------------------------------------
// TEST 5: Near-overflow invalid placement (exceeds by 1mm)
// ---------------------------------------------------------------------------
console.log('\n--- TEST 5: Near-Overflow Invalid Placement (1mm Overflow) ---');
const nearOverflowCheck = validatePackageWithinTruck({
  position: { x: 6.8, y: 0, z: 0 },
  dimensions: { dx: 6.801, dy: 2.45, dz: 2.8 }, // 6.8 + 6.801 = 13.601m > 13.6m (1mm overflow)
  truckDimensions: { length: 13.6, width: 2.45, height: 2.8 }
});
assert(nearOverflowCheck.valid === false, 'Test 5 - 1mm physical boundary overflow is strictly rejected');
assert(nearOverflowCheck.violations[0].boundary === 'REAR_DOOR', 'Test 5 - Rejection correctly identified as REAR_DOOR');

// ---------------------------------------------------------------------------
// TEST 6: Rotated exact-fit cargo
// ---------------------------------------------------------------------------
console.log('\n--- TEST 6: Rotated Exact-Fit Cargo ---');
// Item 1 has length 2.45m and width 6.8m, which requires horizontal rotation to dx=6.8m, dy=2.45m
const shipmentsRotated = [
  { shipmentId: 'ROTATE-1', pickup: 'Chennai', delivery: 'Bengaluru', volume: 45, weight: 8000, dimensions: { length: 2.45, width: 6.8, height: 2.8 }, allowRotation: true },
  { shipmentId: 'ROTATE-2', pickup: 'Chennai', delivery: 'Bengaluru', volume: 45, weight: 8000, dimensions: { length: 6.8, width: 2.45, height: 2.8 } }
];
const resRotated = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: shipmentsRotated });
assert(resRotated.assignments.length === 2, 'Test 6 - Rotated item fits exact boundary along with second item');
const rotatedAssignment = resRotated.assignments.find(a => a.shipmentId === 'ROTATE-1');
assert(rotatedAssignment.orientation === 'ROTATED_90', 'Test 6 - Orientation is ROTATED_90');
assert(Math.abs(rotatedAssignment.dimensions.dx - 6.8) < 1e-6, 'Test 6 - Rotated dx is 6.8m');

// ---------------------------------------------------------------------------
// TEST 7: Multi-cargo packing
// ---------------------------------------------------------------------------
console.log('\n--- TEST 7: Multi-Cargo Packing ---');
const shipmentsMulti = [
  { shipmentId: 'MC-1', pickup: 'Chennai', delivery: 'Bengaluru', volume: 15, weight: 2000, dimensions: { length: 2.0, width: 1.2, height: 1.4 } },
  { shipmentId: 'MC-2', pickup: 'Chennai', delivery: 'Bengaluru', volume: 15, weight: 2000, dimensions: { length: 2.0, width: 1.2, height: 1.4 } },
  { shipmentId: 'MC-3', pickup: 'Chennai', delivery: 'Bengaluru', volume: 15, weight: 2000, dimensions: { length: 2.0, width: 1.2, height: 1.4 } },
  { shipmentId: 'MC-4', pickup: 'Chennai', delivery: 'Bengaluru', volume: 15, weight: 2000, dimensions: { length: 2.0, width: 1.2, height: 1.4 } },
  { shipmentId: 'MC-5', pickup: 'Chennai', delivery: 'Bengaluru', volume: 10, weight: 1500, dimensions: { length: 1.5, width: 1.2, height: 1.4 } },
  { shipmentId: 'MC-6', pickup: 'Chennai', delivery: 'Bengaluru', volume: 10, weight: 1500, dimensions: { length: 1.5, width: 1.2, height: 1.4 } }
];
const resMulti = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: shipmentsMulti });
assert(resMulti.assignments.length === 6, 'Test 7 - All 6 multi-cargo items packed successfully');
assert(resMulti.unassignedShipments.length === 0, 'Test 7 - 0 unassigned shipments in multi-cargo test');

// ---------------------------------------------------------------------------
// TEST 8: Multi-hop packing with route segment capacity
// ---------------------------------------------------------------------------
console.log('\n--- TEST 8: Multi-Hop Route Segment Capacity ---');
const routeABC = {
  routeId: 'RTE-ABC',
  stops: ['Chennai', 'Salem', 'Coimbatore'],
  distance: 500
};
const shipmentsMultiHop = [
  { shipmentId: 'MH-1-CS', pickup: 'Chennai', delivery: 'Salem', volume: 50, weight: 8000 },
  { shipmentId: 'MH-2-SC', pickup: 'Salem', delivery: 'Coimbatore', volume: 50, weight: 8000 },
  { shipmentId: 'MH-3-CC', pickup: 'Chennai', delivery: 'Coimbatore', volume: 50, weight: 8000 }
];
const resMultiHop = generateLoadPlan({ truck: standardTruck, route: routeABC, shipments: shipmentsMultiHop });
assert(resMultiHop.assignments.length === 3, 'Test 8 - Multi-hop: All 3 non-overlapping shipments packed (100% on each leg)');
assert(resMultiHop.peakVolumeUtilization === 100.0, 'Test 8 - Multi-hop: Peak volume utilization reaches exactly 100.0%');

console.log('\n===============================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} FLOATING-POINT PRECISION REGRESSION TESTS PASSED!`);
console.log('===============================================================\n');
