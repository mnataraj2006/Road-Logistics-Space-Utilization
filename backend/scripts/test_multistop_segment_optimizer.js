import { generateLoadPlan } from '../optimizer/index.js';
import { SpatialEngine } from '../optimizer/spatialEngine.js';

console.log('=================================================================');
console.log('RUNNING MULTI-STOP SEGMENT OPTIMIZER TEST SUITE');
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

const defaultTruck = {
  vehicleId: 'TN-01',
  type: 'Heavy Truck',
  dimensions: { length: 13.6, width: 2.45, height: 2.8 },
  capacityVolume: 93.3,
  capacityWeight: 20000
};

const defaultRoute = {
  routeId: 'CHN-BLR-EXP',
  source: 'Chennai',
  destination: 'Bangalore',
  stops: ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore']
};

// -------------------------------------------------------------
// TEST 1: The 5-Package Multi-Stop Corridor (Total 123 m³, Peak 51 m³)
// -------------------------------------------------------------
const test1Packages = [
  {
    shipmentId: 'SHP-BKG-000005',
    pickup: 'Chennai',
    delivery: 'Vellore',
    volume: 24.0,
    weight: 1000,
    dimensions: { length: 3.0, width: 2.0, height: 2.0 },
    fragile: false,
    stackable: true,
    priority: 'STANDARD'
  },
  {
    shipmentId: 'SHP-BKG-000006',
    pickup: 'Chennai',
    delivery: 'Vellore',
    volume: 24.0,
    weight: 1000,
    dimensions: { length: 3.0, width: 2.0, height: 2.0 },
    fragile: false,
    stackable: true,
    priority: 'STANDARD'
  },
  {
    shipmentId: 'SHP-BKG-000007',
    pickup: 'Vellore',
    delivery: 'Hosur',
    volume: 24.0,
    weight: 1000,
    dimensions: { length: 3.0, width: 2.0, height: 2.0 },
    fragile: false,
    stackable: true,
    priority: 'STANDARD'
  },
  {
    shipmentId: 'SHP-BKG-000008',
    pickup: 'Vellore',
    delivery: 'Bangalore',
    volume: 27.0,
    weight: 3000,
    dimensions: { length: 3.0, width: 2.0, height: 2.25 },
    fragile: false,
    stackable: true,
    priority: 'STANDARD'
  },
  {
    shipmentId: 'SHP-BKG-000004',
    pickup: 'Hosur',
    delivery: 'Bangalore',
    volume: 24.0,
    weight: 1000,
    dimensions: { length: 3.0, width: 2.0, height: 2.0 },
    fragile: false,
    stackable: true,
    priority: 'STANDARD'
  }
];

const result1 = generateLoadPlan({
  truck: defaultTruck,
  route: defaultRoute,
  shipments: test1Packages,
  currentLoad: [],
  config: {}
});

assert(
  result1.assignments.length === 5,
  'TEST 1: All 5 multi-stop packages allocated successfully despite global sum 123m³ > 93.3m³',
  `Allocated count: ${result1.assignments.length}, Unassigned: ${result1.unassignedShipments.map(u => u.reason).join(', ')}`
);

assert(
  result1.peakVolumeUtilization <= 60.0 && result1.peakVolumeUtilization >= 50.0,
  'TEST 1: Peak volume utilization reflects simultaneous peak (~54.7%)',
  `Actual peak volume utilization: ${result1.peakVolumeUtilization}%`
);

// -------------------------------------------------------------
// TEST 2: Package Exceeding Truck Physical Boundaries (All Orientations > Truck Bounds)
// -------------------------------------------------------------
const test2Packages = [
  {
    shipmentId: 'SHP-OVERSIZED-01',
    pickup: 'Chennai',
    delivery: 'Bangalore',
    volume: 135.0,
    weight: 1000,
    dimensions: { length: 15.0, width: 3.0, height: 3.0 }, // 15m > 13.6m length, 3.0m > 2.45m width, 3.0m > 2.8m height
    fragile: false,
    stackable: true,
    priority: 'STANDARD'
  }
];

const result2 = generateLoadPlan({
  truck: defaultTruck,
  route: defaultRoute,
  shipments: test2Packages,
  currentLoad: [],
  config: {}
});

assert(
  result2.unassignedShipments.length === 1 && result2.assignments.length === 0,
  'TEST 2: Oversized package exceeding truck dimensions (15m x 3m x 3m) is strictly rejected',
  `Result unassigned: ${JSON.stringify(result2.unassignedShipments)}`
);

// -------------------------------------------------------------
// TEST 3: Collision on Shared Route Segment
// -------------------------------------------------------------
const spatialTest3 = new SpatialEngine(defaultTruck.dimensions);
const boxA = { x: 0, y: 0, z: 0, dx: 4.0, dy: 2.0, dz: 2.0 };
const boxB = { x: 2.0, y: 0, z: 0, dx: 4.0, dy: 2.0, dz: 2.0 }; // Overlaps with boxA from X: 2.0 to 4.0

const segChennaiToVellore = { fromIndex: 0, toIndex: 2, fromStop: 'Chennai', toStop: 'Vellore' };

spatialTest3.placeBox(
  { shipmentId: 'PKG-A', segmentRange: segChennaiToVellore },
  { position: { x: 0, y: 0, z: 0 }, dims: { dx: 4.0, dy: 2.0, dz: 2.0 } }
);

const collisionOnSameSegment = spatialTest3.hasCollision(boxB, segChennaiToVellore);
assert(
  collisionOnSameSegment === true,
  'TEST 3: Collision overlap detected when packages coexist on the SAME route segment'
);

// -------------------------------------------------------------
// TEST 4: Non-Overlapping Route Segments (ZERO False Collision)
// -------------------------------------------------------------
const segVelloreToBangalore = { fromIndex: 2, toIndex: 4, fromStop: 'Vellore', toStop: 'Bangalore' };
const collisionOnDisjointSegment = spatialTest3.hasCollision(boxB, segVelloreToBangalore);

assert(
  collisionOnDisjointSegment === false,
  'TEST 4: NO collision reported when packages share coordinates on NON-OVERLAPPING route segments'
);

// -------------------------------------------------------------
// TEST 5: Single Segment Overflow (> 93.3 m³)
// -------------------------------------------------------------
const test5Packages = [
  {
    shipmentId: 'SHP-OVERFLOW-01',
    pickup: 'Chennai',
    delivery: 'Vellore',
    volume: 60.0,
    weight: 5000,
    dimensions: { length: 8.0, width: 2.4, height: 2.5 },
    fragile: false,
    stackable: true,
    priority: 'STANDARD'
  },
  {
    shipmentId: 'SHP-OVERFLOW-02',
    pickup: 'Chennai',
    delivery: 'Vellore',
    volume: 50.0,
    weight: 5000,
    dimensions: { length: 7.0, width: 2.4, height: 2.5 },
    fragile: false,
    stackable: true,
    priority: 'STANDARD'
  }
];

const result5 = generateLoadPlan({
  truck: defaultTruck,
  route: defaultRoute,
  shipments: test5Packages,
  currentLoad: [],
  config: {}
});

assert(
  result5.assignments.length === 1 && result5.unassignedShipments.length === 1,
  'TEST 5: Single segment exceeding capacity (110m³ > 93.3m³) allocates only what fits and reports overflow',
  `Allocated count: ${result5.assignments.length}, Unassigned: ${result5.unassignedShipments.length}`
);

console.log('\n=================================================================');
console.log(`TEST RESULTS: ${passCount} PASSED, ${failCount} FAILED`);
console.log('=================================================================');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
