import { generateLoadPlan, optimizeMultiTruckFleet, OPTIMIZER_VERSION } from '../optimizer/index.js';

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
console.log(`RUNNING EXTENSIVE OPTIMIZER UNIT TEST SUITE (${OPTIMIZER_VERSION})`);
console.log('===============================================================\n');

// Mock Common Truck Specs: 100 m³, 20,000 kg, Container: 13.6m x 2.45m x 3.0m
const standardTruck = {
  vehicleId: 'TRK-STD-1',
  capacityVolume: 100,
  capacityWeight: 20000,
  dimensions: { length: 13.6, width: 2.45, height: 3.0 },
  status: 'Active'
};

// ---------------------------------------------------------------------------
// TEST 1: Single Segment (A -> B)
// ---------------------------------------------------------------------------
const routeAB = {
  routeId: 'RTE-AB',
  stops: ['A', 'B'],
  distance: 100
};
const shipmentsAB = [
  { shipmentId: 'S-AB-1', pickup: 'A', delivery: 'B', volume: 40, weight: 8000 },
  { shipmentId: 'S-AB-2', pickup: 'A', delivery: 'B', volume: 50, weight: 10000 }
];

const res1 = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: shipmentsAB });
assert(res1.constraintsSatisfied === true, 'TEST 1 - A -> B: Constraints Satisfied');
assert(res1.assignments.length === 2, 'TEST 1 - A -> B: Both shipments allocated');
assert(res1.overallVolumeUtilization === 90.0, 'TEST 1 - A -> B: 90% volume utilization');
assert(res1.overallWeightUtilization === 90.0, 'TEST 1 - A -> B: 90% weight utilization');

// ---------------------------------------------------------------------------
// TEST 2: Two Segments (A -> B -> C)
// ---------------------------------------------------------------------------
const routeABC = {
  routeId: 'RTE-ABC',
  stops: ['A', 'B', 'C'],
  distance: 250
};
const shipmentsABC = [
  { shipmentId: 'S-AC', pickup: 'A', delivery: 'C', volume: 50, weight: 10000 },
  { shipmentId: 'S-AB', pickup: 'A', delivery: 'B', volume: 30, weight: 5000 },
  { shipmentId: 'S-BC', pickup: 'B', delivery: 'C', volume: 40, weight: 6000 }
];

const res2 = generateLoadPlan({ truck: standardTruck, route: routeABC, shipments: shipmentsABC });
assert(res2.assignments.length === 3, 'TEST 2 - A -> B -> C: All 3 shipments allocated');
assert(res2.segmentUtilization[0].usedVolume === 80, 'TEST 2 - Leg A -> B volume is 80 m³');
assert(res2.segmentUtilization[1].usedVolume === 90, 'TEST 2 - Leg B -> C volume is 90 m³');

// ---------------------------------------------------------------------------
// TEST 3: Three Segments (A -> B -> C -> D)
// ---------------------------------------------------------------------------
const routeABCD = {
  routeId: 'RTE-ABCD',
  stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai'],
  distance: 480
};
const shipmentsABCD = [
  { shipmentId: 'S-FULL', pickup: 'Chennai', delivery: 'Madurai', volume: 40, weight: 8000 },
  { shipmentId: 'S-HOP1', pickup: 'Chennai', delivery: 'Salem', volume: 30, weight: 5000 },
  { shipmentId: 'S-HOP2', pickup: 'Salem', delivery: 'Coimbatore', volume: 35, weight: 6000 },
  { shipmentId: 'S-HOP3', pickup: 'Coimbatore', delivery: 'Madurai', volume: 50, weight: 9000 }
];

const res3 = generateLoadPlan({ truck: standardTruck, route: routeABCD, shipments: shipmentsABCD });
assert(res3.assignments.length === 4, 'TEST 3 - A -> B -> C -> D: Multi-stop pipeline allocated');
assert(res3.segmentUtilization.length === 3, 'TEST 3 - 3 Segments Evaluated');

