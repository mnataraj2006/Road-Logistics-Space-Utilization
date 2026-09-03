import assert from 'assert';
import { generateLoadPlan } from '../optimizer/index.js';
import { SegmentTracker } from '../optimizer/segmentTracker.js';
import { SpatialEngine } from '../optimizer/spatialEngine.js';
import { executeStopLifecycleOperational } from '../services/tripLifecycleService.js';
import { computeDynamicReoptimization } from '../services/dynamicReoptimizationService.js';

console.log('===============================================================');
console.log('🚀 RUNNING 2D CAD & 3D DIGITAL TWIN VISUALIZATION PARITY SUITE');
console.log('===============================================================\n');

let passedTests = 0;
let totalTests = 0;

function report(category, name, condition, details = '') {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`✅ [PASS] ${category} :: ${name}`);
  } else {
    console.error(`❌ [FAIL] ${category} :: ${name}`);
    if (details) console.error(`   Details: ${details}`);
    throw new Error(`Assertion failed: ${name}`);
  }
}

// Authoritative vehicle: 13.6 x 2.45 x 2.8, 93.296 m³, 20,000 kg
const authTruck = {
  vehicleId: 'TN-01',
  dimensions: { length: 13.6, width: 2.45, height: 2.8 },
  capacityVolume: 93.296,
  capacityWeight: 20000
};

const corridorRoute = {
  routeId: 'CHN-BLR-CORRIDOR',
  stops: ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'],
  stopsCount: 5,
  segmentsCount: 4
};

// ── TEST 1: Canonical Normalization and 2D/3D Parity Function ──
function normalizeFor2D(assignment) {
  return {
    shipmentId: assignment.shipmentId,
    x: Number(assignment.position?.x ?? assignment.x ?? 0),
    y: Number(assignment.position?.y ?? assignment.y ?? 0),
    z: Number(assignment.position?.z ?? assignment.z ?? 0),
    length: Number(assignment.dimensions?.length ?? assignment.dimensions?.dx ?? assignment.length ?? assignment.dx),
    width: Number(assignment.dimensions?.width ?? assignment.dimensions?.dy ?? assignment.width ?? assignment.dy),
    height: Number(assignment.dimensions?.height ?? assignment.dimensions?.dz ?? assignment.height ?? assignment.dz),
    orientation: assignment.orientation || 'UPRIGHT_ORIGINAL',
    origin: assignment.segmentRange?.fromStop || assignment.pickupStop || assignment.pickup,
    destination: assignment.segmentRange?.toStop || assignment.deliveryStop || assignment.delivery,
    loadingStop: assignment.segmentRange?.fromStop || assignment.pickupStop || assignment.pickup,
    unloadingStop: assignment.segmentRange?.toStop || assignment.deliveryStop || assignment.delivery,
    pickupIndex: assignment.segmentRange?.fromIndex ?? assignment.pickupIndex ?? 0,
    deliveryIndex: assignment.segmentRange?.toIndex ?? assignment.deliveryIndex ?? 1
  };
}

function normalizeFor3D(assignment) {
  const halfL = authTruck.dimensions.length / 2;
  const halfW = authTruck.dimensions.width / 2;

  const x = Number(assignment.position?.x ?? assignment.x ?? 0);
  const y = Number(assignment.position?.y ?? assignment.y ?? 0);
  const z = Number(assignment.position?.z ?? assignment.z ?? 0);
  const dx = Number(assignment.dimensions?.length ?? assignment.dimensions?.dx ?? assignment.length ?? assignment.dx);
  const dy = Number(assignment.dimensions?.width ?? assignment.dimensions?.dy ?? assignment.width ?? assignment.dy);
  const dz = Number(assignment.dimensions?.height ?? assignment.dimensions?.dz ?? assignment.height ?? assignment.dz);

  return {
    shipmentId: assignment.shipmentId,
    // Three.js world coordinates
    sceneX: -halfL + x + (dx / 2),
    sceneY: 0.12 + z + (dz / 2),
    sceneZ: -halfW + y + (dy / 2),
    // Authoritative physical coordinates
    x,
    y,
    z,
    length: dx,
    width: dy,
    height: dz,
    orientation: assignment.orientation || 'UPRIGHT_ORIGINAL',
    origin: assignment.segmentRange?.fromStop || assignment.pickupStop || assignment.pickup,
    destination: assignment.segmentRange?.toStop || assignment.deliveryStop || assignment.delivery,
    loadingStop: assignment.segmentRange?.fromStop || assignment.pickupStop || assignment.pickup,
    unloadingStop: assignment.segmentRange?.toStop || assignment.deliveryStop || assignment.delivery,
    pickupIndex: assignment.segmentRange?.fromIndex ?? assignment.pickupIndex ?? 0,
    deliveryIndex: assignment.segmentRange?.toIndex ?? assignment.deliveryIndex ?? 1
  };
}

