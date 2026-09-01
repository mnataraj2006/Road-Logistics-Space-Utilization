import { generateLoadPlan } from '../optimizer/index.js';
import { verifyDomainInvariants } from './domainVerificationHelper.js';

const runOptimizerFixturesTestSuite = () => {
  console.log('\n===============================================================');
  console.log('STARTING 10 OPTIMIZER FIXTURES WITH DOMAIN INVARIANT VERIFICATION');
  console.log('===============================================================');

  const standardTruck = {
    vehicleId: 'TRK-STD-1',
    capacityVolume: 100,
    capacityWeight: 20000,
    dimensions: { length: 13.6, width: 2.45, height: 3.0 }
  };

  const validateOrThrow = (testNum, testName, result, context) => {
    const check = verifyDomainInvariants({
      loadPlanResult: result,
      truck: context.truck,
      route: context.route,
      shipments: context.shipments,
      currentLoad: context.currentLoad || []
    });

    if (!check.isValid) {
      console.error(`❌ INVARIANT VIOLATIONS in [FIXTURE ${testNum}] ${testName}:`, check.violations);
      throw new Error(`Fixture ${testNum} Failed Invariant Verification: ${check.violations.join('; ')}`);
    }
    console.log(`✅ FIXTURE ${testNum} PASSED: ${testName} (All Domain Invariants Strictly Verified)`);
    return check;
  };

  // ── FIXTURE 1: SIMPLE A -> B ──────────────────────────────────
  const route1 = { routeId: 'RTE-1', stops: ['Chennai', 'Bengaluru'], distance: 350 };
  const shipments1 = [
    { shipmentId: 'SHP-1A', pickup: 'Chennai', delivery: 'Bengaluru', volume: 45, weight: 8000, priority: 'STANDARD' },
    { shipmentId: 'SHP-1B', pickup: 'Chennai', delivery: 'Bengaluru', volume: 45, weight: 8000, priority: 'STANDARD' }
  ];
  const res1 = generateLoadPlan({ truck: standardTruck, route: route1, shipments: shipments1 });
  if (res1.assignments.length !== 2) throw new Error('Fixture 1 Failed: Both shipments should fit');
  validateOrThrow(1, 'Simple A -> B', res1, { truck: standardTruck, route: route1, shipments: shipments1 });

  // ── FIXTURE 2: A -> B -> C ────────────────────────────────────
  const route2 = { routeId: 'RTE-2', stops: ['Chennai', 'Salem', 'Coimbatore'], distance: 500 };
  const shipments2 = [
    { shipmentId: 'SHP-2A', pickup: 'Chennai', delivery: 'Salem', volume: 40, weight: 7000 },
    { shipmentId: 'SHP-2B', pickup: 'Salem', delivery: 'Coimbatore', volume: 50, weight: 9000 },
    { shipmentId: 'SHP-2C', pickup: 'Chennai', delivery: 'Coimbatore', volume: 45, weight: 8000 }
  ];
  const res2 = generateLoadPlan({ truck: standardTruck, route: route2, shipments: shipments2 });
  if (res2.assignments.length !== 3) throw new Error('Fixture 2 Failed: All 3 non-overlapping shipments should fit');
  validateOrThrow(2, 'Multi-Hop A -> B -> C', res2, { truck: standardTruck, route: route2, shipments: shipments2 });

  // ── FIXTURE 3: A -> B -> C -> D ──────────────────────────────
  const route3 = { routeId: 'RTE-3', stops: ['Chennai', 'Salem', 'Coimbatore', 'Madurai'], distance: 680 };
  const shipments3 = [
    { shipmentId: 'SHP-3A', pickup: 'Chennai', delivery: 'Salem', volume: 30, weight: 5000 },
    { shipmentId: 'SHP-3B', pickup: 'Salem', delivery: 'Coimbatore', volume: 35, weight: 6000 },
    { shipmentId: 'SHP-3C', pickup: 'Coimbatore', delivery: 'Madurai', volume: 40, weight: 7000 },
    { shipmentId: 'SHP-3D', pickup: 'Chennai', delivery: 'Madurai', volume: 50, weight: 9000 }
  ];
  const res3 = generateLoadPlan({ truck: standardTruck, route: route3, shipments: shipments3 });
  if (res3.assignments.length !== 4) throw new Error('Fixture 3 Failed: All 4 multi-segment shipments should fit');
  validateOrThrow(3, '4-Stop Pipeline A -> B -> C -> D', res3, { truck: standardTruck, route: route3, shipments: shipments3 });

  // ── FIXTURE 4: ROUTE OVERLAP CONCURRENT HEADROOM ─────────────
  const shipments4 = [
    { shipmentId: 'SHP-4A', pickup: 'Chennai', delivery: 'Coimbatore', volume: 60, weight: 11000 },
    { shipmentId: 'SHP-4B', pickup: 'Salem', delivery: 'Madurai', volume: 60, weight: 11000 }
  ];
  const res4 = generateLoadPlan({ truck: standardTruck, route: route3, shipments: shipments4 });
  // Segment Salem -> Coimbatore overlaps: 60 + 60 = 120 > 100 volume. Only 1 can be accepted.
  if (res4.assignments.length !== 1 || res4.unassignedShipments.length !== 1) {
    throw new Error('Fixture 4 Failed: Overlapping segment capacity should reject 1 candidate');
  }
  validateOrThrow(4, 'Route Overlap Capacity Protection', res4, { truck: standardTruck, route: route3, shipments: shipments4 });

  // ── FIXTURE 5: CAPACITY BOUNDARY (EXACT 100% FILL) ────────────
  const shipments5 = [
    { shipmentId: 'SHP-5A', pickup: 'Chennai', delivery: 'Madurai', volume: 50, weight: 10000 },
    { shipmentId: 'SHP-5B', pickup: 'Chennai', delivery: 'Madurai', volume: 50, weight: 10000 }
  ];
  const res5 = generateLoadPlan({ truck: standardTruck, route: route3, shipments: shipments5 });
  if (res5.assignments.length !== 2 || res5.peakVolumeUtilization !== 100.0) {
    throw new Error('Fixture 5 Failed: Exact 100% capacity boundary load failed');
  }
  validateOrThrow(5, 'Capacity Boundary (Exact 100% Fill)', res5, { truck: standardTruck, route: route3, shipments: shipments5 });

  // ── FIXTURE 6: IMPOSSIBLE SHIPMENT (REVERSE ROUTE) ────────────
  const shipments6 = [
    { shipmentId: 'SHP-6-REV', pickup: 'Madurai', delivery: 'Salem', volume: 20, weight: 3000 }
  ];
  const res6 = generateLoadPlan({ truck: standardTruck, route: route3, shipments: shipments6 });
  if (res6.assignments.length !== 0 || res6.unassignedShipments.length !== 1) {
    throw new Error('Fixture 6 Failed: Impossible reverse shipment was not rejected');
  }
  validateOrThrow(6, 'Impossible Reverse Shipment Rejection', res6, { truck: standardTruck, route: route3, shipments: shipments6 });

  // ── FIXTURE 7: DIMENSION COLLISION & BOUNDARY OVERFLOW ────────
  const shipments7 = [
    { shipmentId: 'SHP-7-OVER', pickup: 'Chennai', delivery: 'Madurai', volume: 40, weight: 5000, dimensions: { length: 15.0, width: 2.0, height: 2.0 } }
  ];
  const res7 = generateLoadPlan({ truck: standardTruck, route: route3, shipments: shipments7 });
  if (res7.assignments.length !== 0 || res7.unassignedShipments.length !== 1) {
    throw new Error('Fixture 7 Failed: Oversized length package (15m > 13.6m) was not rejected');
  }
  validateOrThrow(7, 'Dimension Collision & Boundary Protection', res7, { truck: standardTruck, route: route3, shipments: shipments7 });

  // ── FIXTURE 8: WEIGHT OVERFLOW REJECTION ──────────────────────
  const shipments8 = [
    { shipmentId: 'SHP-8-HEAVY', pickup: 'Chennai', delivery: 'Madurai', volume: 20, weight: 26000 }
  ];
  const res8 = generateLoadPlan({ truck: standardTruck, route: route3, shipments: shipments8 });
  if (res8.assignments.length !== 0 || res8.unassignedShipments.length !== 1) {
    throw new Error('Fixture 8 Failed: Overweight package (26,000kg > 20,000kg) was not rejected');
  }
  validateOrThrow(8, 'Weight Capacity Overflow Protection', res8, { truck: standardTruck, route: route3, shipments: shipments8 });

  // ── FIXTURE 9: FRAGILE CARGO PROTECTION ───────────────────────
  const shipments9 = [
    { shipmentId: 'SHP-9-GLASS', pickup: 'Chennai', delivery: 'Madurai', volume: 20, weight: 2000, fragile: true },
    { shipmentId: 'SHP-9-STEEL', pickup: 'Chennai', delivery: 'Madurai', volume: 20, weight: 5000, fragile: false }
  ];
  const res9 = generateLoadPlan({ truck: standardTruck, route: route3, shipments: shipments9 });
  if (res9.assignments.length !== 2) throw new Error('Fixture 9 Failed: Both shipments should fit');
  validateOrThrow(9, 'Fragile Cargo Stacking Integrity', res9, { truck: standardTruck, route: route3, shipments: shipments9 });

  // ── FIXTURE 10: RE-OPTIMIZATION AFTER UNLOAD (LOCKED CARGO) ───
  const currentLockedLoad = [
    { shipmentId: 'SHP-LOCKED-AD', pickupStop: 'Salem', deliveryStop: 'Madurai', volume: 40, weight: 7000, isLocked: true }
  ];
  const newCandidates = [
    { shipmentId: 'SHP-NEW-CD', pickup: 'Coimbatore', delivery: 'Madurai', volume: 30, weight: 4000 }
  ];
  const remainingRoute = { routeId: 'RTE-REMAINING', stops: ['Salem', 'Coimbatore', 'Madurai'], distance: 330 };

  const res10 = generateLoadPlan({
    truck: standardTruck,
    route: remainingRoute,
    shipments: newCandidates,
    currentLoad: currentLockedLoad
  });

  if (res10.assignments.length !== 2) {
    throw new Error('Fixture 10 Failed: Both locked and new cargo should be in re-optimized plan');
  }
  validateOrThrow(10, 'Re-Optimization After Unload with Locked Cargo', res10, {
    truck: standardTruck,
    route: remainingRoute,
    shipments: newCandidates,
    currentLoad: currentLockedLoad
  });

  console.log('\n===============================================================');
  console.log('🎉 ALL 10 OPTIMIZER FIXTURES FULLY VALIDATED WITH 100% SUCCESS!');
  console.log('===============================================================');
};

runOptimizerFixturesTestSuite();
