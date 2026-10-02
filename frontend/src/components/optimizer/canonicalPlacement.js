/**
 * Canonical Placement Engine & Normalizer
 *
 * Single Source of Truth for 2D CAD & 3D Digital Twin Visualizers.
 * Enforces strict physical coordinates, actual package dimensions,
 * route segment presence, and LIFO rear-door accessibility.
 */

export const AUTHORITATIVE_TRUCK = {
  length: 13.6,
  width: 2.45,
  height: 2.8,
  capacityVolume: 93.296,
  displayVolume: 93.3,
  capacityWeight: 20000
};

export const DESTINATION_PALETTES = [
  { bg: '#10b981', hex: 0x10b981, border: '#059669', badgeBg: 'rgba(6, 78, 59, 0.95)', badgeBorder: '#10b981', text: '#34d399', dest: '#6ee7b7', name: 'Emerald' },
  { bg: '#3b82f6', hex: 0x3b82f6, border: '#2563eb', badgeBg: 'rgba(30, 58, 138, 0.95)', badgeBorder: '#3b82f6', text: '#93c5fd', dest: '#bfdbfe', name: 'Blue' },
  { bg: '#f59e0b', hex: 0xf59e0b, border: '#d97706', badgeBg: 'rgba(120, 53, 15, 0.95)', badgeBorder: '#f59e0b', text: '#fde68a', dest: '#fef3c7', name: 'Amber' },
  { bg: '#8b5cf6', hex: 0x8b5cf6, border: '#7c3aed', badgeBg: 'rgba(91, 33, 182, 0.95)', badgeBorder: '#8b5cf6', text: '#c4b5fd', dest: '#ede9fe', name: 'Purple' },
  { bg: '#ec4899', hex: 0xec4899, border: '#db2777', badgeBg: 'rgba(131, 24, 67, 0.95)', badgeBorder: '#ec4899', text: '#fbcfe8', dest: '#fce7f3', name: 'Pink' }
];

const normStop = (s) => (s ? String(s).trim().toLowerCase() : '');

/**
 * Authoritative Canonical Truck Dimension Resolver.
 * Enforces positive, finite numerical checks:
 * - If dimension > 0 and finite: use dimension
 * - Else if interior dimension > 0 and finite: use interior dimension
 * - Else: use authoritative fallback dimension
 *
 * Prevents zero-dimension vehicles (e.g. { length: 0, width: 0, height: 0 })
 * from collapsing truck bounds to 0 and falsely quarantining cargo.
 * Preserves valid custom truck dimensions (e.g. 12m x 2.4m x 2.6m).
 */
export const resolveAuthoritativeTruckDimensions = (truckSpecs = {}, fallback = AUTHORITATIVE_TRUCK) => {
  const isPos = (v) => v !== undefined && v !== null && Number.isFinite(Number(v)) && Number(v) > 0;

  const raw = truckSpecs?.dimensions || truckSpecs || {};
  const length = isPos(raw.length)
    ? Number(raw.length)
    : isPos(truckSpecs?.interiorLength)
    ? Number(truckSpecs.interiorLength)
    : isPos(fallback?.length)
    ? Number(fallback.length)
    : 13.6;

  const width = isPos(raw.width)
    ? Number(raw.width)
    : isPos(truckSpecs?.interiorWidth)
    ? Number(truckSpecs.interiorWidth)
    : isPos(fallback?.width)
    ? Number(fallback.width)
    : 2.45;

  const height = isPos(raw.height)
    ? Number(raw.height)
    : isPos(truckSpecs?.interiorHeight)
    ? Number(truckSpecs.interiorHeight)
    : isPos(fallback?.height)
    ? Number(fallback.height)
    : 2.8;

  const capacityVolume = isPos(truckSpecs?.capacityVolume)
    ? Number(truckSpecs.capacityVolume)
    : isPos(fallback?.capacityVolume)
    ? Number(fallback.capacityVolume)
    : parseFloat((length * width * height).toFixed(3));

  const capacityWeight = isPos(truckSpecs?.capacityWeight)
    ? Number(truckSpecs.capacityWeight)
    : isPos(fallback?.capacityWeight)
    ? Number(fallback.capacityWeight)
    : 20000;

  return { length, width, height, capacityVolume, capacityWeight };
};