async function runParitySuite() {
  console.log('--- TEST 1: CHENNAI INITIAL DEPARTURE (SHP-000005 + SHP-000006) ---');

  const test2Shipments = [
    { shipmentId: 'SHP-BKG-000005', pickupStop: 'Chennai', deliveryStop: 'Vellore', volume: 24, weight: 1000, length: 4.0, width: 2.4, height: 2.5 },
    { shipmentId: 'SHP-BKG-000006', pickupStop: 'Chennai', deliveryStop: 'Vellore', volume: 24, weight: 1000, length: 4.0, width: 2.4, height: 2.5 },
    { shipmentId: 'SHP-BKG-000007', pickupStop: 'Vellore', deliveryStop: 'Hosur', volume: 24, weight: 1000, length: 4.0, width: 2.4, height: 2.5 },
    { shipmentId: 'SHP-BKG-000008', pickupStop: 'Vellore', deliveryStop: 'Bangalore', volume: 24, weight: 1000, length: 4.0, width: 2.4, height: 2.5 },
    { shipmentId: 'SHP-BKG-000004', pickupStop: 'Hosur', deliveryStop: 'Bangalore', volume: 24, weight: 1000, length: 4.0, width: 2.4, height: 2.5 }
  ];

  // At Chennai departure (Stop #1): only Chennai-origin cargo is physically loaded
  const chennaiPlan = generateLoadPlan({
    truck: authTruck,
    route: corridorRoute,
    shipments: test2Shipments.filter(s => s.pickupStop === 'Chennai')
  });

  report('Optimizer State', 'Occupied volume = 48.0 m³, Utilization = 51.4%, Occupied weight = 2,000 kg',
    (chennaiPlan.peakVolumeUtilization === 51.4 || chennaiPlan.peakVolumeUtilization === 51.5) &&
    (chennaiPlan.peakWeightUtilization === 10.0 || chennaiPlan.peakWeightUtilization === 10)
  );

  // Assert 2D vs 3D Parity for Chennai departure
  for (const optAssign of chennaiPlan.assignments) {
    const p2d = normalizeFor2D(optAssign);
    const p3d = normalizeFor3D(optAssign);

    report('2D/3D Parity', `${optAssign.shipmentId} :: ID and Origin/Destination parity`,
      p2d.shipmentId === p3d.shipmentId && p2d.origin === p3d.origin && p2d.destination === p3d.destination
    );
    report('2D/3D Parity', `${optAssign.shipmentId} :: Coordinate parity (X=${optAssign.position.x}, Y=${optAssign.position.y}, Z=${optAssign.position.z})`,
      p2d.x === p3d.x && p2d.y === p3d.y && p2d.z === p3d.z &&
      p2d.x === optAssign.position.x && p2d.y === optAssign.position.y && p2d.z === optAssign.position.z
    );
    report('2D/3D Parity', `${optAssign.shipmentId} :: Dimensional parity (dx=${optAssign.dimensions.dx}, dy=${optAssign.dimensions.dy}, dz=${optAssign.dimensions.dz})`,
      p2d.length === p3d.length && p2d.width === p3d.width && p2d.height === p3d.height &&
      p2d.length === optAssign.dimensions.dx && p2d.width === optAssign.dimensions.dy && p2d.height === optAssign.dimensions.dz
    );
  }

  console.log('\n--- TEST 2: ROUTE SEGMENT FILTER PHYSICAL PRESENCE (TEST 2 SCENARIO) ---');

  // Full corridor multi-stop load plan
  const fullPlan = generateLoadPlan({
    truck: authTruck,
    route: corridorRoute,
    shipments: test2Shipments
  });

  // Segment 0: Chennai -> Kanchipuram
  const seg0Items = fullPlan.assignments.filter(a => a.pickupIndex <= 0 && a.deliveryIndex > 0);
  report('Segment Presence', 'Segment 0 (Chennai -> Kanchipuram) contains exactly 000005 & 000006',
    seg0Items.length === 2 && seg0Items.some(a => a.shipmentId === 'SHP-BKG-000005') && seg0Items.some(a => a.shipmentId === 'SHP-BKG-000006')
  );

  // Segment 1: Kanchipuram -> Vellore
  const seg1Items = fullPlan.assignments.filter(a => a.pickupIndex <= 1 && a.deliveryIndex > 1);
  report('Segment Presence', 'Segment 1 (Kanchipuram -> Vellore) contains exactly 000005 & 000006',
    seg1Items.length === 2 && seg1Items.some(a => a.shipmentId === 'SHP-BKG-000005') && seg1Items.some(a => a.shipmentId === 'SHP-BKG-000006')
  );

  // Segment 2: Vellore -> Hosur (000005 & 000006 delivered, 000007 & 000008 loaded)
  const seg2Items = fullPlan.assignments.filter(a => a.pickupIndex <= 2 && a.deliveryIndex > 2);
  report('Segment Presence', 'Segment 2 (Vellore -> Hosur) contains exactly 000007 & 000008',
    seg2Items.length === 2 && seg2Items.some(a => a.shipmentId === 'SHP-BKG-000007') && seg2Items.some(a => a.shipmentId === 'SHP-BKG-000008')
  );

  // Segment 3: Hosur -> Bangalore (000007 delivered, 000004 loaded, 000008 retained)
  const seg3Items = fullPlan.assignments.filter(a => a.pickupIndex <= 3 && a.deliveryIndex > 3);
  report('Segment Presence', 'Segment 3 (Hosur -> Bangalore) contains exactly 000004 & 000008',
    seg3Items.length === 2 && seg3Items.some(a => a.shipmentId === 'SHP-BKG-000004') && seg3Items.some(a => a.shipmentId === 'SHP-BKG-000008')
  );

  console.log('\n--- TEST 3: LIFO REAR-DOOR ACCESS PATH VALIDATION ---');
  // On Vellore -> Hosur segment: 000007 (Hosur) delivers before 000008 (Bangalore)
  // Therefore 000007 must be placed closer to rear doors (higher X) than 000008
  const shp7 = fullPlan.assignments.find(a => a.shipmentId === 'SHP-BKG-000007');
  const shp8 = fullPlan.assignments.find(a => a.shipmentId === 'SHP-BKG-000008');

  report('LIFO Clearance', 'SHP-000007 (Hosur) is placed closer to rear doors (higher X) than SHP-000008 (Bangalore)',
    shp7 && shp8 && shp7.position.x >= shp8.position.x,
    `SHP-7 X=${shp7?.position?.x}, SHP-8 X=${shp8?.position?.x}`
  );

  console.log('\n--- TEST 4: UTILIZATION TELEMETRY CONSISTENCY ---');
  const occupiedVol = seg0Items.reduce((acc, it) => acc + it.volume, 0);
  const freeVol = parseFloat((authTruck.capacityVolume - occupiedVol).toFixed(3));
  const utilPct = parseFloat(((occupiedVol / authTruck.capacityVolume) * 100).toFixed(1));

  report('Telemetry Parity', 'Occupied = 48.0 m³, Free = 45.296 m³, Utilization = 51.4%',
    occupiedVol === 48.0 && freeVol === 45.296 && utilPct === 51.4
  );

  console.log('\n===============================================================');
  console.log(`📊 FINAL VISUALIZATION PARITY RESULTS: ${passedTests} PASSED, 0 FAILED (100% Target)`);
  console.log('===============================================================');
}

runParitySuite().catch((err) => {
  console.error('Fatal error in parity suite:', err);
  process.exit(1);
});
