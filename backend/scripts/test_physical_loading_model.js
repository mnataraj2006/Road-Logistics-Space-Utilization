import { SpatialEngine } from '../optimizer/spatialEngine.js';
import { generateLoadPlan } from '../optimizer/index.js';

const runPhysicalLoadingTestSuite = () => {
  console.log('\n===============================================================');
  console.log('STARTING PHYSICAL LOADING & GEOMETRY VALIDATION TEST SUITE');
  console.log('===============================================================');

  const truckDims = {
    length: 13.6, // interiorLength (m)
    width: 2.45,  // interiorWidth (m)
    height: 3.0   // interiorHeight (m)
  };

  // ── TEST 1: CONTAINER BOUNDARY VALIDATION ─────────────────────
  console.log('\n[TEST 1] Testing Container Boundary Validation...');
  const spatial1 = new SpatialEngine(truckDims);

  const oversizedLength = {
    shipmentId: 'SHP-OVER-LEN',
    dimensions: { length: 14.5, width: 2.0, height: 2.0 },
    volume: 58,
    weight: 5000,
    segmentRange: { fromIndex: 0, toIndex: 1 }
  };
  const resOverLen = spatial1.findBestPlacement(oversizedLength);
  if (resOverLen !== null) {
    throw new Error('Test 1 Failed: Oversized length package was placed!');
  }

  const oversizedHeight = {
    shipmentId: 'SHP-OVER-HGT',
    dimensions: { length: 3.0, width: 2.0, height: 3.5 },
    volume: 21,
    weight: 2000,
    segmentRange: { fromIndex: 0, toIndex: 1 }
  };
  const resOverHgt = spatial1.findBestPlacement(oversizedHeight);
  if (resOverHgt !== null) {
    throw new Error('Test 1 Failed: Oversized height package was placed!');
  }
  console.log('✅ TEST 1 PASSED: Oversized packages strictly rejected by container boundaries.');

  // ── TEST 2: 3D COLLISION & OVERLAP PREVENTION ─────────────────
  console.log('\n[TEST 2] Testing 3D Bounding-Box Overlap Collision Prevention...');
  const spatial2 = new SpatialEngine(truckDims);
  const pkgA = {
    shipmentId: 'PKG-A',
    dimensions: { length: 4.0, width: 2.0, height: 1.5 },
    volume: 12,
    weight: 2000,
    segmentRange: { fromIndex: 0, toIndex: 2 }
  };
  const placeA = spatial2.findBestPlacement(pkgA);
  if (!placeA) throw new Error('Test 2 Failed: PKG-A placement failed');
  spatial2.placeBox(pkgA, placeA);

  const pkgB = {
    shipmentId: 'PKG-B',
    dimensions: { length: 4.0, width: 2.0, height: 1.5 },
    volume: 12,
    weight: 2000,
    segmentRange: { fromIndex: 0, toIndex: 2 }
  };
  const placeB = spatial2.findBestPlacement(pkgB);
  if (!placeB) throw new Error('Test 2 Failed: PKG-B placement failed');

  // Verify bounding boxes do not overlap
  const boxA = { x: placeA.position.x, y: placeA.position.y, z: placeA.position.z, dx: placeA.dims.dx, dy: placeA.dims.dy, dz: placeA.dims.dz };
  const boxB = { x: placeB.position.x, y: placeB.position.y, z: placeB.position.z, dx: placeB.dims.dx, dy: placeB.dims.dy, dz: placeB.dims.dz };

  if (SpatialEngine.doBoxesOverlap(boxA, boxB)) {
    throw new Error('Test 2 Failed: Placed boxes overlap in 3D space!');
  }
  spatial2.placeBox(pkgB, placeB);
  console.log(`✅ TEST 2 PASSED: 3D collision check verified! PKG-A at (${placeA.position.x}, ${placeA.position.y}, ${placeA.position.z}), PKG-B at (${placeB.position.x}, ${placeB.position.y}, ${placeB.position.z}). Overlap = 0.`);

  // ── TEST 3: HORIZONTAL 90° ROTATION VALIDATION ───────────────
  console.log('\n[TEST 3] Testing Horizontal 90° Plane Rotation...');
  const narrowTruckDims = { length: 10.0, width: 2.0, height: 3.0 };
  const spatial3 = new SpatialEngine(narrowTruckDims);

  // Item length 1.5m, width 2.4m (width > 2.0m truck width, but rotated fits length 2.4m <= 10.0m and width 1.5m <= 2.0m)
  const rotItem = {
    shipmentId: 'PKG-ROT',
    dimensions: { length: 1.5, width: 2.4, height: 1.2 },
    volume: 4.32,
    weight: 800,
    allowRotation: true,
    segmentRange: { fromIndex: 0, toIndex: 1 }
  };
  const placeRot = spatial3.findBestPlacement(rotItem);
  if (!placeRot || placeRot.orientation !== 'ROTATED_90') {
    throw new Error('Test 3 Failed: Item should have been rotated 90 degrees to fit container width');
  }
  console.log(`✅ TEST 3 PASSED: Item rotated 90° in horizontal plane: dx=${placeRot.dims.dx}m, dy=${placeRot.dims.dy}m (within truck width 2.0m).`);

  // ── TEST 4: NON-STACKABLE CONSTRAINT ─────────────────────────
  console.log('\n[TEST 4] Testing Non-Stackable Item Protection...');
  const spatial4 = new SpatialEngine(truckDims);
  const nonStackableBase = {
    shipmentId: 'PKG-NO-STACK',
    dimensions: { length: 3.0, width: 2.45, height: 1.5 },
    volume: 11.025,
    weight: 2000,
    stackable: false,
    segmentRange: { fromIndex: 0, toIndex: 1 }
  };
  const placeBase = spatial4.findBestPlacement(nonStackableBase);
  spatial4.placeBox(nonStackableBase, placeBase);

  // Attempt to place an item on top (simulated candidate)
  const topCandidate = { x: 0, y: 0, z: 1.5, dx: 2.0, dy: 2.0, dz: 1.0 };
  const supportCheck4 = spatial4.validateVerticalSupportAndStacking(topCandidate, { weight: 500 }, { fromIndex: 0, toIndex: 1 });
  if (supportCheck4.valid) {
    throw new Error('Test 4 Failed: Allowed stacking on top of non-stackable base!');
  }
  console.log(`✅ TEST 4 PASSED: Stacking on non-stackable item rejected: "${supportCheck4.reason}"`);

  // ── TEST 5: FRAGILE ITEM PROTECTION ──────────────────────────
  console.log('\n[TEST 5] Testing Fragile Cargo Protection...');
  const spatial5 = new SpatialEngine(truckDims);
  const fragileBase = {
    shipmentId: 'PKG-FRAGILE-GLASS',
    dimensions: { length: 3.0, width: 2.45, height: 1.5 },
    volume: 11.025,
    weight: 1000,
    fragile: true,
    segmentRange: { fromIndex: 0, toIndex: 1 }
  };
  const placeFragile = spatial5.findBestPlacement(fragileBase);
  spatial5.placeBox(fragileBase, placeFragile);

  const topOnFragile = { x: 0, y: 0, z: 1.5, dx: 2.0, dy: 2.0, dz: 1.0 };
  const supportCheck5 = spatial5.validateVerticalSupportAndStacking(topOnFragile, { weight: 500 }, { fromIndex: 0, toIndex: 1 });
  if (supportCheck5.valid) {
    throw new Error('Test 5 Failed: Allowed stacking on top of fragile cargo!');
  }
  console.log(`✅ TEST 5 PASSED: Stacking on fragile cargo rejected: "${supportCheck5.reason}"`);

  // ── TEST 6: MAX STACK WEIGHT CONSTRAINT ──────────────────────
  console.log('\n[TEST 6] Testing Max Stack Weight Limit...');
  const spatial6 = new SpatialEngine(truckDims);
  const baseBox = {
    shipmentId: 'PKG-BASE-500KG-MAX',
    dimensions: { length: 3.0, width: 2.45, height: 1.5 },
    volume: 11.025,
    weight: 2000,
    stackable: true,
    maxStackWeight: 400, // Max 400kg on top
    segmentRange: { fromIndex: 0, toIndex: 1 }
  };
  const placeBase6 = spatial6.findBestPlacement(baseBox);
  spatial6.placeBox(baseBox, placeBase6);

  // Heavy top item (800kg > 400kg maxStackWeight)
  const heavyTop = { x: 0, y: 0, z: 1.5, dx: 2.0, dy: 2.0, dz: 1.0 };
  const supportCheck6 = spatial6.validateVerticalSupportAndStacking(heavyTop, { weight: 800 }, { fromIndex: 0, toIndex: 1 });
  if (supportCheck6.valid) {
    throw new Error('Test 6 Failed: Allowed excessive weight on top exceeding maxStackWeight!');
  }
  console.log(`✅ TEST 6 PASSED: Exceeding maxStackWeight (800kg > 400kg) strictly rejected: "${supportCheck6.reason}"`);

  // ── TEST 7: CONTACT SUPPORT / NO FLOATING ITEMS ──────────────
  console.log('\n[TEST 7] Testing Contact Support (No Floating Cargo in Mid-Air)...');
  const spatial7 = new SpatialEngine(truckDims);
  const floatingCandidate = { x: 5.0, y: 0, z: 1.5, dx: 2.0, dy: 2.0, dz: 1.0 };
  const supportCheck7 = spatial7.validateVerticalSupportAndStacking(floatingCandidate, { weight: 300 }, { fromIndex: 0, toIndex: 1 });
  if (supportCheck7.valid) {
    throw new Error('Test 7 Failed: Allowed floating package with 0 bottom contact support!');
  }
  console.log(`✅ TEST 7 PASSED: Floating mid-air package rejected: "${supportCheck7.reason}"`);

  // ── TEST 8: ROUTE SEGMENT SPATIAL CONCURRENCY (SPACE REUSE) ──
  console.log('\n[TEST 8] Testing Route-Segment Spatial Concurrency & Location Reuse...');
  const spatial8 = new SpatialEngine(truckDims);
  // Leg 1: Stop 0 -> Stop 1 (Chennai -> Salem)
  const leg1Pkg = {
    shipmentId: 'PKG-LEG1',
    dimensions: { length: 5.0, width: 2.45, height: 3.0 },
    volume: 36.75,
    weight: 5000,
    segmentRange: { fromIndex: 0, toIndex: 1 }
  };
  const placeLeg1 = spatial8.findBestPlacement(leg1Pkg);
  spatial8.placeBox(leg1Pkg, placeLeg1);

  // Leg 2: Stop 1 -> Stop 2 (Salem -> Madurai). Since Leg 1 is unloaded at Stop 1, Leg 2 can reuse the front of trailer (x=0, y=0, z=0)!
  const leg2Pkg = {
    shipmentId: 'PKG-LEG2',
    dimensions: { length: 5.0, width: 2.45, height: 3.0 },
    volume: 36.75,
    weight: 5000,
    segmentRange: { fromIndex: 1, toIndex: 2 }
  };
  const placeLeg2 = spatial8.findBestPlacement(leg2Pkg);
  if (!placeLeg2 || placeLeg2.position.x !== 0) {
    throw new Error('Test 8 Failed: Downstream non-concurrent cargo should reuse floor space at x=0');
  }
  console.log('✅ TEST 8 PASSED: Spatial location reused cleanly across non-concurrent route legs at x=0.');

  // ── TEST 9: LIFO ACCESSIBILITY & UNLOAD SEQUENCING ────────────
  console.log('\n[TEST 9] Testing LIFO Door Accessibility & Obstruction Scoring...');
  const optResult = generateLoadPlan({
    truck: {
      vehicleId: 'TRK-PHYSICAL-TEST',
      capacityVolume: 100,
      capacityWeight: 20000,
      dimensions: truckDims
    },
    route: {
      routeId: 'RTE-LIFO-TEST',
      stops: ['A', 'B', 'C', 'D'],
      distance: 300
    },
    shipments: [
      { shipmentId: 'CARGO-EARLY-DELIVERY', pickup: 'A', delivery: 'B', volume: 20, weight: 3000, priority: 'STANDARD' },
      { shipmentId: 'CARGO-LATE-DELIVERY', pickup: 'A', delivery: 'D', volume: 40, weight: 6000, priority: 'STANDARD' }
    ]
  });

  const earlyItem = optResult.assignments.find(a => a.shipmentId === 'CARGO-EARLY-DELIVERY');
  const lateItem = optResult.assignments.find(a => a.shipmentId === 'CARGO-LATE-DELIVERY');

  if (earlyItem.unloadingSequence >= lateItem.unloadingSequence) {
    throw new Error('Test 9 Failed: Earlier delivery should have lower unloadingSequence for LIFO priority');
  }
  console.log(`✅ TEST 9 PASSED: LIFO unloading sequence: Early delivery (Stop B) = #${earlyItem.unloadingSequence}, Late delivery (Stop D) = #${lateItem.unloadingSequence}.`);

  // ── TEST 10: 2D OPERATIONAL VISUALIZATION REPRESENTATION ──────
  console.log('\n[TEST 10] Testing 2D Operational Representation Generation...');
  const views = optResult.operational2DViews;
  if (!views || !views.topDownView || !views.sideView) {
    throw new Error('Test 10 Failed: Operational 2D views missing');
  }

  const nextStopTag = views.topDownView.find(s => s.shipmentId === 'CARGO-EARLY-DELIVERY');
  if (!nextStopTag || nextStopTag.operationalTag !== 'DELIVERED_AT_NEXT_STOP') {
    throw new Error('Test 10 Failed: Early delivery cargo was not tagged DELIVERED_AT_NEXT_STOP');
  }
  console.log('✅ TEST 10 PASSED: 2D operational representation generated with accurate operational tags.');

  console.log('\n===============================================================');
  console.log('🎉 ALL 10 PHYSICAL LOADING & GEOMETRY TESTS PASSED (100%)');
  console.log('===============================================================');
};

runPhysicalLoadingTestSuite();
