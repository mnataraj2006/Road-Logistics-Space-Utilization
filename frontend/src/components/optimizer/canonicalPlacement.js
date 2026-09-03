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
 * @param {Object} params.position - { x, y, z }
 * @param {Object} params.dimensions - { dx, dy, dz } or { length, width, height }
 * @param {Object} params.truckDimensions - { length, width, height }
 * @param {number} [params.tolerance=0.0001] - Strict numerical tolerance in meters
 * @returns {Object} Structured validation result
 */
export const validatePackageWithinTruck = ({
  position = {},
  dimensions = {},
  truckDimensions = {},
  tolerance = 0.0001
} = {}) => {
  const x = Number(position?.x ?? 0);
  const y = Number(position?.y ?? 0);
  const z = Number(position?.z ?? 0);

  // Oriented dimensions (dx, dy, dz) take precedence over unoriented (length, width, height)
  const dx = Number(dimensions?.dx ?? dimensions?.length ?? 0);
  const dy = Number(dimensions?.dy ?? dimensions?.width ?? 0);
  const dz = Number(dimensions?.dz ?? dimensions?.height ?? 0);

  const truckL = Number(truckDimensions?.length ?? truckDimensions?.interiorLength ?? AUTHORITATIVE_TRUCK.length);
  const truckW = Number(truckDimensions?.width ?? truckDimensions?.interiorWidth ?? AUTHORITATIVE_TRUCK.width);
  const truckH = Number(truckDimensions?.height ?? truckDimensions?.interiorHeight ?? AUTHORITATIVE_TRUCK.height);

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
  const truckLength = Number(truckSpecs?.dimensions?.length || truckSpecs?.length || AUTHORITATIVE_TRUCK.length);
  const truckWidth = Number(truckSpecs?.dimensions?.width || truckSpecs?.width || AUTHORITATIVE_TRUCK.width);
  const truckHeight = Number(truckSpecs?.dimensions?.height || truckSpecs?.height || AUTHORITATIVE_TRUCK.height);

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
    const x = Number(item.position?.x ?? item.x ?? 0);
    const y = Number(item.position?.y ?? item.y ?? 0);
    const z = Number(item.position?.z ?? item.z ?? 0);

    // Exact physical dimensions: ORIENTED dimensions (dx, dy, dz) take absolute precedence
    const dx = Number(item.dimensions?.dx ?? item.dx ?? item.dimensions?.length ?? item.length ?? 1.2);
    const dy = Number(item.dimensions?.dy ?? item.dy ?? item.dimensions?.width ?? item.width ?? 1.0);
    const dz = Number(item.dimensions?.dz ?? item.dz ?? item.dimensions?.height ?? item.height ?? 1.2);

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

  const truckL = Number(truck.length || AUTHORITATIVE_TRUCK.length);
  const truckW = Number(truck.width || AUTHORITATIVE_TRUCK.width);
  const truckH = Number(truck.height || AUTHORITATIVE_TRUCK.height);

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
