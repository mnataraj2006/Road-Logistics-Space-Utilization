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

    // Exact physical dimensions
    const dx = Number(item.dimensions?.length ?? item.dimensions?.dx ?? item.length ?? item.dx ?? 1.2);
    const dy = Number(item.dimensions?.width ?? item.dimensions?.dy ?? item.width ?? item.dy ?? 1.0);
    const dz = Number(item.dimensions?.height ?? item.dimensions?.dz ?? item.height ?? item.dz ?? 1.2);

    const volume = Number(item.volume ?? (dx * dy * dz).toFixed(3));
    const weight = Number(item.weight ?? 500);

    const colorIdx = dIdx >= 0 ? dIdx % DESTINATION_PALETTES.length : idx % DESTINATION_PALETTES.length;

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
      volume: parseFloat(volume.toFixed(3)),
      weight: Math.round(weight),
      orientation: item.orientation || 'UPRIGHT_ORIGINAL',
      loadingSequence: item.loadingSequence || idx + 1,
      unloadingSequence: item.unloadingSequence || dIdx || 1,
      fragile: Boolean(item.fragile),
      stackable: item.stackable !== false,
      isLocked: Boolean(item.isLocked || item.status === 'LOCKED' || item.status === 'APPROVED'),
      status: item.liveStatus || item.status || (item.isLocked ? 'LOCKED' : 'OPTIMIZED'),
      destColorIndex: colorIdx
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

  const truckL = Number(truck.length || AUTHORITATIVE_TRUCK.length);
  const truckW = Number(truck.width || AUTHORITATIVE_TRUCK.width);
  const truckH = Number(truck.height || AUTHORITATIVE_TRUCK.height);

  const numStops = Math.max(2, (stops || []).length);
  const numSegments = numStops - 1;

  // 1. Physical Boundary Checks
  canonicalItems.forEach((item) => {
    if (item.x < -0.001 || item.y < -0.001 || item.z < -0.001) {
      errors.push(`Package ${item.shipmentId} has negative coordinate (${item.x}, ${item.y}, ${item.z}).`);
    }
    if (item.x + item.dx > truckL + 0.001) {
      errors.push(`Package ${item.shipmentId} exceeds trailer length (${(item.x + item.dx).toFixed(3)}m > ${truckL}m).`);
    }
    if (item.y + item.dy > truckW + 0.001) {
      errors.push(`Package ${item.shipmentId} exceeds trailer width (${(item.y + item.dy).toFixed(3)}m > ${truckW}m).`);
    }
    if (item.z + item.dz > truckH + 0.001) {
      errors.push(`Package ${item.shipmentId} exceeds trailer height (${(item.z + item.dz).toFixed(3)}m > ${truckH}m).`);
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
    valid: errors.length === 0,
    errors,
    warnings,
    accessibilityConflicts,
    isAccessible: accessibilityConflicts.length === 0
  };
};
