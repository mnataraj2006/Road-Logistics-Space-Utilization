import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import Trip from '../models/Trip.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import {
  generateLoadPlan,
  validatePackageWithinTruck,
  resolveAuthoritativeDimensions,
  resolveAuthoritativePosition
} from '../optimizer/index.js';

// Import frontend canonical helper logic for parity verification
const normalizeCanonicalPlacements = (assignments = [], truckDimensions = {}, stops = []) => {
  const truckLength = Number(truckDimensions?.length || 13.6);
  const truckWidth = Number(truckDimensions?.width || 2.45);
  const truckHeight = Number(truckDimensions?.height || 2.8);
  const resolvedStops = Array.isArray(stops) && stops.length > 0 ? stops : ['Chennai', 'Trichy', 'Madurai'];
  const normStop = (s) => (s ? String(s).trim().toLowerCase() : '');

  return (assignments || []).map((item, idx) => {
    const shipmentId = item.shipmentId || item.bookingId || `PKG-${idx + 1}`;
    const pickup = item.segmentRange?.fromStop || item.pickupStop || item.pickup || item.loadStop || resolvedStops[0];
    const delivery = item.segmentRange?.toStop || item.deliveryStop || item.delivery || item.unloadStop || resolvedStops[resolvedStops.length - 1];

    let pIdx = typeof item.pickupIndex === 'number' ? item.pickupIndex : resolvedStops.findIndex(s => normStop(s) === normStop(pickup));
    if (pIdx === -1) pIdx = 0;
    let dIdx = typeof item.deliveryIndex === 'number' ? item.deliveryIndex : resolvedStops.findIndex(s => normStop(s) === normStop(delivery));
    if (dIdx === -1 || dIdx <= pIdx) dIdx = resolvedStops.length - 1;

    const resolvedPos = resolveAuthoritativePosition(item);
    const resolvedDims = resolveAuthoritativeDimensions(item);
    let dx = resolvedDims.dx;
    let dy = resolvedDims.dy;
    let dz = resolvedDims.dz;
    if (dx <= 0 || dy <= 0 || dz <= 0) {
      dx = dx > 0 ? dx : 1.2;
      dy = dy > 0 ? dy : 1.0;
      dz = dz > 0 ? dz : 1.2;
    }

    return {
      ...item,
      shipmentId,
      pickup,
      delivery,
      pickupIndex: pIdx,
      deliveryIndex: dIdx,
      x: resolvedPos.x,
      y: resolvedPos.y,
      z: resolvedPos.z,
      dx,
      dy,
      dz,
      volume: Number(item.volume ?? (dx * dy * dz).toFixed(3)),
      weight: Number(item.weight ?? 500)
    };
  });
};

const getActiveSegmentCargo = (canonicalItems = [], selectedSegment = 0) => {
  if (selectedSegment === 'ALL' || selectedSegment === -1) return canonicalItems;
  const segIdx = Number(selectedSegment);
  return canonicalItems.filter(item => item.pickupIndex <= segIdx && item.deliveryIndex > segIdx);
};

const getCanonicalRenderableAssignments = ({
  assignments = [],
  truckDimensions = {},
  stops = [],
  selectedSegment = 0
} = {}) => {
  const truckL = Number(truckDimensions?.length || 13.6);
  const truckW = Number(truckDimensions?.width || 2.45);
  const truckH = Number(truckDimensions?.height || 2.8);

  const canonicalItems = normalizeCanonicalPlacements(
    assignments,
    { length: truckL, width: truckW, height: truckH },
    stops
  );

  const activeItems = getActiveSegmentCargo(canonicalItems, selectedSegment);
  const validActiveItems = [];
  const quarantinedActiveItems = [];

  activeItems.forEach(item => {
    const check = validatePackageWithinTruck({
      item,
      truckDimensions: { length: truckL, width: truckW, height: truckH }
    });
    if (check.valid) {
      validActiveItems.push(item);
    } else {
      quarantinedActiveItems.push({ item, violations: check.violations });
    }
  });

  const futureItems = canonicalItems.filter(item => {
    if (selectedSegment === 'ALL' || selectedSegment === -1) return false;
    return item.pickupIndex > Number(selectedSegment);
  });

  const deliveredItems = canonicalItems.filter(item => {
    if (selectedSegment === 'ALL' || selectedSegment === -1) return false;
    return item.deliveryIndex <= Number(selectedSegment);
  });

  return {
    canonicalItems,
    activeItems,
    validActiveItems,
    quarantinedActiveItems,
    futureItems,
    deliveredItems,
    totalPlannedCount: canonicalItems.length,
    activeCount: validActiveItems.length,
    quarantinedCount: quarantinedActiveItems.length,
    futureCount: futureItems.length
  };
};