/**
 * Authoritative Canonical Dimension Resolver.
 * Strict resolution order:
 * 1. Nested oriented dimensions (dimensions.dx, dimensions.dy, dimensions.dz) if finite and > 0
 * 2. Top-level oriented dimensions (item.dx, item.dy, item.dz) if finite and > 0
 * 3. Nested unoriented dimensions (dimensions.length, dimensions.width, dimensions.height) if finite and > 0
 * 4. Top-level unoriented dimensions (item.length, item.width, item.height) if finite and > 0
 */
export const resolveAuthoritativeDimensions = (item = {}) => {
  const isPos = (v) => v !== undefined && v !== null && Number.isFinite(Number(v)) && Number(v) > 0;

  let dx = 0;
  let dy = 0;
  let dz = 0;

  if (isPos(item.dimensions?.dx) && isPos(item.dimensions?.dy) && isPos(item.dimensions?.dz)) {
    dx = Number(item.dimensions.dx);
    dy = Number(item.dimensions.dy);
    dz = Number(item.dimensions.dz);
  } else if (isPos(item.dx) && isPos(item.dy) && isPos(item.dz)) {
    dx = Number(item.dx);
    dy = Number(item.dy);
    dz = Number(item.dz);
  } else if (isPos(item.dimensions?.length) && isPos(item.dimensions?.width) && isPos(item.dimensions?.height)) {
    dx = Number(item.dimensions.length);
    dy = Number(item.dimensions.width);
    dz = Number(item.dimensions.height);
  } else if (isPos(item.length) && isPos(item.width) && isPos(item.height)) {
    dx = Number(item.length);
    dy = Number(item.width);
    dz = Number(item.height);
  }

  return { dx, dy, dz };
};

/**
 * Authoritative Canonical Position Resolver.
 * x = distance from FRONT CABIN toward REAR DOORS (0 = cabin, truckLength = rear doors)
 * y = distance across truck width
 * z = distance from FLOOR upward
 */
export const resolveAuthoritativePosition = (item = {}) => {
  const isNum = (v) => v !== undefined && v !== null && Number.isFinite(Number(v));

  const x = isNum(item.position?.x) ? Number(item.position.x) : isNum(item.x) ? Number(item.x) : 0;
  const y = isNum(item.position?.y) ? Number(item.position.y) : isNum(item.y) ? Number(item.y) : 0;
  const z = isNum(item.position?.z) ? Number(item.position.z) : isNum(item.z) ? Number(item.z) : 0;

  return { x, y, z };
};

/**
 * Authoritative 3D Physical Geometry & Boundary Validator.
 *
 * Enforces the physical envelope:
 *   0 <= minX <= maxX <= truckLength
 *   0 <= minY <= maxY <= truckWidth
 *   0 <= minZ <= maxZ <= truckHeight
 *
 * Uses oriented dimensions (dx, dy, dz) and checks full bounding box.
 *
 * @param {Object} params
 * @param {Object} [params.item] - Full package assignment object
 * @param {Object} [params.position] - { x, y, z }
 * @param {Object} [params.dimensions] - { dx, dy, dz } or { length, width, height }
 * @param {Object} [params.truckDimensions] - { length, width, height }
 * @param {number} [params.tolerance=0.0001] - Strict numerical tolerance in meters
 * @returns {Object} Structured validation result
 */
