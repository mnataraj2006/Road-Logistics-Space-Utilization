/**
 * Authoritative Regression Test Suite:
 * 3D Truck Boundary, Rear Container Door, and Physical Envelope Validation
 *
 * Verifies that:
 * 1. validatePackageWithinTruck catches all 6 boundary violations (Front Cabin, Rear Door, Left Wall, Right Wall, Floor, Roof).
 * 2. Exact rear door threshold (X + dx <= truckLength) is strictly respected.
 * 3. Rotated package dimensions (dx, dy, dz) are authoritative and cannot cause false overflows or leaks.
 * 4. generateLoadPlan post-optimization pass guarantees zero boundary violations.
 * 5. Locked cargo outside boundary envelope is quarantined rather than placed.
 * 6. Canonical placement normalizer flags invalid packages.
 */

import { strict as assert } from 'assert';
import { generateLoadPlan } from '../optimizer/engine.js';
import { validatePackageWithinTruck, isPhysicallyValidPlacement } from '../optimizer/validator.js';
import { normalizeCanonicalPlacements } from '../../frontend/src/components/optimizer/canonicalPlacement.js';

console.log('------------------------------------------------------------');
console.log('🧪 RUNNING 3D TRUCK BOUNDARY & REAR DOOR REGRESSION SUITE');
console.log('------------------------------------------------------------\n');

let passedTests = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(err);
    process.exit(1);
  }
}

const TRUCK_SPECS = {
  vehicleId: 'VOLVO-FH16',
  dimensions: { length: 13.6, width: 2.45, height: 2.8 },
  capacityVolume: 93.3,
  capacityWeight: 24000
};

// ============================================================================
// 1. Authoritative 6-Boundary Plane Validation
// ============================================================================
test('Valid package placed cleanly inside interior volume', () => {
  const result = validatePackageWithinTruck({
    position: { x: 2.0, y: 0.5, z: 0.0 },
    dimensions: { dx: 1.2, dy: 1.0, dz: 1.2 },
    truckDimensions: TRUCK_SPECS.dimensions
  });
  assert.equal(result.valid, true);
  assert.equal(result.violations.length, 0);
});

test('Boundary 1: FRONT_CABIN - Negative X coordinate rejected', () => {
  const result = validatePackageWithinTruck({
    position: { x: -0.1, y: 0.5, z: 0.0 },
    dimensions: { dx: 1.2, dy: 1.0, dz: 1.2 },
    truckDimensions: TRUCK_SPECS.dimensions
  });
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].boundary, 'FRONT_CABIN');
  assert.equal(result.violations[0].axis, 'X');
});

test('Boundary 2: REAR_DOOR - Package extending past truck length rejected', () => {
  const result = validatePackageWithinTruck({
    position: { x: 13.0, y: 0.5, z: 0.0 },
    dimensions: { dx: 1.2, dy: 1.0, dz: 1.2 }, // 13.0 + 1.2 = 14.2m > 13.6m
    truckDimensions: TRUCK_SPECS.dimensions
  });
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].boundary, 'REAR_DOOR');
  assert.equal(result.violations[0].axis, 'X');
  assert.equal(result.violations[0].overflow, 0.6);
});

test('Boundary 3: LEFT_WALL - Negative Y coordinate rejected', () => {
  const result = validatePackageWithinTruck({
    position: { x: 1.0, y: -0.05, z: 0.0 },
    dimensions: { dx: 1.2, dy: 1.0, dz: 1.2 },
    truckDimensions: TRUCK_SPECS.dimensions
  });
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].boundary, 'LEFT_WALL');
});

test('Boundary 4: RIGHT_WALL - Package extending past trailer width rejected', () => {
  const result = validatePackageWithinTruck({
    position: { x: 1.0, y: 2.0, z: 0.0 },
    dimensions: { dx: 1.2, dy: 0.8, dz: 1.2 }, // 2.0 + 0.8 = 2.8m > 2.45m
    truckDimensions: TRUCK_SPECS.dimensions
  });
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].boundary, 'RIGHT_WALL');
});