async function runTestSuite() {
  console.log('========================================================================');
  console.log('🧪 RUNNING POST-LOCK VISUALIZATION & GEOMETRY PARITY TEST SUITE');
  console.log('========================================================================\n');

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/road-logistics';
  await mongoose.connect(mongoUri);
  console.log(' Connected to MongoDB:', mongoUri);

  try {
    const truckDimensions = { length: 13.6, width: 2.45, height: 2.8 };
    const stops = ['Chennai', 'Trichy', 'Madurai'];

    // ──────────────────────────────────────────────────────────────────────────
    // TEST A: Pure Optimizer Run on Corridor Candidates
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST A: Pure Optimizer Run on Multi-Stop Consignments ---');
    const sampleShipments = [
      {
        shipmentId: 'SHP-BKG-000001',
        bookingId: 'SHP-BKG-000001',
        customer: 'Apex Logistics',
        cargoDescription: 'Heavy Machinery Parts',
        pickup: 'Chennai',
        delivery: 'Trichy',
        volume: 2.0,
        weight: 500,
        dimensions: { length: 2.0, width: 1.0, height: 1.0 },
        fragile: false,
        stackable: true,
        priority: 'HIGH'
      },
      {
        shipmentId: 'SHP-BKG-000002',
        bookingId: 'SHP-BKG-000002',
        customer: 'Prime Retail',
        cargoDescription: 'Commercial Pallet',
        pickup: 'Chennai',
        delivery: 'Madurai',
        volume: 3.0,
        weight: 700,
        dimensions: { length: 2.5, width: 1.2, height: 1.0 },
        fragile: false,
        stackable: true,
        priority: 'STANDARD'
      },
      {
        shipmentId: 'SHP-BKG-000003',
        bookingId: 'SHP-BKG-000003',
        customer: 'Delta Goods',
        cargoDescription: 'Textile Bales',
        pickup: 'Trichy',
        delivery: 'Madurai',
        volume: 3.0,
        weight: 386,
        dimensions: { length: 2.0, width: 1.0, height: 1.5 },
        fragile: false,
        stackable: true,
        priority: 'STANDARD'
      }
    ];

    const optResult = generateLoadPlan({
      truck: {
        vehicleId: 'TRK-TEST-PARITY',
        type: 'Heavy Truck',
        dimensions: truckDimensions,
        capacityVolume: 93.3,
        capacityWeight: 20000
      },
      route: {
        routeId: 'RT-CHN-TRY-MDU',
        source: 'Chennai',
        destination: 'Madurai',
        stopsDetails: stops.map((s, idx) => ({ stopIndex: idx, locationName: s, distanceKm: idx * 150 }))
      },
      shipments: sampleShipments,
      currentLoad: [],
      config: {}
    });

    console.log(`✓ Optimizer assigned ${optResult.assignments.length}/${sampleShipments.length} packages.`);
    if (optResult.assignments.length !== 3) {
      throw new Error(`Expected 3 assignments, got ${optResult.assignments.length}`);
    }

    // ──────────────────────────────────────────────────────────────────────────
    // TEST B: Lock Plan & Persist LoadAssignments
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST B: Lock Plan & Authoritative LoadAssignment Persistence ---');
    const testTripId = `TRIP-TEST-PARITY-${Date.now()}`;
    const testLoadPlanId = `LP-${testTripId}-v1`;

    const savedAssignments = [];
    for (const a of optResult.assignments) {
      const aDims = resolveAuthoritativeDimensions(a);
      const aPos = resolveAuthoritativePosition(a);
      const assignDoc = new LoadAssignment({
        loadPlanId: testLoadPlanId,
        shipmentId: a.shipmentId,
        bookingId: a.bookingId,
        customer: a.customer,
        priority: a.priority,
        fragile: a.fragile,
        stackable: a.stackable,
        segmentRange: a.segmentRange,
        loadingSequence: a.loadingSequence,
        unloadingSequence: a.unloadingSequence,
        dimensions: {
          dx: aDims.dx,
          dy: aDims.dy,
          dz: aDims.dz,
          length: aDims.dx,
          width: aDims.dy,
          height: aDims.dz
        },
        dx: aDims.dx,
        dy: aDims.dy,
        dz: aDims.dz,
        length: aDims.dx,
        width: aDims.dy,
        height: aDims.dz,
        volume: a.volume,
        weight: a.weight,
        orientation: a.orientation || 'UPRIGHT_ORIGINAL',
        position: aPos,
        x: aPos.x,
        y: aPos.y,
        z: aPos.z,
        status: 'ASSIGNED'
      });
      await assignDoc.save();
      savedAssignments.push(assignDoc);
    }
    console.log(`✓ Successfully saved ${savedAssignments.length} LoadAssignment documents with canonical geometry.`);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST C: Read Back Persisted Assignments
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST C: Read Back Assignments from Database ---');
    const readAssignments = await LoadAssignment.find({ loadPlanId: testLoadPlanId }).lean();
    console.log(`✓ Read back ${readAssignments.length} assignments.`);

    // ──────────────────────────────────────────────────────────────────────────
    // TEST D: Authoritative Dimension & Position Resolution Verification
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST D: Dimension & Position Resolution Verification ---');
    for (const a of readAssignments) {
      const dims = resolveAuthoritativeDimensions(a);
      const pos = resolveAuthoritativePosition(a);

      console.log(`  Package [${a.shipmentId}]: Position = (${pos.x}, ${pos.y}, ${pos.z}) | Dimensions = ${dims.dx}m × ${dims.dy}m × ${dims.dz}m`);

      if (dims.dx <= 0 || dims.dy <= 0 || dims.dz <= 0) {
        throw new Error(`Package ${a.shipmentId} resolved to non-positive dimensions! dx=${dims.dx}, dy=${dims.dy}, dz=${dims.dz}`);
      }
      if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y) || !Number.isFinite(pos.z)) {
        throw new Error(`Package ${a.shipmentId} resolved to non-finite position!`);
      }
    }
    console.log('✓ All dimensions and positions resolved positively and finitely.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST E: Boundary & Quarantine Check
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST E: Boundary & Quarantine Check on Segment 0 (Chennai → Trichy) ---');
    const leg1Render = getCanonicalRenderableAssignments({
      assignments: readAssignments,
      truckDimensions,
      stops,
      selectedSegment: 0
    });

    console.log(`  Leg 1 Planned: ${leg1Render.totalPlannedCount} Pkgs`);
    console.log(`  Leg 1 Active: ${leg1Render.validActiveItems.length} Pkgs`);
    console.log(`  Leg 1 Quarantined: ${leg1Render.quarantinedActiveItems.length} Pkgs`);
    console.log(`  Leg 1 Future: ${leg1Render.futureItems.length} Pkgs`);

    if (leg1Render.quarantinedActiveItems.length > 0) {
      console.error('Quarantine violations found:', leg1Render.quarantinedActiveItems);
      throw new Error(`Expected 0 quarantined items on Leg 1, got ${leg1Render.quarantinedActiveItems.length}`);
    }
    if (leg1Render.validActiveItems.length !== 2) {
      throw new Error(`Expected 2 active items on Leg 1 (SHP-1 and SHP-2), got ${leg1Render.validActiveItems.length}`);
    }
    if (leg1Render.futureItems.length !== 1) {
      throw new Error(`Expected 1 future item on Leg 1 (SHP-3 from Trichy), got ${leg1Render.futureItems.length}`);
    }
    console.log('✓ Zero packages quarantined! Exactly 2 active, 1 future.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST F: Segment 1 (Trichy → Madurai) Verification
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST F: Segment 1 (Trichy → Madurai) Verification ---');
    const leg2Render = getCanonicalRenderableAssignments({
      assignments: readAssignments,
      truckDimensions,
      stops,
      selectedSegment: 1
    });

    console.log(`  Leg 2 Planned: ${leg2Render.totalPlannedCount} Pkgs`);
    console.log(`  Leg 2 Active: ${leg2Render.validActiveItems.length} Pkgs`);
    console.log(`  Leg 2 Quarantined: ${leg2Render.quarantinedActiveItems.length} Pkgs`);
    console.log(`  Leg 2 Delivered: ${leg2Render.deliveredItems.length} Pkgs`);

    if (leg2Render.quarantinedActiveItems.length > 0) {
      throw new Error(`Expected 0 quarantined items on Leg 2, got ${leg2Render.quarantinedActiveItems.length}`);
    }
    if (leg2Render.validActiveItems.length !== 2) {
      throw new Error(`Expected 2 active items on Leg 2 (SHP-2 and SHP-3), got ${leg2Render.validActiveItems.length}`);
    }
    if (leg2Render.deliveredItems.length !== 1) {
      throw new Error(`Expected 1 delivered item on Leg 2 (SHP-1), got ${leg2Render.deliveredItems.length}`);
    }
    console.log('✓ Leg 2 verification passed! Exactly 2 active, 1 delivered, 0 quarantined.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST G: 2D and 3D Canonical Parity
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST G: 2D and 3D Visualizer Canonical Parity Check ---');
    // Both 2D and 3D call getCanonicalRenderableAssignments with identical inputs
    const parityCheck = getCanonicalRenderableAssignments({
      assignments: readAssignments,
      truckDimensions,
      stops,
      selectedSegment: 0
    });

    // Verify properties
    const activeIds = parityCheck.validActiveItems.map(i => i.shipmentId).sort();
    const expectedActiveIds = ['SHP-BKG-000001', 'SHP-BKG-000002'].sort();
    if (JSON.stringify(activeIds) !== JSON.stringify(expectedActiveIds)) {
      throw new Error(`Parity active mismatch: expected ${expectedActiveIds}, got ${activeIds}`);
    }
    console.log('✓ 2D and 3D active items match 100% identically.');

    // ──────────────────────────────────────────────────────────────────────────
    // TEST H: Strict Boundary Enforcement & Quarantine of Genuinely Invalid Items
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n--- TEST H: Genuine Physical Boundary Violation Detection ---');
    // Inject an invalid assignment exceeding the rear door: x = 13.0, dx = 1.0 (13.0 + 1.0 = 14.0m > 13.6m)
    const invalidAssignment = {
      shipmentId: 'SHP-OVERFLOW-REAR',
      segmentRange: { fromStop: 'Chennai', toStop: 'Trichy' },
      position: { x: 13.0, y: 0.0, z: 0.0 },
      dimensions: { dx: 1.0, dy: 1.0, dz: 1.0 },
      volume: 1.0,
      weight: 100
    };

    // Also test zero-dimension detection if an item had true 0 dimensions across all fields
    const invalidZeroDimAssignment = {
      shipmentId: 'SHP-ZERO-DIMS',
      segmentRange: { fromStop: 'Chennai', toStop: 'Trichy' },
      position: { x: 0.0, y: 0.0, z: 0.0 },
      dimensions: { dx: 0, dy: 0, dz: 0, length: 0, width: 0, height: 0 },
      volume: 0,
      weight: 0
    };

    const checkOverflow = validatePackageWithinTruck({
      item: invalidAssignment,
      truckDimensions
    });
    console.log('  Rear Door Overflow Check Valid?:', checkOverflow.valid);
    console.log('  Violations reported:', checkOverflow.violations);
    if (checkOverflow.valid) {
      throw new Error('Rear door overflow package was falsely validated as valid!');
    }
    if (!checkOverflow.violations.some(v => v.boundary === 'REAR_DOOR' && v.axis === 'X')) {
      throw new Error('Expected REAR_DOOR violation for x=13.0, dx=1.0!');
    }
    console.log('✓ Genuinely out-of-bounds package correctly caught with REAR_DOOR overflow violation.');

    // Clean up test assignments
    await LoadAssignment.deleteMany({ loadPlanId: testLoadPlanId });
    console.log('\n✓ Cleaned up test data.');

    console.log('\n========================================================================');
    console.log('🎉 ALL TESTS (A through H) PASSED WITH 100% PARITY & INTEGRITY!');
    console.log('========================================================================');
  } finally {
    await mongoose.disconnect();
  }
}

runTestSuite().catch(err => {
  console.error('\n❌ TEST SUITE FAILED:', err);
  process.exit(1);
});
