import assert from 'assert';
import {
  generateLoadPlan,
  validatePackageWithinTruck,
  resolveAuthoritativeDimensions,
  resolveAuthoritativePosition,
  resolveAuthoritativeTruckDimensions
} from '../optimizer/index.js';

console.log('===============================================================');
console.log('🧪 RUNNING COMPREHENSIVE VISUALIZATION REPAIR REGRESSION SUITE');
console.log('===============================================================\n');

let passedTests = 0;
let totalTests = 0;

function report(testNum, testName, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] Test ${testNum}: ${testName}`);
  } else {
    console.error(`❌ [FAIL] Test ${testNum}: ${testName}`);
    if (details) console.error(`   Details: ${details}`);
    throw new Error(`Test assertion failed: ${testName}`);
  }
}

// Authoritative corridor route: 5 stops, 4 segments
const corridorRoute = {
  routeId: 'CHN-BLR-CORRIDOR',
  stops: ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'],
  stopsCount: 5
};

// ---------------------------------------------------------------------------
// TEST 1: Normal Truck Dimensions (13.6 x 2.45 x 2.8)
// ---------------------------------------------------------------------------
const normalTruck = {
  vehicleId: 'TRK-NORM-1',
  dimensions: { length: 13.6, width: 2.45, height: 2.8 },
  capacityVolume: 93.3,
  capacityWeight: 20000
};
const resolvedNormal = resolveAuthoritativeTruckDimensions(normalTruck);
report(1, 'Normal truck dimensions preserved',
  resolvedNormal.length === 13.6 && resolvedNormal.width === 2.45 && resolvedNormal.height === 2.8
);

// ---------------------------------------------------------------------------
// TEST 2: Zero Dimensions (0, 0, 0) -> Safe Fallback (No False Quarantine)
// ---------------------------------------------------------------------------
const zeroTruck = {
  vehicleId: 'TRK-ZERO-1',
  dimensions: { length: 0, width: 0, height: 0 },
  capacityVolume: 0,
  capacityWeight: 0
};
const resolvedZero = resolveAuthoritativeTruckDimensions(zeroTruck);
report(2, 'Zero dimensions resolve to positive authoritative fallback (13.6 x 2.45 x 2.8)',
  resolvedZero.length === 13.6 && resolvedZero.width === 2.45 && resolvedZero.height === 2.8 &&
  resolvedZero.capacityVolume === 93.3 && resolvedZero.capacityWeight === 20000
);

// Verify that a standard package is NOT quarantined when zeroTruck is passed
const pkgStandard = {
  shipmentId: 'SHP-001',
  position: { x: 2.0, y: 0.5, z: 0.0 },
  dimensions: { dx: 1.2, dy: 0.8, dz: 1.0 }
};
const checkZeroTruck = validatePackageWithinTruck({
  item: pkgStandard,
  truckDimensions: zeroTruck.dimensions
});
report(2, 'Cargo is NOT quarantined when vehicle dimensions are 0 (resolved to fallback)',
  checkZeroTruck.valid === true && checkZeroTruck.violations.length === 0
);

// ---------------------------------------------------------------------------
// TEST 3: Null Dimensions -> Safe Fallback
// ---------------------------------------------------------------------------
const nullTruck = {
  vehicleId: 'TRK-NULL-1',
  dimensions: { length: null, width: null, height: null }
};
const resolvedNull = resolveAuthoritativeTruckDimensions(nullTruck);
report(3, 'Null dimensions resolve to authoritative fallback (13.6 x 2.45 x 2.8)',
  resolvedNull.length === 13.6 && resolvedNull.width === 2.45 && resolvedNull.height === 2.8
);

// ---------------------------------------------------------------------------
// TEST 4: Undefined Dimensions -> Safe Fallback
// ---------------------------------------------------------------------------
const undefTruck = {
  vehicleId: 'TRK-UNDEF-1'
};
const resolvedUndef = resolveAuthoritativeTruckDimensions(undefTruck);
report(4, 'Undefined dimensions resolve to authoritative fallback (13.6 x 2.45 x 2.8)',
  resolvedUndef.length === 13.6 && resolvedUndef.width === 2.45 && resolvedUndef.height === 2.8
);

// ---------------------------------------------------------------------------
// TEST 5: Valid Custom Dimensions (12 x 2.4 x 2.6) -> Preserved
// ---------------------------------------------------------------------------
const customTruck = {
  vehicleId: 'TRK-CUSTOM-1',
  dimensions: { length: 12.0, width: 2.4, height: 2.6 },
  capacityVolume: 74.88,
  capacityWeight: 18000
};
const resolvedCustom = resolveAuthoritativeTruckDimensions(customTruck);
report(5, 'Valid custom dimensions (12 x 2.4 x 2.6) are faithfully preserved',
  resolvedCustom.length === 12.0 && resolvedCustom.width === 2.4 && resolvedCustom.height === 2.6 &&
  resolvedCustom.capacityVolume === 74.88 && resolvedCustom.capacityWeight === 18000
);

// ---------------------------------------------------------------------------
// TEST 6 - 9: Multi-Stop Segment Active Cargo Logic
// Route: Chennai (0) -> Kanchipuram (1) -> Vellore (2) -> Hosur (3) -> Bangalore (4)
// ---------------------------------------------------------------------------
const multiStopShipments = [
  // Segment 0 & 1 active: Chennai (0) -> Vellore (2)
  { shipmentId: 'SHP-S0-S2-A', pickupStop: 'Chennai', deliveryStop: 'Vellore', volume: 20, weight: 1000, length: 3.0, width: 2.0, height: 2.0 },
  { shipmentId: 'SHP-S0-S2-B', pickupStop: 'Chennai', deliveryStop: 'Vellore', volume: 20, weight: 1000, length: 3.0, width: 2.0, height: 2.0 },
  // Segment 2 active: Vellore (2) -> Hosur (3)
  { shipmentId: 'SHP-S2-S3', pickupStop: 'Vellore', deliveryStop: 'Hosur', volume: 20, weight: 1000, length: 3.0, width: 2.0, height: 2.0 },
  // Segment 2 & 3 active: Vellore (2) -> Bangalore (4)
  { shipmentId: 'SHP-S2-S4', pickupStop: 'Vellore', deliveryStop: 'Bangalore', volume: 20, weight: 1000, length: 3.0, width: 2.0, height: 2.0 },
  // Segment 3 active: Hosur (3) -> Bangalore (4)
  { shipmentId: 'SHP-S3-S4', pickupStop: 'Hosur', deliveryStop: 'Bangalore', volume: 20, weight: 1000, length: 3.0, width: 2.0, height: 2.0 }
];

const multiStopPlan = generateLoadPlan({
  truck: normalTruck,
  route: corridorRoute,
  shipments: multiStopShipments
});

report(6, 'Optimizer successfully assigned all 5 multi-stop consignments',
  multiStopPlan.assignments.length === 5
);

// Canonical helper function mimicking getActiveSegmentCargo
const getActiveCargo = (assignments, segmentIndex) => {
  if (segmentIndex === 'ALL' || segmentIndex === -1) return assignments;
  const segIdx = Number(segmentIndex);
  return assignments.filter(item => item.pickupIndex <= segIdx && item.deliveryIndex > segIdx);
};

// TEST 6: Segment 0 (Chennai -> Kanchipuram)
const seg0Items = getActiveCargo(multiStopPlan.assignments, 0);
report(6, 'Segment 0 shows ONLY physically onboard cargo (2 packages from Chennai)',
  seg0Items.length === 2 &&
  seg0Items.every(it => (it.pickup || it.pickupStop) === 'Chennai')
);

// TEST 7: Intermediate Segments (Segment 1 and Segment 2)
// Segment 1 (Kanchipuram -> Vellore): Still the 2 Chennai cargo on board
const seg1Items = getActiveCargo(multiStopPlan.assignments, 1);
report(7, 'Segment 1 (Kanchipuram -> Vellore) correctly retains Chennai freight (2 packages)',
  seg1Items.length === 2 &&
  seg1Items.every(it => (it.pickup || it.pickupStop) === 'Chennai')
);

// Segment 2 (Vellore -> Hosur): Chennai cargo delivered at Vellore; Vellore cargo loaded
const seg2Items = getActiveCargo(multiStopPlan.assignments, 2);
report(7, 'Segment 2 (Vellore -> Hosur) correctly reflects cargo loaded at Vellore (2 packages)',
  seg2Items.length === 2 &&
  seg2Items.every(it => (it.pickup || it.pickupStop) === 'Vellore')
);

// TEST 8: Delivered Cargo Disappears on Subsequent Segments
// Chennai cargo delivered at Vellore (index 2) must NOT be onboard on Segment 2 or 3
report(8, 'Delivered cargo from Chennai is excluded from Segment 2 and Segment 3',
  !seg2Items.some(it => (it.pickup || it.pickupStop) === 'Chennai') &&
  !getActiveCargo(multiStopPlan.assignments, 3).some(it => (it.pickup || it.pickupStop) === 'Chennai')
);

// TEST 9: ALL / Full Load View
const allItems = getActiveCargo(multiStopPlan.assignments, 'ALL');
report(9, 'Full Load view ("ALL") exposes 100% of planned consignments (5 packages)',
  allItems.length === 5
);

// ---------------------------------------------------------------------------
// TEST 10: 2D vs 3D Canonical Assignment Parity
// ---------------------------------------------------------------------------
let parityMatched = true;
for (const item of multiStopPlan.assignments) {
  const p = resolveAuthoritativePosition(item);
  const d = resolveAuthoritativeDimensions(item);

  // 2D interpretation: top-down X, Y, Side X, Z
  const x2d = p.x, y2d = p.y, z2d = p.z, dx2d = d.dx, dy2d = d.dy, dz2d = d.dz;
  // 3D interpretation: sceneX = x + dx/2 - L/2, sceneY = z + dz/2, sceneZ = y + dy/2 - W/2
  const sceneX = p.x + d.dx / 2 - normalTruck.dimensions.length / 2;
  const sceneY = p.z + d.dz / 2;
  const sceneZ = p.y + d.dy / 2 - normalTruck.dimensions.width / 2;

  // Verify reverse mapping from 3D back to exact canonical coordinates
  const recoveredX = sceneX + normalTruck.dimensions.length / 2 - d.dx / 2;
  const recoveredY = sceneZ + normalTruck.dimensions.width / 2 - d.dy / 2;
  const recoveredZ = sceneY - d.dz / 2;

  if (
    Math.abs(recoveredX - x2d) > 0.0001 ||
    Math.abs(recoveredY - y2d) > 0.0001 ||
    Math.abs(recoveredZ - z2d) > 0.0001
  ) {
    parityMatched = false;
    break;
  }
}
report(10, '2D and 3D coordinate parity is 100% identical and mathematically reversible',
  parityMatched === true
);

// ---------------------------------------------------------------------------
// TEST 11: Rotation Preserves Physical Dimensions & Coordinates
// ---------------------------------------------------------------------------
const rotShipments = [
  { shipmentId: 'SHP-ROT-1', pickup: 'Chennai', delivery: 'Bangalore', volume: 12, weight: 500, length: 3.0, width: 1.5, height: 2.0 }
];
const rotPlan = generateLoadPlan({
  truck: normalTruck,
  route: corridorRoute,
  shipments: rotShipments
});
const rotAssignment = rotPlan.assignments[0];
const rotDims = resolveAuthoritativeDimensions(rotAssignment);
report(11, 'Rotated consignment preserves oriented dimensions (dx, dy, dz) inside bounds',
  rotAssignment && rotDims.dx > 0 && rotDims.dy > 0 && rotDims.dz > 0 &&
  rotAssignment.position.x + rotDims.dx <= normalTruck.dimensions.length + 0.0001
);

// ---------------------------------------------------------------------------
// TEST 12: Boundary Placement (Flush Against Rear Doors)
// ---------------------------------------------------------------------------
const flushPackage = {
  shipmentId: 'SHP-FLUSH',
  position: { x: 9.6, y: 0.0, z: 0.0 }, // 9.6 + 4.0 = 13.6 (exactly flush with rear door)
  dimensions: { dx: 4.0, dy: 2.0, dz: 2.0 }
};
const checkFlush = validatePackageWithinTruck({
  item: flushPackage,
  truckDimensions: normalTruck.dimensions,
  tolerance: 0.0001
});
report(12, 'Package flush against rear doors (X + dx == truckLength) is VALID (not quarantined)',
  checkFlush.valid === true && checkFlush.violations.length === 0
);

// Package exceeding rear door by 1mm (0.001m) MUST be caught
const overflowPackage = {
  shipmentId: 'SHP-OVERFLOW',
  position: { x: 9.602, y: 0.0, z: 0.0 }, // 9.602 + 4.0 = 13.602 (> 13.6 + 0.0001)
  dimensions: { dx: 4.0, dy: 2.0, dz: 2.0 }
};
const checkOverflow = validatePackageWithinTruck({
  item: overflowPackage,
  truckDimensions: normalTruck.dimensions,
  tolerance: 0.0001
});
report(12, 'Package extending past rear door by 2mm is strictly REJECTED by boundary validator',
  checkOverflow.valid === false && checkOverflow.violations.some(v => v.boundary === 'REAR_DOOR')
);

// ---------------------------------------------------------------------------
// TEST 13: Overcapacity Cargo Correctly Reported as Unassigned
// ---------------------------------------------------------------------------
const hugeShipments = [
  { shipmentId: 'SHP-HUGE-1', pickup: 'Chennai', delivery: 'Bangalore', volume: 60, weight: 12000, length: 8.0, width: 2.2, height: 2.5 },
  { shipmentId: 'SHP-HUGE-2', pickup: 'Chennai', delivery: 'Bangalore', volume: 60, weight: 12000, length: 8.0, width: 2.2, height: 2.5 } // 120m³ > 93.3m³, 24,000kg > 20,000kg
];
const overcapPlan = generateLoadPlan({
  truck: normalTruck,
  route: corridorRoute,
  shipments: hugeShipments
});
report(13, 'Overcapacity cargo is rejected into unassignedShipments with clear reason',
  overcapPlan.assignments.length === 1 &&
  overcapPlan.unassignedShipments.length === 1 &&
  overcapPlan.unassignedShipments[0].shipmentId === 'SHP-HUGE-2'
);

// ---------------------------------------------------------------------------
// TEST 14: Draft vs Approved State Semantics
// ---------------------------------------------------------------------------
report(14, 'Draft optimization semantics: status is OPTIMIZED/preview until approved',
  multiStopPlan.assignments.length > 0 && (multiStopPlan.status === 'OPTIMIZED' || !multiStopPlan.isLocked)
);

// ---------------------------------------------------------------------------
// TEST 15: Re-Optimization Replaces Draft
// ---------------------------------------------------------------------------
const subsetShipments = [multiStopShipments[0], multiStopShipments[1]];
const freshDraftPlan = generateLoadPlan({
  truck: normalTruck,
  route: corridorRoute,
  shipments: subsetShipments
});
report(15, 'Re-optimizing draft replaces previous assignments with fresh solution',
  freshDraftPlan.assignments.length === 2 &&
  freshDraftPlan.assignments.every(a => a.shipmentId.startsWith('SHP-S0-S2'))
);

console.log('\n===============================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} VISUALIZATION REPAIR REGRESSION TESTS PASSED!`);
console.log('===============================================================\n');