export const validatePackageWithinTruck = ({
  item,
  position = {},
  dimensions = {},
  truckDimensions = {},
  tolerance = 0.0001
} = {}) => {
  const resolvedPos = item ? resolveAuthoritativePosition(item) : resolveAuthoritativePosition({ position });
  const resolvedDims = item ? resolveAuthoritativeDimensions(item) : resolveAuthoritativeDimensions({ dimensions });

  const x = resolvedPos.x;
  const y = resolvedPos.y;
  const z = resolvedPos.z;

  const dx = resolvedDims.dx;
  const dy = resolvedDims.dy;
  const dz = resolvedDims.dz;

  const authTruck = resolveAuthoritativeTruckDimensions(truckDimensions, AUTHORITATIVE_TRUCK);
  const truckL = authTruck.length;
  const truckW = authTruck.width;
  const truckH = authTruck.height;

  const violations = [];

  // Finite numerical sanity
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
    violations.push({ axis: 'ALL', type: 'NON_FINITE_POSITION', boundary: 'POSITION', actual: { x, y, z }, limit: 0, overflow: 0 });
  }
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || !Number.isFinite(dz) || dx <= 0 || dy <= 0 || dz <= 0) {
    violations.push({ axis: 'ALL', type: 'INVALID_DIMENSIONS', boundary: 'DIMENSIONS', actual: { dx, dy, dz }, limit: 0, overflow: 0 });
  }
  if (!Number.isFinite(truckL) || !Number.isFinite(truckW) || !Number.isFinite(truckH) || truckL <= 0 || truckW <= 0 || truckH <= 0) {
    violations.push({ axis: 'ALL', type: 'INVALID_TRUCK_DIMENSIONS', boundary: 'TRUCK', actual: { truckL, truckW, truckH }, limit: 0, overflow: 0 });
  }

  if (violations.length > 0) {
    return {
      valid: false,
      violations,
      bounds: { minX: x, maxX: x + dx, minY: y, maxY: y + dy, minZ: z, maxZ: z + dz },
      truck: { length: truckL, width: truckW, height: truckH }
    };
  }

  const minX = x;
  const maxX = x + dx;
  const minY = y;
  const maxY = y + dy;
  const minZ = z;
  const maxZ = z + dz;

  // Front cabin boundary (X min)
  if (minX < -tolerance) {
    violations.push({
      axis: 'X',
      type: 'MIN_BOUNDARY_EXCEEDED',
      boundary: 'FRONT_CABIN',
      actual: parseFloat(minX.toFixed(4)),
      limit: 0,
      overflow: parseFloat((-minX).toFixed(4))
    });
  }

  // Rear container door boundary (X max) - THE REAR DOOR
  if (maxX > truckL + tolerance) {
    violations.push({
      axis: 'X',
      type: 'MAX_BOUNDARY_EXCEEDED',
      boundary: 'REAR_DOOR',
      actual: parseFloat(maxX.toFixed(4)),
      limit: truckL,
      overflow: parseFloat((maxX - truckL).toFixed(4))
    });
  }

  // Left wall boundary (Y min)
  if (minY < -tolerance) {
    violations.push({
      axis: 'Y',
      type: 'MIN_BOUNDARY_EXCEEDED',
      boundary: 'LEFT_WALL',
      actual: parseFloat(minY.toFixed(4)),
      limit: 0,
      overflow: parseFloat((-minY).toFixed(4))
    });
  }

  // Right wall boundary (Y max)
  if (maxY > truckW + tolerance) {
    violations.push({
      axis: 'Y',
      type: 'MAX_BOUNDARY_EXCEEDED',
      boundary: 'RIGHT_WALL',
      actual: parseFloat(maxY.toFixed(4)),
      limit: truckW,
      overflow: parseFloat((maxY - truckW).toFixed(4))
    });
  }

  // Trailer floor boundary (Z min)
  if (minZ < -tolerance) {
    violations.push({
      axis: 'Z',
      type: 'MIN_BOUNDARY_EXCEEDED',
      boundary: 'TRAILER_FLOOR',
      actual: parseFloat(minZ.toFixed(4)),
      limit: 0,
      overflow: parseFloat((-minZ).toFixed(4))
    });
  }

  // Trailer roof boundary (Z max)
  if (maxZ > truckH + tolerance) {
    violations.push({
      axis: 'Z',
      type: 'MAX_BOUNDARY_EXCEEDED',
      boundary: 'TRAILER_ROOF',
      actual: parseFloat(maxZ.toFixed(4)),
      limit: truckH,
      overflow: parseFloat((maxZ - truckH).toFixed(4))
    });
  }

  return {
    valid: violations.length === 0,
    violations,
    bounds: { minX, maxX, minY, maxY, minZ, maxZ },
    truck: { length: truckL, width: truckW, height: truckH }
  };
};

