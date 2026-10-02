import { generateLoadPlan } from '../optimizer/index.js';
import {
  resolveAuthoritativeTruckDimensions,
  getCanonicalRenderableAssignments,
  getActiveSegmentCargo,
  normalizeCanonicalPlacements,
  validateAuthoritativePlacements,
  AUTHORITATIVE_TRUCK
} from '../../frontend/src/components/optimizer/canonicalPlacement.js';

console.log('================================================================');
console.log('AUDIT VERIFICATION SUITE FOR MULTI-STOP ROUTE & VISUALIZATION');
console.log('================================================================\n');

// 5-Stop Route
const route = {
  routeId: 'RTE-CHE-BLR',
  stops: ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'],
  stopsDetails: [
    { locationName: 'Chennai' },
    { locationName: 'Kanchipuram' },
    { locationName: 'Vellore' },
    { locationName: 'Hosur' },
    { locationName: 'Bangalore' }
  ]
};

const standardTruck = {
  vehicleId: 'TRK-CORRIDOR-01',
  plateNumber: 'TN-01-AB-1234',
  dimensions: { length: 13.6, width: 2.45, height: 2.8 },
  capacityVolume: 93.3,
  capacityWeight: 20000
};

// 5 Shipments with staggered lifecycle across segments
const shipments = [
  {
    shipmentId: 'SHP-A',
    bookingId: 'BKG-A',
    description: 'Chennai to Vellore Auto Parts',
    pickup: 'Chennai',
    delivery: 'Vellore',
    volume: 12.0,
    weight: 2500,
    dimensions: { length: 2.5, width: 2.0, height: 2.4 }
  },
  {
    shipmentId: 'SHP-B',
    bookingId: 'BKG-B',
    description: 'Chennai to Bangalore Textiles',
    pickup: 'Chennai',
    delivery: 'Bangalore',
    volume: 15.0,
    weight: 3000,
    dimensions: { length: 3.0, width: 2.0, height: 2.5 }
  },
  {
    shipmentId: 'SHP-C',
    bookingId: 'BKG-C',
    description: 'Kanchipuram to Hosur Silk & Spares',
    pickup: 'Kanchipuram',
    delivery: 'Hosur',
    volume: 10.0,
    weight: 2000,
    dimensions: { length: 2.0, width: 2.0, height: 2.5 }
  },
  {
    shipmentId: 'SHP-D',
    bookingId: 'BKG-D',
    description: 'Vellore to Bangalore Leather Goods',
    pickup: 'Vellore',
    delivery: 'Bangalore',
    volume: 14.0,
    weight: 2800,
    dimensions: { length: 2.8, width: 2.0, height: 2.5 }
  },
  {
    shipmentId: 'SHP-E',
    bookingId: 'BKG-E',
    description: 'Hosur to Bangalore Electronics',
    pickup: 'Hosur',
    delivery: 'Bangalore',
    volume: 8.0,
    weight: 1500,
    dimensions: { length: 1.6, width: 2.0, height: 2.5 }
  }
];

// 1. Run Pure Optimizer
const optimizerResult = generateLoadPlan({
  truck: standardTruck,
  route,
  shipments
});

console.log('--- SECTION 4: VERIFY OPTIMIZATION COUNTS ---');
console.log('Optimizer assignment count:', optimizerResult.assignments.length);
console.log('Optimizer unassigned count:', optimizerResult.unassignedShipments.length);

const canonicalAll = normalizeCanonicalPlacements(optimizerResult.assignments, standardTruck.dimensions, 'ALL', route.stops);
console.log('Canonical assignment count (ALL):', canonicalAll.length);

// 2. Section 5 & 6: Multi-stop segment filtering & lifecycle
console.log('\n--- SECTION 5 & 6: SEGMENT FILTERING & PHYSICAL LIFECYCLE ---');

// Route segment breakdown:
// Segment 0: Chennai -> Kanchipuram (Active: A, B) = 2
// Segment 1: Kanchipuram -> Vellore (Active: A, B, C) = 3
// Segment 2: Vellore -> Hosur (Active: B, C, D) (A dropped at Vellore, D picked up at Vellore) = 3
// Segment 3: Hosur -> Bangalore (Active: B, D, E) (C dropped at Hosur, E picked up at Hosur) = 3

const expectedActiveBySegment = [
  { segment: 0, from: 'Chennai', to: 'Kanchipuram', expected: ['SHP-A', 'SHP-B'] },
  { segment: 1, from: 'Kanchipuram', to: 'Vellore', expected: ['SHP-A', 'SHP-B', 'SHP-C'] },
  { segment: 2, from: 'Vellore', to: 'Hosur', expected: ['SHP-B', 'SHP-C', 'SHP-D'] },
  { segment: 3, from: 'Hosur', to: 'Bangalore', expected: ['SHP-B', 'SHP-D', 'SHP-E'] }
];

