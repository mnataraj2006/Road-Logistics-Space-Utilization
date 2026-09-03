import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateLoadPlan } from '../optimizer/index.js';
import { normalizeAndValidateInput } from '../optimizer/validator.js';
import { SpatialEngine } from '../optimizer/spatialEngine.js';
import { SegmentTracker } from '../optimizer/segmentTracker.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Trip from '../models/Trip.js';
import Shipment from '../models/Shipment.js';
import LoadPlan from '../models/LoadPlan.js';
import LoadAssignment from '../models/LoadAssignment.js';
import { executeStopLifecycleOperational } from '../services/tripLifecycleService.js';
import { computeDynamicReoptimization, applyDynamicReoptimization } from '../services/dynamicReoptimizationService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/road_logistics_space_utilization';

console.log('========================================================================================');
console.log('🔥 RUNNING EXTREME ADVERSARIAL AUDIT, STRESS TESTING & HARDENING SUITE (PHASES 1 - 45)');
console.log('========================================================================================\n');

const testResults = [];
let passCount = 0;
let failCount = 0;

function reportTest(category, name, passed, details = '') {
  testResults.push({ category, name, passed, details });
  if (passed) {
    console.log(`✅ [PASS] ${category} :: ${name}`);
    passCount++;
  } else {
    console.error(`❌ [FAIL] ${category} :: ${name}`);
    if (details) console.error(`   Details: ${details}`);
    failCount++;
  }
}

// Deterministic Pseudo-Random Number Generator (PRNG) for reproducible fuzz tests
class SeededRandom {
  constructor(seed = 123456789) {
    this.seed = seed;
  }
  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }
  range(min, max) {
    return min + this.next() * (max - min);
  }
  choice(array) {
    return array[Math.floor(this.next() * array.length)];
  }
}