/**
 * Normalizes raw assignment data into authoritative canonical placements.
 */
export const normalizeCanonicalPlacements = (assignments = [], truckSpecs = {}, stops = []) => {
  const authTruck = resolveAuthoritativeTruckDimensions(truckSpecs, AUTHORITATIVE_TRUCK);
  const truckLength = authTruck.length;
  const truckWidth = authTruck.width;
  const truckHeight = authTruck.height;

  const resolvedStops = (Array.isArray(stops) && stops.length > 0)
    ? stops
    : ['Chennai', 'Kanchipuram', 'Vellore', 'Hosur', 'Bangalore'];

  if (!Array.isArray(assignments)) return [];

  return assignments.map((item, idx) => {
    const shipmentId = item.shipmentId || item.bookingId || `SHP-PKG-${idx + 1}`;
    const pickup = item.segmentRange?.fromStop || item.pickupStop || item.pickup || item.fromStop || resolvedStops[0];
    const delivery = item.segmentRange?.toStop || item.deliveryStop || item.delivery || item.toStop || resolvedStops[resolvedStops.length - 1];

    let pIdx = item.segmentRange?.fromIndex ?? item.pickupIndex;
    if (pIdx === undefined || pIdx === null || pIdx < 0) {
      pIdx = resolvedStops.findIndex(s => normStop(s) === normStop(pickup));
      if (pIdx === -1) pIdx = 0;
    }

    let dIdx = item.segmentRange?.toIndex ?? item.deliveryIndex;
    if (dIdx === undefined || dIdx === null || dIdx < 0) {
      dIdx = resolvedStops.findIndex(s => normStop(s) === normStop(delivery));
      if (dIdx === -1 || dIdx <= pIdx) dIdx = resolvedStops.length - 1;
    }

    // Exact physical coordinates from optimizer
    const resolvedPos = resolveAuthoritativePosition(item);
    const x = resolvedPos.x;
    const y = resolvedPos.y;
    const z = resolvedPos.z;

    // Exact physical dimensions: ORIENTED dimensions (dx, dy, dz) take absolute precedence
    const resolvedDims = resolveAuthoritativeDimensions(item);
    let dx = resolvedDims.dx;
    let dy = resolvedDims.dy;
    let dz = resolvedDims.dz;

    // Fallback if completely missing from any field
    if (dx <= 0 || dy <= 0 || dz <= 0) {
      dx = dx > 0 ? dx : 1.2;
      dy = dy > 0 ? dy : 1.0;
      dz = dz > 0 ? dz : 1.2;
    }

    const volume = Number(item.volume ?? (dx * dy * dz).toFixed(3));
    const weight = Number(item.weight ?? 500);

    const colorIdx = dIdx >= 0 ? dIdx % DESTINATION_PALETTES.length : idx % DESTINATION_PALETTES.length;

    // Validate physical boundary
    const geoValidation = validatePackageWithinTruck({
      position: { x, y, z },
      dimensions: { dx, dy, dz },
      truckDimensions: { length: truckLength, width: truckWidth, height: truckHeight }
    });

    return {
      ...item,
      shipmentId,
      bookingId: item.bookingId || shipmentId,
      customer: item.customer || item.shipperId || 'Commercial Trader',
      cargoDescription: item.cargoDescription || item.description || 'General Cargo',
      pickup,
      delivery,
      pickupStop: pickup,
      deliveryStop: delivery,
      pickupIndex: pIdx,
      deliveryIndex: dIdx,
      segmentRange: {
        fromIndex: pIdx,
        toIndex: dIdx,
        fromStop: pickup,
        toStop: delivery
      },
      x: parseFloat(x.toFixed(4)),
      y: parseFloat(y.toFixed(4)),
      z: parseFloat(z.toFixed(4)),
      dx: parseFloat(dx.toFixed(4)),
      dy: parseFloat(dy.toFixed(4)),
      dz: parseFloat(dz.toFixed(4)),
      length: parseFloat(dx.toFixed(4)),
      width: parseFloat(dy.toFixed(4)),
      height: parseFloat(dz.toFixed(4)),
      dimensions: {
        dx: parseFloat(dx.toFixed(4)),
        dy: parseFloat(dy.toFixed(4)),
        dz: parseFloat(dz.toFixed(4)),
        length: parseFloat(dx.toFixed(4)),
        width: parseFloat(dy.toFixed(4)),
        height: parseFloat(dz.toFixed(4))
      },
      volume: parseFloat(volume.toFixed(3)),
      weight: Math.round(weight),
      orientation: item.orientation || 'UPRIGHT_ORIGINAL',
      loadingSequence: item.loadingSequence || idx + 1,
      unloadingSequence: item.unloadingSequence || dIdx || 1,
      fragile: Boolean(item.fragile),
      stackable: item.stackable !== false,
      isLocked: Boolean(item.isLocked || item.status === 'LOCKED' || item.status === 'APPROVED'),
      status: item.liveStatus || item.status || (item.isLocked ? 'LOCKED' : 'OPTIMIZED'),
      destColorIndex: colorIdx,
      isPhysicallyValid: geoValidation.valid,
      geometryViolations: geoValidation.violations
    };
  });
};