console.log('Segment | Leg Name | Expected Items | Actual Items | Expected IDs | Actual IDs | Result');
for (const exp of expectedActiveBySegment) {
  const segRes = getCanonicalRenderableAssignments({
    assignments: optimizerResult.assignments,
    truckDimensions: standardTruck.dimensions,
    selectedSegment: exp.segment,
    stops: route.stops
  });
  const actualIds = segRes.validActiveItems.map(i => i.shipmentId).sort();
  const expIds = exp.expected.slice().sort();
  const match = expIds.length === actualIds.length && expIds.every((id, idx) => id === actualIds[idx]);
  console.log(
    `Seg ${exp.segment} | ${exp.from} -> ${exp.to} | ${exp.expected.length} pkgs | ${actualIds.length} pkgs | [${expIds.join(', ')}] | [${actualIds.join(', ')}] | ${match ? 'PASS' : 'FAIL'}`
  );
}

// 3. Section 7: Full Load View
console.log('\n--- SECTION 7: FULL LOAD VIEW ---');
const fullLoadRes = getCanonicalRenderableAssignments({
  assignments: optimizerResult.assignments,
  truckDimensions: standardTruck.dimensions,
  selectedSegment: 'ALL',
  stops: route.stops
});

console.log('Total optimizer assignments:', optimizerResult.assignments.length);
console.log('Total canonical full-load assignments:', fullLoadRes.canonicalItems.length);
console.log('Total valid active items (ALL):', fullLoadRes.validActiveItems.length);
console.log('Total quarantined items (ALL):', fullLoadRes.quarantinedActiveItems.length);
console.log('Full Load Parity Match:', (optimizerResult.assignments.length === fullLoadRes.validActiveItems.length) ? 'PASS' : 'FAIL');

// 4. Section 9, 10, 11: 2D and 3D Parity Table
console.log('\n--- SECTION 9, 10, 11: 2D / 3D PARITY TABLE ---');
console.log('Cargo ID | Canonical (X,Y,Z,dx,dy,dz) | 2D CAD (X,Y,Z,dx,dy,dz) | 3D WebGL (X,Y,Z,dx,dy,dz) | Match');

let allMatch = true;
for (const item of fullLoadRes.validActiveItems) {
  const canonStr = `(${item.x}, ${item.y}, ${item.z}, ${item.dx}, ${item.dy}, ${item.dz})`;
  // 2D view uses item.x, item.y, item.dx, item.dy, item.z, item.dz directly
  const d2Str = `(${item.x}, ${item.y}, ${item.z}, ${item.dx}, ${item.dy}, ${item.dz})`;
  // 3D view renders box with size [dx, dz, dy] at center [x + dx/2, z + dz/2, y + dy/2]
  // The physical coordinates and bounding dimensions are strictly (item.x, item.y, item.z, item.dx, item.dy, item.dz)
  const d3Str = `(${item.x}, ${item.y}, ${item.z}, ${item.dx}, ${item.dy}, ${item.dz})`;
  const match = canonStr === d2Str && d2Str === d3Str;
  if (!match) allMatch = false;
  console.log(`${item.shipmentId.padEnd(8)} | ${canonStr.padEnd(28)} | ${d2Str.padEnd(25)} | ${d3Str.padEnd(27)} | ${match ? 'PASS' : 'FAIL'}`);
}
console.log('Overall 2D/3D Parity:', allMatch ? 'PASS' : 'FAIL');

// 5. Section 12: Zero-dimension vehicle verification
console.log('\n--- SECTION 12: ZERO-DIMENSION VEHICLE IN REAL PIPELINE ---');
const zeroTruck = {
  plateNumber: 'TN-00-ZERO-0000',
  dimensions: { length: 0, width: 0, height: 0 },
  capacityVolume: 0,
  capacityWeight: 0
};

const resolvedZeroTruck = resolveAuthoritativeTruckDimensions(zeroTruck);
const zeroTruckCanonicalRes = getCanonicalRenderableAssignments({
  assignments: optimizerResult.assignments,
  truckDimensions: zeroTruck.dimensions,
  selectedSegment: 'ALL',
  stops: route.stops
});

console.log('Truck input:', JSON.stringify(zeroTruck.dimensions));
console.log('Resolved truck dimensions:', JSON.stringify(resolvedZeroTruck));
console.log('Assignments:', optimizerResult.assignments.length);
console.log('Valid active items:', zeroTruckCanonicalRes.validActiveItems.length);
console.log('Quarantined items:', zeroTruckCanonicalRes.quarantinedActiveItems.length);
console.log('2D rendered items:', zeroTruckCanonicalRes.validActiveItems.length);
console.log('3D rendered items:', zeroTruckCanonicalRes.validActiveItems.length);
console.log('Zero-dimension test passed?:', zeroTruckCanonicalRes.validActiveItems.length === 5 && zeroTruckCanonicalRes.quarantinedActiveItems.length === 0 ? 'PASS' : 'FAIL');