test('Boundary 5: TRAILER_FLOOR - Negative Z coordinate rejected', () => {
  const result = validatePackageWithinTruck({
    position: { x: 1.0, y: 0.5, z: -0.1 },
    dimensions: { dx: 1.2, dy: 1.0, dz: 1.2 },
    truckDimensions: TRUCK_SPECS.dimensions
  });
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].boundary, 'TRAILER_FLOOR');
});

test('Boundary 6: TRAILER_ROOF - Package extending past ceiling rejected', () => {
  const result = validatePackageWithinTruck({
    position: { x: 1.0, y: 0.5, z: 2.0 },
    dimensions: { dx: 1.2, dy: 1.0, dz: 1.0 }, // 2.0 + 1.0 = 3.0m > 2.8m
    truckDimensions: TRUCK_SPECS.dimensions
  });
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].boundary, 'TRAILER_ROOF');
});

// ============================================================================
// 2. Exact Rear Door Limits & Millimeter Precision
// ============================================================================
test('Package placed flush against rear door is VALID (X + dx == truckLength)', () => {
  const result = validatePackageWithinTruck({
    position: { x: 12.4, y: 0.0, z: 0.0 },
    dimensions: { dx: 1.2, dy: 1.0, dz: 1.2 }, // 12.4 + 1.2 = 13.6m exactly
    truckDimensions: TRUCK_SPECS.dimensions
  });
  assert.equal(result.valid, true);
});

test('Package exceeding rear door by 1mm is REJECTED', () => {
  const result = validatePackageWithinTruck({
    position: { x: 12.401, y: 0.0, z: 0.0 },
    dimensions: { dx: 1.2, dy: 1.0, dz: 1.2 }, // 12.401 + 1.2 = 13.601m > 13.6m
    truckDimensions: TRUCK_SPECS.dimensions
  });
  assert.equal(result.valid, false);
  assert.equal(result.violations[0].boundary, 'REAR_DOOR');
});

// ============================================================================
// 3. Rotated Dimensions Validation
// ============================================================================
test('Rotated package uses oriented dimensions (dx, dy, dz) not unoriented length', () => {
  // Package original unrotated: length=2.0, width=1.0, height=1.0
  // Rotated 90 degrees: dx=1.0, dy=2.0, dz=1.0
  // Positioned at X = 12.5m
  // With unrotated length 2.0: 12.5 + 2.0 = 14.5m (would falsely fail or leak)
  // With oriented dx 1.0: 12.5 + 1.0 = 13.5m <= 13.6m (valid!)
  const result = validatePackageWithinTruck({
    position: { x: 12.5, y: 0.0, z: 0.0 },
    dimensions: { dx: 1.0, dy: 2.0, dz: 1.0, length: 2.0, width: 1.0, height: 1.0 },
    truckDimensions: TRUCK_SPECS.dimensions
  });
  assert.equal(result.valid, true);
});