/**
 * Filter items physically onboard the truck for a specific route segment or stop index.
 */
export const getActiveSegmentCargo = (canonicalItems = [], segmentIndex = 0) => {
  if (segmentIndex === 'ALL' || segmentIndex === -1) {
    return canonicalItems;
  }
  const segIdx = Number(segmentIndex);
  return canonicalItems.filter(item => {
    return item.pickupIndex <= segIdx && item.deliveryIndex > segIdx;
  });
};

/**
 * Validates canonical placements against boundaries, overlaps, and LIFO rear-door clearance.
 */
export const validateAuthoritativePlacements = (canonicalItems = [], truck = {}, stops = []) => {
  const errors = [];
  const warnings = [];
  const accessibilityConflicts = [];
  const validItems = [];
  const invalidItems = [];

  const authTruck = resolveAuthoritativeTruckDimensions(truck, AUTHORITATIVE_TRUCK);
  const truckL = authTruck.length;
  const truckW = authTruck.width;
  const truckH = authTruck.height;

  const numStops = Math.max(2, (stops || []).length);
  const numSegments = numStops - 1;

  // 1. Authoritative Physical Boundary Checks
  canonicalItems.forEach((item) => {
    const geo = validatePackageWithinTruck({
      position: { x: item.x, y: item.y, z: item.z },
      dimensions: { dx: item.dx, dy: item.dy, dz: item.dz },
      truckDimensions: { length: truckL, width: truckW, height: truckH }
    });

    if (!geo.valid) {
      invalidItems.push({ item, violations: geo.violations });
      geo.violations.forEach(v => {
        errors.push(`Package ${item.shipmentId} violates ${v.boundary} on ${v.axis}-axis: actual ${v.actual}m > limit ${v.limit}m (overflow: ${v.overflow}m).`);
      });
    } else {
      validItems.push(item);
    }
  });

  // 2. Segment-Aware Collision Check
  for (let s = 0; s < numSegments; s++) {
    const concurrent = canonicalItems.filter(it => it.pickupIndex <= s && it.deliveryIndex > s);
    for (let i = 0; i < concurrent.length; i++) {
      for (let j = i + 1; j < concurrent.length; j++) {
        const a = concurrent[i];
        const b = concurrent[j];

        const overlapX = a.x < (b.x + b.dx - 0.001) && (a.x + a.dx) > (b.x + 0.001);
        const overlapY = a.y < (b.y + b.dy - 0.001) && (a.y + a.dy) > (b.y + 0.001);
        const overlapZ = a.z < (b.z + b.dz - 0.001) && (a.z + a.dz) > (b.z + 0.001);

        if (overlapX && overlapY && overlapZ) {
          errors.push(`3D Collision: ${a.shipmentId} overlaps ${b.shipmentId} on segment #${s + 1}.`);
        }
      }
    }
  }

  // 3. LIFO Rear-Door Obstruction Check
  // Rear doors are located at X = truckL.
  // If package A delivers earlier than package B, but package B is positioned between A and rear doors on the same leg
  for (let s = 0; s < numSegments; s++) {
    const concurrent = canonicalItems.filter(it => it.pickupIndex <= s && it.deliveryIndex > s);
    concurrent.forEach(a => {
      concurrent.forEach(b => {
        if (a === b) return;
        // If a delivers BEFORE b (lower deliveryIndex)
        if (a.deliveryIndex < b.deliveryIndex) {
          // If b is placed closer to rear doors (bx >= ax + adx - 0.01) and overlaps in lateral width
          const overlapY = a.y < (b.y + b.dy - 0.01) && (a.y + a.dy) > (b.y + 0.01);
          if (b.x >= (a.x + a.dx - 0.01) && overlapY) {
            accessibilityConflicts.push({
              blockedItem: a.shipmentId,
              blockedDest: a.delivery,
              blockingItem: b.shipmentId,
              blockingDest: b.delivery,
              reason: `${a.shipmentId} (delivering at ${a.delivery}) is blocked towards rear doors by ${b.shipmentId} (delivering at ${b.delivery}).`
            });
          }
        }
      });
    });
  }

  return {
    valid: errors.length === 0 && invalidItems.length === 0,
    validItems,
    invalidItems,
    errors,
    warnings,
    accessibilityConflicts,
    isAccessible: accessibilityConflicts.length === 0
  };
};