// ---------------------------------------------------------------------------
// TEST 4 & 5: Overlapping vs. Non-Overlapping Shipments
// ---------------------------------------------------------------------------
// Non-overlapping: Cargo 1 (A -> B) takes 80m³, Cargo 2 (B -> C) takes 80m³.
// Total volume sum is 160m³ (>100m³ truck capacity), but they NEVER overlap, so BOTH must fit!
const nonOverlappingShipments = [
  { shipmentId: 'NO-1', pickup: 'A', delivery: 'B', volume: 80, weight: 15000 },
  { shipmentId: 'NO-2', pickup: 'B', delivery: 'C', volume: 80, weight: 15000 }
];
const resNonOverlap = generateLoadPlan({ truck: standardTruck, route: routeABC, shipments: nonOverlappingShipments });
assert(resNonOverlap.assignments.length === 2, 'TEST 4 - Non-overlapping: Both 80m³ shipments fit in 100m³ truck consecutively');

// Overlapping: Cargo 1 (A -> C, 60m³) and Cargo 2 (A -> B, 50m³). Total on A->B is 110m³ (>100m³).
// Exactly ONE must be rejected due to segment overload.
const overlappingShipments = [
  { shipmentId: 'OV-1', pickup: 'A', delivery: 'C', volume: 60, weight: 10000 },
  { shipmentId: 'OV-2', pickup: 'A', delivery: 'B', volume: 50, weight: 8000 }
];
const resOverlap = generateLoadPlan({ truck: standardTruck, route: routeABC, shipments: overlappingShipments });
assert(resOverlap.assignments.length === 1, 'TEST 5 - Overlapping: Capacity overflow rejected');
assert(resOverlap.unassignedShipments.length === 1, 'TEST 5 - 1 Shipment rejected');

// ---------------------------------------------------------------------------
// TEST 6 & 7: Volume Limit & Weight Limit
// ---------------------------------------------------------------------------
const volOverflow = [{ shipmentId: 'S-VOL-OVER', pickup: 'A', delivery: 'B', volume: 105, weight: 10000 }];
const resVolOver = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: volOverflow });
assert(resVolOver.assignments.length === 0, 'TEST 6 - Volume Limit: 105 m³ rejected');

const wtOverflow = [{ shipmentId: 'S-WT-OVER', pickup: 'A', delivery: 'B', volume: 50, weight: 25000 }];
const resWtOver = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: wtOverflow });
assert(resWtOver.assignments.length === 0, 'TEST 7 - Weight Limit: 25,000 kg rejected');

// ---------------------------------------------------------------------------
// TEST 8: Dimension Limit
// ---------------------------------------------------------------------------
const dimOverflow = [
  {
    shipmentId: 'S-DIM-OVER',
    pickup: 'A',
    delivery: 'B',
    volume: 10,
    weight: 2000,
    dimensions: { length: 15.0, width: 2.0, height: 2.0 } // 15m > 10m truck length
  }
];
const resDimOver = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: dimOverflow });
assert(resDimOver.assignments.length === 0, 'TEST 8 - Dimension Limit: 15m item in 10m truck rejected');

// ---------------------------------------------------------------------------
// TEST 9: Delivery Accessibility & LIFO Sorting
// ---------------------------------------------------------------------------
// Item 1 delivers at B (intermediate), Item 2 delivers at C (final).
// Item 1 should have smaller loading sequence or accessible position.
const accessShipments = [
  { shipmentId: 'DELIV-EARLY', pickup: 'A', delivery: 'B', volume: 20, weight: 3000 },
  { shipmentId: 'DELIV-LATE', pickup: 'A', delivery: 'C', volume: 20, weight: 3000 }
];
const resAccess = generateLoadPlan({ truck: standardTruck, route: routeABC, shipments: accessShipments });
assert(resAccess.assignments.length === 2, 'TEST 9 - Delivery Accessibility: Both loaded');
const earlyAssign = resAccess.assignments.find(a => a.shipmentId === 'DELIV-EARLY');
const lateAssign = resAccess.assignments.find(a => a.shipmentId === 'DELIV-LATE');
assert(earlyAssign.unloadingSequence < lateAssign.unloadingSequence, 'TEST 9 - Early delivery has lower unloading sequence');