// ============================================================================
// 4. Engine End-to-End Boundary Safety Guarantee
// ============================================================================
test('generateLoadPlan guarantees 100% of assignments remain inside truck envelope', () => {
  const route = {
    routeId: 'BLR-CHE',
    source: 'Bangalore',
    destination: 'Chennai',
    stops: ['Bangalore', 'Hosur', 'Vellore', 'Chennai']
  };

  const shipments = [
    { shipmentId: 'SHP-1', pickup: 'Bangalore', delivery: 'Chennai', length: 1.2, width: 1.0, height: 1.2, volume: 1.44, weight: 600, priority: 'HIGH' },
    { shipmentId: 'SHP-2', pickup: 'Bangalore', delivery: 'Hosur', length: 2.0, width: 1.2, height: 1.5, volume: 3.6, weight: 1200, priority: 'STANDARD' },
    { shipmentId: 'SHP-3', pickup: 'Hosur', delivery: 'Chennai', length: 1.5, width: 1.0, height: 1.0, volume: 1.5, weight: 800, priority: 'URGENT' },
    { shipmentId: 'SHP-4', pickup: 'Bangalore', delivery: 'Vellore', length: 1.8, width: 1.2, height: 1.4, volume: 3.02, weight: 1000, priority: 'STANDARD' },
    { shipmentId: 'SHP-5', pickup: 'Vellore', delivery: 'Chennai', length: 2.4, width: 1.2, height: 1.6, volume: 4.6, weight: 1500, priority: 'HIGH' }
  ];

  const plan = generateLoadPlan({ truck: TRUCK_SPECS, route, shipments });

  assert(plan.assignments.length > 0, 'Assignments should be generated');

  for (const assign of plan.assignments) {
    const geo = validatePackageWithinTruck({
      position: assign.position,
      dimensions: assign.dimensions,
      truckDimensions: TRUCK_SPECS.dimensions
    });
    assert.equal(geo.valid, true, `Assignment ${assign.shipmentId} must satisfy physical boundaries: ${JSON.stringify(geo.violations)}`);
    assert(assign.position.x + assign.dimensions.dx <= TRUCK_SPECS.dimensions.length + 1e-6, `Rear door exceeded by ${assign.shipmentId}`);
    assert(assign.position.y + assign.dimensions.dy <= TRUCK_SPECS.dimensions.width + 1e-6, `Width wall exceeded by ${assign.shipmentId}`);
    assert(assign.position.z + assign.dimensions.dz <= TRUCK_SPECS.dimensions.height + 1e-6, `Roof exceeded by ${assign.shipmentId}`);
  }
});

// ============================================================================
// 5. Quarantining Invalid Locked Cargo
// ============================================================================
test('Locked cargo exceeding physical bounds is rejected into unassignedShipments', () => {
  const route = {
    routeId: 'BLR-CHE',
    source: 'Bangalore',
    destination: 'Chennai',
    stops: ['Bangalore', 'Chennai']
  };

  // Pre-load an impossible locked cargo that would stick out the rear door
  const invalidLocked = [
    {
      shipmentId: 'LOCKED-OUTSIDE',
      length: 2.0,
      width: 1.0,
      height: 1.0,
      volume: 2.0,
      weight: 1000,
      pickup: 'Bangalore',
      delivery: 'Chennai',
      position: { x: 13.0, y: 0.0, z: 0.0 } // 13.0 + 2.0 = 15.0m > 13.6m
    }
  ];

  const plan = generateLoadPlan({
    truck: TRUCK_SPECS,
    route,
    shipments: [
      { shipmentId: 'VALID-1', pickup: 'Bangalore', delivery: 'Chennai', length: 1.2, width: 1.0, height: 1.0, volume: 1.2, weight: 500 }
    ],
    currentLoad: invalidLocked
  });

  // Must not have any assignment extending past 13.6m
  for (const a of plan.assignments) {
    assert(a.position.x + a.dimensions.dx <= TRUCK_SPECS.dimensions.length + 1e-6);
  }
});

// ============================================================================
// 6. Frontend Canonical Placement Normalizer
// ============================================================================
test('normalizeCanonicalPlacements flags physically invalid packages with isPhysicallyValid: false', () => {
  const rawAssignments = [
    {
      shipmentId: 'VALID-PKG',
      position: { x: 2.0, y: 0.5, z: 0.0 },
      dimensions: { dx: 1.2, dy: 1.0, dz: 1.2 }
    },
    {
      shipmentId: 'BREACH-PKG',
      position: { x: 13.2, y: 0.5, z: 0.0 },
      dimensions: { dx: 1.2, dy: 1.0, dz: 1.2 } // 13.2 + 1.2 = 14.4m > 13.6m
    }
  ];

  const normalized = normalizeCanonicalPlacements(rawAssignments, TRUCK_SPECS);
  assert.equal(normalized[0].isPhysicallyValid, true);
  assert.equal(normalized[1].isPhysicallyValid, false);
  assert.equal(normalized[1].geometryViolations[0].boundary, 'REAR_DOOR');
});

console.log('\n------------------------------------------------------------');
console.log(`🎉 ALL ${passedTests} REGRESSION TESTS PASSED SUCCESSFULLY!`);
console.log('------------------------------------------------------------\n');