/**
 * Authoritative Shared Canonical Renderable Assignments Helper.
 * Both 2D and 3D visualizers consume this exact function to guarantee 100% parity.
 */
export const getCanonicalRenderableAssignments = ({
  assignments = [],
  canonicalItems: preNormalizedItems = null,
  truckDimensions = {},
  stops = [],
  selectedSegment = 0
} = {}) => {
  const authTruck = resolveAuthoritativeTruckDimensions(truckDimensions, AUTHORITATIVE_TRUCK);
  const truckL = authTruck.length;
  const truckW = authTruck.width;
  const truckH = authTruck.height;

  const canonicalItems = Array.isArray(preNormalizedItems) && preNormalizedItems.length > 0
    ? preNormalizedItems
    : normalizeCanonicalPlacements(
        assignments,
        { length: truckL, width: truckW, height: truckH },
        stops
      );

  const activeItems = getActiveSegmentCargo(canonicalItems, selectedSegment);

  const validActiveItems = [];
  const quarantinedActiveItems = [];

  activeItems.forEach((item) => {
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

  const futureItems = canonicalItems.filter((item) => {
    if (selectedSegment === 'ALL' || selectedSegment === -1) return false;
    return item.pickupIndex > Number(selectedSegment);
  });

  const deliveredItems = canonicalItems.filter((item) => {
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

/**
 * Diagnostic parity validator for multi-stop segment counts and rendering.
 */
export const checkSegmentParity = (canonicalItems = [], segmentIndex = 0) => {
  if (segmentIndex === 'ALL' || segmentIndex === -1) {
    return canonicalItems.length;
  }
  const sIdx = Number(segmentIndex);
  return canonicalItems.filter(item => item.pickupIndex <= sIdx && item.deliveryIndex > sIdx).length;
};