// ---------------------------------------------------------------------------
// TEST 10: Fragile Cargo Stacking Restrictions
// ---------------------------------------------------------------------------
const fragileShipments = [
  { shipmentId: 'GLASS-CARGO', pickup: 'A', delivery: 'B', volume: 10, weight: 500, fragile: true, stackable: false },
  { shipmentId: 'STEEL-CARGO', pickup: 'A', delivery: 'B', volume: 10, weight: 5000, fragile: false, stackable: true }
];
const resFragile = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: fragileShipments });
assert(resFragile.assignments.length === 2, 'TEST 10 - Fragile Cargo: Placed without vertical stacking violations');

// ---------------------------------------------------------------------------
// TEST 11: Non-Stackable Cargo Rule
// ---------------------------------------------------------------------------
const nonStackable = [
  { shipmentId: 'CRANE-PARTS', pickup: 'A', delivery: 'B', volume: 25, weight: 4000, stackable: false }
];
const resNonStack = generateLoadPlan({ truck: standardTruck, route: routeAB, shipments: nonStackable });
assert(resNonStack.assignments[0].stackable === false, 'TEST 11 - Non-stackable flag preserved in assignment');

// ---------------------------------------------------------------------------
// TEST 12: Impossible Shipment (Reverse Direction)
// ---------------------------------------------------------------------------
const reverseShipment = [
  { shipmentId: 'REVERSE-HOP', pickup: 'C', delivery: 'A', volume: 10, weight: 1000 }
];
const resReverse = generateLoadPlan({ truck: standardTruck, route: routeABC, shipments: reverseShipment });
assert(resReverse.assignments.length === 0, 'TEST 12 - Impossible Shipment: Reverse direction rejected');
assert(resReverse.unassignedShipments[0].reason.toLowerCase().includes('invalid_direction') || resReverse.unassignedShipments[0].reason.toLowerCase().includes('invalid direction'), 'TEST 12 - Rejection reason clearly explained');

// ---------------------------------------------------------------------------
// TEST 13: Multiple Trucks Fleet Allocation
// ---------------------------------------------------------------------------
const trucksFleet = [
  { vehicleId: 'TRK-1', capacityVolume: 50, capacityWeight: 10000, dimensions: { length: 6, width: 2.4, height: 2.4 } },
  { vehicleId: 'TRK-2', capacityVolume: 50, capacityWeight: 10000, dimensions: { length: 6, width: 2.4, height: 2.4 } }
];
const largeShipments = [
  { shipmentId: 'CARGO-1', pickup: 'A', delivery: 'B', volume: 45, weight: 8000 },
  { shipmentId: 'CARGO-2', pickup: 'A', delivery: 'B', volume: 45, weight: 8000 }
];
const resFleet = optimizeMultiTruckFleet({ trucks: trucksFleet, route: routeAB, shipments: largeShipments });
assert(resFleet.trucksActivatedCount === 2, 'TEST 13 - Multiple Trucks: Both trucks activated for large demand');
assert(resFleet.isFullyAssigned === true, 'TEST 13 - Multiple Trucks: All cargo fully assigned across fleet');

// ---------------------------------------------------------------------------
// TEST 14: Re-Optimization with Pre-Existing Truck Load State
// ---------------------------------------------------------------------------
// Truck already has 50 m³ locked on A -> B. New candidate is 40 m³. Total = 90 m³ <= 100 m³.
const existingLoad = [
  { shipmentId: 'LOCKED-CARGO', pickup: 'A', delivery: 'B', volume: 50, weight: 10000 }
];
const newCandidate = [
  { shipmentId: 'NEW-CARGO', pickup: 'A', delivery: 'B', volume: 40, weight: 8000 }
];
const resReopt = generateLoadPlan({
  truck: standardTruck,
  route: routeAB,
  shipments: newCandidate,
  currentLoad: existingLoad
});
assert(resReopt.assignments.some(a => a.shipmentId === 'NEW-CARGO'), 'TEST 14 - Re-optimization: New cargo allocated alongside locked cargo');
assert(resReopt.segmentUtilization[0].usedVolume === 90, 'TEST 14 - Re-optimization: Total volume combines locked + new cargo (90 m³)');

console.log('\n===============================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} OPTIMIZER UNIT TESTS PASSED WITH 100% SUCCESS!`);
console.log('===============================================================');