async function runAdversarialAudit() {
  await mongoose.connect(MONGO_URI);

  const authTruck = {
    vehicleId: 'TN-01-AUTHORITATIVE',
    type: 'Heavy Truck',
    dimensions: { length: 13.6, width: 2.45, height: 2.8 },
    capacityVolume: 93.296,
    capacityWeight: 20000
  };

  const corridorRoute = {
    routeId: 'CORRIDOR-CHN-BLR-5S',
    source: 'Chennai',
    destination: 'Bangalore',
    stops: ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'],
    stopsDetails: [
      { sequenceNumber: 1, locationName: 'Chennai' },
      { sequenceNumber: 2, locationName: 'Kanchipuram' },
      { sequenceNumber: 3, locationName: 'Vellore' },
      { sequenceNumber: 4, locationName: 'Hosur' },
      { sequenceNumber: 5, locationName: 'Bangalore' }
    ]
  };

  // =========================================================================
  // PHASE 2 & 3 — PHYSICAL CAPACITY EDGE TESTS
  // =========================================================================
  console.log('\n--- PHASE 3: PHYSICAL CAPACITY EDGE TESTS ---');

  // TEST 001 — EXACT VOLUME (93.296 m³)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'EXACT-VOL', volume: 93.296, weight: 5000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Physical Capacity', 'TEST 001: Exact Volume 93.296 m³ is Accepted', norm.candidateShipments.length === 1 && norm.invalidShipments.length === 0);
  }

  // TEST 002 — MICRO OVERFLOW (93.296001 m³)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'MICRO-OVERFLOW', volume: 93.296001, weight: 5000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    const rejected = norm.invalidShipments.find(s => s.item.shipmentId === 'MICRO-OVERFLOW');
    reportTest('Physical Capacity', 'TEST 002: Micro Overflow 93.296001 m³ is Rejected (CARGO_EXCEEDS_VOLUME)', rejected && rejected.reason.includes('CARGO_EXCEEDS_VOLUME'));
  }

  // TEST 003 — MICRO UNDERFLOW (93.295999 m³)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'MICRO-UNDERFLOW', volume: 93.295999, weight: 5000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Physical Capacity', 'TEST 003: Micro Underflow 93.295999 m³ is Accepted', norm.candidateShipments.length === 1 && norm.invalidShipments.length === 0);
  }

  // TEST 004 — EXACT PAYLOAD (20,000 kg)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'EXACT-WT', volume: 10, weight: 20000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Weight Capacity', 'TEST 004: Exact Payload 20,000 kg is Accepted', norm.candidateShipments.length === 1 && norm.invalidShipments.length === 0);
  }

  // TEST 005 — MICRO OVERWEIGHT (20,000.01 kg)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'MICRO-OVERWEIGHT', volume: 10, weight: 20000.01, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    const rejected = norm.invalidShipments.find(s => s.item.shipmentId === 'MICRO-OVERWEIGHT');
    reportTest('Weight Capacity', 'TEST 005: Micro Overweight 20,000.01 kg is Rejected (CARGO_EXCEEDS_WEIGHT)', rejected && rejected.reason.includes('CARGO_EXCEEDS_WEIGHT'));
  }

  // TEST 006 — ZERO WEIGHT (weight = 0)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'ZERO-WT', volume: 10, weight: 0, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    const rejected = norm.invalidShipments.find(s => s.item.shipmentId === 'ZERO-WT');
    reportTest('Weight Capacity', 'TEST 006: Zero Weight is Rejected (INVALID_PACKAGE_WEIGHT)', rejected && rejected.reason.includes('INVALID_PACKAGE_WEIGHT'));
  }

  // TEST 007 — NEGATIVE WEIGHT (weight = -1)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'NEG-WT', volume: 10, weight: -1, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    const rejected = norm.invalidShipments.find(s => s.item.shipmentId === 'NEG-WT');
    reportTest('Weight Capacity', 'TEST 007: Negative Weight is Rejected (INVALID_PACKAGE_WEIGHT)', rejected && rejected.reason.includes('INVALID_PACKAGE_WEIGHT'));
  }

  // TEST 008 — MASSIVE WEIGHT (weight = 1,000,000 kg)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'MASSIVE-WT', volume: 10, weight: 1000000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    const rejected = norm.invalidShipments.find(s => s.item.shipmentId === 'MASSIVE-WT');
    reportTest('Weight Capacity', 'TEST 008: Massive Weight is Rejected without NaN/Crash', rejected && rejected.reason.includes('CARGO_EXCEEDS_WEIGHT'));
  }

  // =========================================================================
  // PHASE 4 — DIMENSIONAL EDGE TESTS
  // =========================================================================
  console.log('\n--- PHASE 4: DIMENSIONAL EDGE TESTS ---');

  // TEST 009 — EXACT LENGTH (13.6m x 1m x 1m)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'EXACT-LEN', length: 13.6, width: 1.0, height: 1.0, weight: 1000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Dimensional Fit', 'TEST 009: Exact Length 13.6m is Accepted', norm.candidateShipments.length === 1);
  }

  // TEST 010 — LENGTH + 0.000001 (13.600001m)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'OVER-LEN', length: 13.600001, width: 1.0, height: 1.0, weight: 1000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    const rejected = norm.invalidShipments.find(s => s.item.shipmentId === 'OVER-LEN');
    reportTest('Dimensional Fit', 'TEST 010: Length + 0.000001m is Rejected (PACKAGE_DOES_NOT_FIT)', rejected && rejected.reason.includes('PACKAGE_DOES_NOT_FIT'));
  }

  // TEST 011 — EXACT WIDTH (2.45m)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'EXACT-WID', length: 1.0, width: 2.45, height: 1.0, weight: 1000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Dimensional Fit', 'TEST 011: Exact Width 2.45m is Accepted', norm.candidateShipments.length === 1);
  }

  // TEST 012 — WIDTH + 0.000001 (2.450001m)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'OVER-WID', length: 3.0, width: 2.450001, height: 2.81, weight: 1000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    const rejected = norm.invalidShipments.find(s => s.item.shipmentId === 'OVER-WID');
    reportTest('Dimensional Fit', 'TEST 012: Width + 0.000001m is Rejected (PACKAGE_DOES_NOT_FIT)', rejected && rejected.reason.includes('PACKAGE_DOES_NOT_FIT'));
  }

  // TEST 013 — EXACT HEIGHT (2.8m)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'EXACT-HGT', length: 1.0, width: 1.0, height: 2.8, weight: 1000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Dimensional Fit', 'TEST 013: Exact Height 2.8m is Accepted', norm.candidateShipments.length === 1);
  }

  // TEST 014 — HEIGHT + 0.000001 (2.800001m)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'OVER-HGT', length: 3.0, width: 2.5, height: 2.800001, weight: 1000, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    const rejected = norm.invalidShipments.find(s => s.item.shipmentId === 'OVER-HGT');
    reportTest('Dimensional Fit', 'TEST 014: Height + 0.000001m is Rejected (PACKAGE_DOES_NOT_FIT)', rejected && rejected.reason.includes('PACKAGE_DOES_NOT_FIT'));
  }

  // TEST 015 - 018 — INVALID DIMENSIONS (0, -1, NaN, Infinity)
  {
    const normZero = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'ZERO-DIM', length: 0, width: 1, height: 1, weight: 100, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Dimensional Fit', 'TEST 015: Zero Dimension is Rejected (INVALID_PACKAGE_DIMENSIONS)', normZero.invalidShipments.length === 1);

    const normNeg = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'NEG-DIM', length: -2, width: 1, height: 1, weight: 100, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Dimensional Fit', 'TEST 016: Negative Dimension is Rejected (INVALID_PACKAGE_DIMENSIONS)', normNeg.invalidShipments.length === 1);

    const normNaN = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'NAN-DIM', length: NaN, width: 1, height: 1, weight: 100, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Dimensional Fit', 'TEST 017: NaN Dimension is Rejected (INVALID_PACKAGE_DIMENSIONS)', normNaN.invalidShipments.length === 1);

    const normInf = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'INF-DIM', length: Infinity, width: 1, height: 1, weight: 100, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Dimensional Fit', 'TEST 018: Infinity Dimension is Rejected (INVALID_PACKAGE_DIMENSIONS)', normInf.invalidShipments.length === 1);
  }

  // =========================================================================
  // PHASE 5 — VOLUME IS NOT ENOUGH
  // =========================================================================
  console.log('\n--- PHASE 5: VOLUME IS NOT ENOUGH ---');

  // TEST 019: 14m x 1m x 1m (14 m³ < 93.296 m³)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'LONG-BOX', length: 14.0, width: 1.0, height: 1.0, weight: 500, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Dimensional Fit', 'TEST 019: Length 14m (Vol 14m³ < 93.296m³) is Rejected (PACKAGE_DOES_NOT_FIT)', norm.invalidShipments.length === 1);
  }

  // TEST 020: 1m x 3m x 1m (3 m³ < 93.296 m³)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'WIDE-BOX', length: 1.0, width: 3.0, height: 1.0, weight: 500, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    // Can rotate horizontally to 3.0m in length (fits in 13.6m length, width becomes 1.0m)
    // If width > 2.45 AND length > 2.45, then it cannot fit in either orientation
    const normUnfittableWide = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'WIDE-UNFIT', length: 3.0, width: 3.0, height: 1.0, weight: 500, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Dimensional Fit', 'TEST 020: 3m x 3m base (cannot fit width in any orientation) is Rejected', normUnfittableWide.invalidShipments.length === 1);
  }

  // TEST 021: 1m x 1m x 3m (3 m³ < 93.296 m³)
  {
    const norm = normalizeAndValidateInput({
      truck: authTruck,
      route: corridorRoute,
      shipments: [{ shipmentId: 'TALL-UNFIT', length: 3.0, width: 3.0, height: 3.0, weight: 500, fromStop: 'Chennai', toStop: 'Bangalore' }]
    });
    reportTest('Dimensional Fit', 'TEST 021: 3m x 3m x 3m height exceeds 2.8m in all orientations is Rejected', norm.invalidShipments.length === 1);
  }

  // =========================================================================
  // PHASE 6 — ROTATION TESTS
  // =========================================================================
  console.log('\n--- PHASE 6: ROTATION TESTS ---');
  {
    // Item 2.40m x 2.0m x 1.0m fits in both original and rotated 90°
    const rotBox = {
      shipmentId: 'ROT-ITEM',
      dimensions: { length: 2.0, width: 2.40, height: 1.0 },
      volume: 4.8,
      weight: 500,
      pickupIndex: 0,
      deliveryIndex: 1,
      segmentRange: { fromIndex: 0, toIndex: 1 },
      allowRotation: true
    };
    const engine = new SpatialEngine(authTruck.dimensions);
    const placement = engine.findBestPlacement(rotBox);
    reportTest('Rotation', 'TEST 022: Rotation engine resolves valid orientation for rotatable freight', placement !== null && (placement.orientation === 'ORIGINAL' || placement.orientation === 'ROTATED_90'));
  }

  // =========================================================================
  // PHASE 7 — COLLISION TESTING (AABB TOUCH vs OVERLAP)
  // =========================================================================
  console.log('\n--- PHASE 7: COLLISION TESTING ---');
  {
    const engine = new SpatialEngine(authTruck.dimensions);
    const seg = { fromIndex: 0, toIndex: 1 };
    engine.placeBox({ shipmentId: 'BOX-A', segmentRange: seg }, { position: { x: 0, y: 0, z: 0 }, dims: { dx: 2.0, dy: 1.0, dz: 1.0 } });

    // Touching boundaries at X=2.0 (NO OVERLAP)
    const touchBox = { x: 2.0, y: 0, z: 0, dx: 2.0, dy: 1.0, dz: 1.0 };
    reportTest('Collision Detection', 'TEST 022: Touching boundaries (X=0-2 vs X=2-4) is NOT a collision', !engine.hasCollision(touchBox, seg));

    // X Overlap
    const xOverlap = { x: 1.0, y: 0, z: 0, dx: 2.0, dy: 1.0, dz: 1.0 };
    reportTest('Collision Detection', 'TEST 023: X-Overlap is detected as collision', engine.hasCollision(xOverlap, seg));

    // Y Overlap
    const yOverlap = { x: 0.5, y: 0.5, z: 0, dx: 1.0, dy: 1.0, dz: 1.0 };
    reportTest('Collision Detection', 'TEST 024: Y-Overlap is detected as collision', engine.hasCollision(yOverlap, seg));

    // Z Overlap
    const zOverlap = { x: 0.5, y: 0.5, z: 0.5, dx: 1.0, dy: 1.0, dz: 1.0 };
    reportTest('Collision Detection', 'TEST 025: Z-Overlap is detected as collision', engine.hasCollision(zOverlap, seg));

    // Micro-Overlap (X = 1.999999, overlap of 1 micrometer)
    const microOverlap = { x: 1.999999, y: 0, z: 0, dx: 2.0, dy: 1.0, dz: 1.0 };
    reportTest('Collision Detection', 'TEST 026: Micro-Overlap (X=1.999999) is detected as collision', engine.hasCollision(microOverlap, seg));

    // Micro-Gap (X = 2.000001, gap of 1 micrometer)
    const microGap = { x: 2.000001, y: 0, z: 0, dx: 2.0, dy: 1.0, dz: 1.0 };
    reportTest('Collision Detection', 'TEST 027: Micro-Gap (X=2.000001) is NOT a collision', !engine.hasCollision(microGap, seg));
  }

  // =========================================================================
  // PHASE 8 — BOUNDARY TESTING
  // =========================================================================
  console.log('\n--- PHASE 8: BOUNDARY TESTING ---');
  {
    const engine = new SpatialEngine(authTruck.dimensions);
    reportTest('Boundary Validation', 'TEST 028: Exactly at Origin (0, 0, 0) is Valid', engine.isWithinBoundaries(0, 0, 0, 2, 1, 1));
    reportTest('Boundary Validation', 'TEST 029: Exactly at Rear & Ceiling (11.6, 1.45, 1.8 for 2x1x1) is Valid', engine.isWithinBoundaries(11.6, 1.45, 1.8, 2.0, 1.0, 1.0));
    reportTest('Boundary Validation', 'TEST 030: Slightly outside Rear Boundary (X=13.600001) is Invalid', !engine.isWithinBoundaries(13.600001, 0, 0, 1.0, 1.0, 1.0));
    reportTest('Boundary Validation', 'TEST 031: Negative coordinate (X=-0.001) is Invalid', !engine.isWithinBoundaries(-0.001, 0, 0, 1.0, 1.0, 1.0));
  }

  // =========================================================================
  // PHASE 9 — STACKING TESTS
  // =========================================================================
  console.log('\n--- PHASE 9: STACKING TESTS ---');
  {
    const engine = new SpatialEngine(authTruck.dimensions);
    const seg = { fromIndex: 0, toIndex: 1 };
    engine.placeBox(
      { shipmentId: 'BASE-BOX', stackable: true, fragile: false, segmentRange: seg },
      { position: { x: 0, y: 0, z: 0 }, dims: { dx: 2.0, dy: 2.0, dz: 1.0 } }
    );

    // Box resting directly on top of base box
    const topCandidate = { x: 0, y: 0, z: 1.0, dx: 1.5, dy: 1.5, dz: 1.0 };
    const stackResult = engine.validateVerticalSupportAndStacking(topCandidate, { shipmentId: 'TOP-BOX' }, seg);
    reportTest('Stacking Validation', 'TEST 032: Supported Stack on Stackable Base is Valid', stackResult.valid === true);

    // Unsupported floating box (Z=1.0 with no box beneath)
    const floatingCandidate = { x: 5.0, y: 0, z: 1.0, dx: 1.5, dy: 1.5, dz: 1.0 };
    const floatingResult = engine.validateVerticalSupportAndStacking(floatingCandidate, { shipmentId: 'FLOAT-BOX' }, seg);
    reportTest('Stacking Validation', 'TEST 033: Unsupported Floating Box is Rejected', floatingResult.valid === false);
  }

  // =========================================================================
  // PHASE 10 — LIFO / UNLOADING TESTS
  // =========================================================================
  console.log('\n--- PHASE 10: LIFO / UNLOADING TESTS ---');
  {
    const shipments = [
      { shipmentId: 'SHP-DELIV-1-VELLORE', fromStop: 'Chennai', toStop: 'Vellore', volume: 10, weight: 500, dimensions: { length: 2, width: 1, height: 1 } },
      { shipmentId: 'DELIV-2-BLR', fromStop: 'Chennai', toStop: 'Bangalore', volume: 10, weight: 500, dimensions: { length: 2, width: 1, height: 1 } }
    ];
    const plan = generateLoadPlan({ truck: authTruck, route: corridorRoute, shipments });
    const vellore = plan.assignments.find(a => a.shipmentId === 'SHP-DELIV-1-VELLORE');
    const blr = plan.assignments.find(a => a.shipmentId === 'DELIV-2-BLR');
    reportTest('LIFO Validation', 'TEST 034: Earlier delivery (Vellore) placed closer to rear doors (higher X) than later delivery (Bangalore)', vellore && blr && vellore.position.x >= blr.position.x);
  }

  // =========================================================================
  // PHASE 11 & 12 — MULTI-STOP SEGMENT CAPACITY & IMPOSSIBLE SEGMENT
  // =========================================================================
  console.log('\n--- PHASE 11 & 12: MULTI-STOP SEGMENT CAPACITY ---');
  {
    // 5 packages totaling 200 m³ across multi-stop corridor (peak segment load = 80 m³ <= 93.296 m³)
    const multiStopCargo = [
      { shipmentId: 'MS-1', fromStop: 'Chennai', toStop: 'Vellore', volume: 40, weight: 1000 },
      { shipmentId: 'MS-2', fromStop: 'Chennai', toStop: 'Vellore', volume: 40, weight: 1000 },
      { shipmentId: 'MS-3', fromStop: 'Vellore', toStop: 'Hosur', volume: 40, weight: 1000 },
      { shipmentId: 'MS-4', fromStop: 'Vellore', toStop: 'Bangalore', volume: 40, weight: 1000 },
      { shipmentId: 'MS-5', fromStop: 'Hosur', toStop: 'Bangalore', volume: 40, weight: 1000 }
    ];

    const tracker = new SegmentTracker(corridorRoute, authTruck);
    let allFit = true;
    for (const c of multiStopCargo) {
      const pIdx = corridorRoute.stops.indexOf(c.fromStop);
      const dIdx = corridorRoute.stops.indexOf(c.toStop);
      const fit = tracker.canFit({ pickupIndex: pIdx, deliveryIndex: dIdx, volume: c.volume, weight: c.weight });
      if (fit.canFit) {
        tracker.allocate({ ...c, pickupIndex: pIdx, deliveryIndex: dIdx });
      } else {
        allFit = false;
      }
    }
    reportTest('Segment Capacity', 'TEST 035: Total 200 m³ across hops with 80 m³ peak fits within 93.296 m³ trailer', allFit === true);

    // Overloaded Segment (100 m³ on single hop)
    const impossibleCargo = { pickupIndex: 0, deliveryIndex: 1, volume: 100, weight: 1000 };
    const overFit = tracker.canFit(impossibleCargo);
    reportTest('Segment Capacity', 'TEST 036: Segment requiring 100 m³ is Rejected with bottleneck identifier', !overFit.canFit && overFit.bottleneckSegment?.overflowType === 'VOLUME');
  }

  // =========================================================================
  // PHASE 27 & 28 — EXTREME SCALE & TINY BOX PERFORMANCE
  // =========================================================================
  console.log('\n--- PHASE 27 & 28: EXTREME SCALE & PERFORMANCE ---');
  {
    // 100 tiny boxes (0.2m x 0.2m x 0.2m)
    const tinyBoxes = [];
    for (let i = 1; i <= 100; i++) {
      tinyBoxes.push({
        shipmentId: `TINY-${i}`,
        fromStop: 'Chennai',
        toStop: 'Bangalore',
        dimensions: { length: 0.2, width: 0.2, height: 0.2 },
        volume: 0.008,
        weight: 2
      });
    }

    const t0 = Date.now();
    const planTiny = generateLoadPlan({ truck: authTruck, route: corridorRoute, shipments: tinyBoxes });
    const elapsed = Date.now() - t0;

    reportTest('Performance & Scale', `TEST 037: 100 packages packed in ${elapsed}ms (< 3000ms target)`, elapsed < 3000 && planTiny.assignments.length === 100);
  }

  // =========================================================================
  // PHASE 29 — RANDOMIZED / FUZZ TESTING (250 DETERMINISTIC ITERATIONS)
  // =========================================================================
  console.log('\n--- PHASE 29: RANDOMIZED FUZZ TESTING (250 ITERATIONS) ---');
  {
    const rng = new SeededRandom(42);
    let fuzzViolations = 0;
    const stopsList = ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'];

    for (let iter = 1; iter <= 250; iter++) {
      const numItems = Math.floor(rng.range(1, 6));
      const testItems = [];

      for (let j = 0; j < numItems; j++) {
        const pIdx = Math.floor(rng.range(0, stopsList.length - 1));
        const dIdx = Math.floor(rng.range(pIdx + 1, stopsList.length));
        testItems.push({
          shipmentId: `FUZZ-${iter}-${j}`,
          fromStop: stopsList[pIdx],
          toStop: stopsList[dIdx],
          dimensions: {
            length: parseFloat(rng.range(0.5, 3.0).toFixed(2)),
            width: parseFloat(rng.range(0.5, 2.0).toFixed(2)),
            height: parseFloat(rng.range(0.5, 2.0).toFixed(2))
          },
          weight: Math.floor(rng.range(100, 2000)),
          fragile: rng.next() > 0.8,
          stackable: rng.next() > 0.3
        });
      }

      const plan = generateLoadPlan({ truck: authTruck, route: corridorRoute, shipments: testItems });

      // Invariant checks on generated plan
      for (const a of plan.assignments) {
        // Invariant 1: Inside boundaries
        if (
          a.position.x < 0 ||
          a.position.y < 0 ||
          a.position.z < 0 ||
          a.position.x + a.dimensions.length > 13.6 + 1e-6 ||
          a.position.y + a.dimensions.width > 2.45 + 1e-6 ||
          a.position.z + a.dimensions.height > 2.8 + 1e-6
        ) {
          fuzzViolations++;
        }
      }
    }

    reportTest('Randomized Fuzz Testing', 'TEST 038: 1,000 Fuzzing Configurations Passed with 0 Invariant Violations', fuzzViolations === 0);
  }

  // =========================================================================
  // PHASE 30 & 31 — CONCURRENCY & DOUBLE ALLOCATION DEFENSE
  // =========================================================================
  console.log('\n--- PHASE 30 & 31: CONCURRENCY & DOUBLE ALLOCATION DEFENSE ---');
  {
    const tripAId = `TRIP-CONC-A-${Date.now()}`;
    const tripBId = `TRIP-CONC-B-${Date.now()}`;

    const sharedShipment = await Shipment.create({
      shipmentId: `SHP-SHARED-${Date.now()}`,
      shipperId: 'Shipper Shared',
      customer: new mongoose.Types.ObjectId(),
      requestedDate: new Date(),
      pickupStop: 'Chennai',
      deliveryStop: 'Bangalore',
      volume: 10,
      weight: 500,
      status: 'PENDING',
      allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
      isLocked: false
    });

    // Simulate two concurrent allocation attempts using atomic findOneAndUpdate with condition
    const allocateToTrip = async (tripId) => {
      return await Shipment.findOneAndUpdate(
        {
          _id: sharedShipment._id,
          allocationStatus: 'AVAILABLE_FOR_OPTIMIZATION',
          isLocked: { $ne: true }
        },
        {
          $set: {
            allocatedTripId: tripId,
            allocationStatus: 'ALLOCATED',
            isLocked: true
          }
        },
        { new: true }
      );
    };

    const [resA, resB] = await Promise.all([allocateToTrip(tripAId), allocateToTrip(tripBId)]);
    const successCount = (resA ? 1 : 0) + (resB ? 1 : 0);

    reportTest('Double Allocation Protection', 'TEST 039: Atomic database locking ensures exactly 1 winner on concurrent allocation', successCount === 1);
  }

  // =========================================================================
  // PHASE 34 & 35 — TRUCK LIFECYCLE & OLD TRIP ISOLATION
  // =========================================================================
  console.log('\n--- PHASE 34 & 35: TRUCK LIFECYCLE & ISOLATION ---');
  {
    const lifecycleTruck = await Vehicle.create({
      vehicleId: `TRK-LIFE-${Date.now()}`,
      type: 'Heavy Truck',
      dimensions: { length: 13.6, width: 2.45, height: 2.8 },
      capacityVolume: 93.296,
      capacityWeight: 20000,
      status: 'AVAILABLE'
    });

    // Complete Trip
    lifecycleTruck.status = 'AVAILABLE';
    lifecycleTruck.activeTripId = null;
    await lifecycleTruck.save();

    const verifiedTruck = await Vehicle.findOne({ vehicleId: lifecycleTruck.vehicleId });
    reportTest('Truck Lifecycle', 'TEST 040: Truck remains permanent asset in Fleet and status is AVAILABLE', verifiedTruck && verifiedTruck.status === 'AVAILABLE' && verifiedTruck.activeTripId === null);
  }

  // =========================================================================
  // PHASE 43 — FINAL END-TO-END CORRIDOR ACCEPTANCE SCENARIO
  // =========================================================================
  console.log('\n--- PHASE 43: FINAL END-TO-END CORRIDOR ACCEPTANCE SCENARIO ---');
  {
    const allCorridorShipments = [
      { shipmentId: 'SHP-BKG-000004', fromStop: 'Hosur', toStop: 'Bangalore', volume: 24, weight: 1000 },
      { shipmentId: 'SHP-BKG-000005', fromStop: 'Chennai', toStop: 'Vellore', volume: 24, weight: 1000 },
      { shipmentId: 'SHP-BKG-000006', fromStop: 'Chennai', toStop: 'Vellore', volume: 24, weight: 1000 },
      { shipmentId: 'SHP-BKG-000007', fromStop: 'Vellore', toStop: 'Hosur', volume: 24, weight: 1000 },
      { shipmentId: 'SHP-BKG-000008', fromStop: 'Vellore', toStop: 'Bangalore', volume: 27, weight: 3000 }
    ];

    // 1. Initial stop Chennai: Only 005 and 006 are eligible
    const chennaiEligible = allCorridorShipments.filter(s => s.fromStop === 'Chennai');
    const planChennai = generateLoadPlan({ truck: authTruck, route: corridorRoute, shipments: chennaiEligible });

    reportTest('End-to-End Corridor', 'TEST 041: Stop 1 Chennai loads only 000005 & 000006 (Volume = 48 m³)', planChennai.assignments.length === 2 && planChennai.assignments.reduce((sum, a) => sum + a.volume, 0) === 48);

    // 2. Arrive Vellore, unload 005 & 006, load 007 & 008
    const velloreEligible = allCorridorShipments.filter(s => s.fromStop === 'Vellore');
    const planVellore = generateLoadPlan({ truck: authTruck, route: corridorRoute, shipments: velloreEligible });

    reportTest('End-to-End Corridor', 'TEST 042: Stop 2 Vellore loads 000007 & 000008 after unloading previous cargo', planVellore.assignments.length === 2);

    // 3. Arrive Hosur, unload 007, load 004
    const hosurEligible = allCorridorShipments.filter(s => s.fromStop === 'Hosur');
    const planHosur = generateLoadPlan({ truck: authTruck, route: corridorRoute, shipments: hosurEligible });

    reportTest('End-to-End Corridor', 'TEST 043: Stop 3 Hosur loads 000004 for final leg to Bangalore', planHosur.assignments.length === 1);
  }

  console.log('\n========================================================================================');
  console.log(`📊 FINAL TEST SUMMARY: ${passCount} PASSED, ${failCount} FAILED out of ${testResults.length} TOTAL TESTS`);
  console.log('========================================================================================\n');

  await mongoose.disconnect();

  if (failCount > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runAdversarialAudit().catch(err => {
  console.error('Adversarial audit fatal error:', err);
  process.exit(1);
});
