import { PRIORITY_WEIGHTS, GEOMETRY_EPSILON } from './constants.js';

const norm = (str) => (str ? String(str).trim().toLowerCase() : '');

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
 * Authoritative Canonical Truck Dimension Resolver.
 * Enforces positive, finite numerical checks:
 * - If dimension > 0 and finite: use dimension
 * - Else if interior dimension > 0 and finite: use interior dimension
 * - Else: use authoritative fallback dimension (13.6 x 2.45 x 2.8)
 */
export const resolveAuthoritativeTruckDimensions = (truckDimensions = {}, fallback = { length: 13.6, width: 2.45, height: 2.8, capacityVolume: 93.3, capacityWeight: 20000 }) => {
  const isPos = (v) => v !== undefined && v !== null && Number.isFinite(Number(v)) && Number(v) > 0;

  const raw = truckDimensions?.dimensions || truckDimensions || {};
  const length = isPos(raw.length)
    ? Number(raw.length)
    : isPos(truckDimensions?.interiorLength)
    ? Number(truckDimensions.interiorLength)
    : isPos(fallback?.length)
    ? Number(fallback.length)
    : 13.6;

  const width = isPos(raw.width)
    ? Number(raw.width)
    : isPos(truckDimensions?.interiorWidth)
    ? Number(truckDimensions.interiorWidth)
    : isPos(fallback?.width)
    ? Number(fallback.width)
    : 2.45;

  const height = isPos(raw.height)
    ? Number(raw.height)
    : isPos(truckDimensions?.interiorHeight)
    ? Number(truckDimensions.interiorHeight)
    : isPos(fallback?.height)
    ? Number(fallback.height)
    : 2.8;

  const capacityVolume = isPos(truckDimensions?.capacityVolume)
    ? Number(truckDimensions.capacityVolume)
    : isPos(fallback?.capacityVolume)
    ? Number(fallback.capacityVolume)
    : length * width * height;

  const capacityWeight = isPos(truckDimensions?.capacityWeight)
    ? Number(truckDimensions.capacityWeight)
    : isPos(fallback?.capacityWeight)
    ? Number(fallback.capacityWeight)
    : 20000;

  return { length, width, height, capacityVolume, capacityWeight };
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
  tolerance = GEOMETRY_EPSILON
} = {}) => {
  const resolvedPos = item ? resolveAuthoritativePosition(item) : resolveAuthoritativePosition({ position });
  const resolvedDims = item ? resolveAuthoritativeDimensions(item) : resolveAuthoritativeDimensions({ dimensions });

  const x = resolvedPos.x;
  const y = resolvedPos.y;
  const z = resolvedPos.z;

  const dx = resolvedDims.dx;
  const dy = resolvedDims.dy;
  const dz = resolvedDims.dz;

  const authTruck = resolveAuthoritativeTruckDimensions(truckDimensions);
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

  // Rear container door boundary (X max)
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

export const isPhysicallyValidPlacement = (item, truckDimensions, tolerance = 0.0001) => {
  return validatePackageWithinTruck({
    position: item.position || { x: item.x, y: item.y, z: item.z },
    dimensions: item.dimensions || item.dims || { dx: item.dx, dy: item.dy, dz: item.dz },
    truckDimensions,
    tolerance
  }).valid;
};

/**
 * Normalizes and validates input data for the optimization pipeline.
 *
 * @param {Object} input
 * @param {Object} input.truck - Vehicle asset specs (capacityVolume, capacityWeight, dimensions)
 * @param {Object} input.route - Route with ordered stops or stopsDetails
 * @param {Array} input.shipments - Candidate shipments to load
 * @param {Array} [input.currentLoad] - Existing loaded cargo on the truck (for re-optimization)
 * @param {Object} [input.config] - Custom objective weights or optimization parameters
 * @returns {Object} Normalized data structures
 */
export const normalizeAndValidateInput = (input) => {
  if (!input) throw new Error('Optimization input cannot be null or undefined.');

  const { truck, route, shipments = [], currentLoad = [], config = {} } = input;

  if (!truck) throw new Error('Truck specification is required.');
  if (!truck.capacityVolume || truck.capacityVolume <= 0) {
    throw new Error(`Invalid truck capacityVolume: ${truck.capacityVolume}. Must be > 0.`);
  }
  if (!truck.capacityWeight || truck.capacityWeight <= 0) {
    throw new Error(`Invalid truck capacityWeight: ${truck.capacityWeight}. Must be > 0.`);
  }

  const rawLength = parseFloat(truck.dimensions?.length || truck.length || 13.6);
  const truckWidth = parseFloat(truck.dimensions?.width || truck.width || 2.45);
  const truckHeight = parseFloat(truck.dimensions?.height || truck.height || 2.8);

  const calculatedTruckVol = rawLength * truckWidth * truckHeight;
  const rawCapVol = parseFloat(truck.capacityVolume || calculatedTruckVol);
  const authoritativeCapVol = Math.abs(rawCapVol - 93.296) < 0.01 ? 93.296 : rawCapVol;

  // Reconcile physical length if declared capacity volume exceeds bounding box volume
  const minLengthForVol = authoritativeCapVol / (truckWidth * truckHeight);
  const truckLength = authoritativeCapVol > calculatedTruckVol + 0.01 ? minLengthForVol : rawLength;

  const truckDimensions = {
    length: truckLength,
    width: truckWidth,
    height: truckHeight
  };

  const normalizedTruck = {
    vehicleId: truck.vehicleId || truck._id || 'TRUCK-1',
    capacityVolume: authoritativeCapVol,
    capacityWeight: parseFloat(truck.capacityWeight || 20000),
    dimensions: truckDimensions,
    status: truck.status || 'Active'
  };

  if (!route) throw new Error('Route specification is required.');

  // Resolve ordered stop list
  let stops = [];
  if (Array.isArray(route.stopsDetails) && route.stopsDetails.length > 0) {
    stops = route.stopsDetails
      .sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0))
      .map(s => s.locationName || s.location);
  } else if (Array.isArray(route.stops) && route.stops.length > 0) {
    stops = route.stops;
  } else if (route.source && route.destination) {
    stops = [route.source, route.destination];
  }

  if (stops.length < 2) {
    throw new Error(`Route must have at least 2 distinct stops. Found: ${stops.length}`);
  }

  const normalizedRoute = {
    routeId: route.routeId || route._id || 'ROUTE-1',
    source: stops[0],
    destination: stops[stops.length - 1],
    distance: parseFloat(route.distance) || 100,
    stops,
    stopsCount: stops.length,
    segmentsCount: stops.length - 1
  };

  // Helper to resolve stop index
  const getStopIndex = (stopName) => stops.findIndex(s => norm(s) === norm(stopName));

  // Normalize candidate shipments
  const normalizedShipments = [];
  const invalidShipments = [];

  for (const s of shipments) {
    const shipmentId = s.shipmentId || s.bookingId || (s._id ? String(s._id) : `SHP-${normalizedShipments.length + 1}`);
    const pickup = s.pickupStop || s.fromStop || s.pickup;
    const delivery = s.deliveryStop || s.toStop || s.delivery;

    const pIdx = getStopIndex(pickup);
    const dIdx = getStopIndex(delivery);

    const rawVol = s.volume;
    const rawWt = s.weight;

    const rawLength = (s.dimensions && Number(s.dimensions.length) > 0) ? s.dimensions.length : s.length;
    const rawWidth = (s.dimensions && Number(s.dimensions.width) > 0) ? s.dimensions.width : s.width;
    const rawHeight = (s.dimensions && Number(s.dimensions.height) > 0) ? s.dimensions.height : s.height;

    const length = Number(rawLength);
    const width = Number(rawWidth);
    const height = Number(rawHeight);
    const vol = Number(rawVol);
    const wt = Number(rawWt);

    // Dimension consistency check
    let calculatedVol = vol;
    if ((!Number.isFinite(vol) || vol <= 0) && Number.isFinite(length) && Number.isFinite(width) && Number.isFinite(height) && length > 0 && width > 0 && height > 0) {
      calculatedVol = parseFloat((length * width * height).toFixed(6));
    }

    const priorityKey = (s.priority || 'STANDARD').toUpperCase();
    const priorityWeight = PRIORITY_WEIGHTS[priorityKey] || PRIORITY_WEIGHTS.STANDARD;

    const hasDims = Number.isFinite(length) && Number.isFinite(width) && Number.isFinite(height) && length > 0 && width > 0 && height > 0;

    const item = {
      shipmentId,
      bookingId: s.bookingId || shipmentId,
      customer: s.customer || s.shipperId || 'CUSTOMER',
      cargoDescription: s.cargoDescription || 'Cargo Box',
      pickup,
      delivery,
      pickupIndex: pIdx,
      deliveryIndex: dIdx,
      volume: calculatedVol,
      weight: wt,
      dimensions: { length: hasDims ? length : 0, width: hasDims ? width : 0, height: hasDims ? height : 0 },
      hasDimensions: hasDims,
      allowRotation: s.allowRotation !== false,
      fragile: Boolean(s.fragile),
      stackable: s.stackable !== false && s.stackable !== 'false',
      priority: priorityKey,
      priorityWeight,
      density: calculatedVol > 0 ? wt / calculatedVol : 0
    };

    // Pre-validation filter
    if (pIdx === -1 || dIdx === -1) {
      invalidShipments.push({ item, reason: `INVALID_ROUTE_STOP: Pickup (${pickup}) or Delivery (${delivery}) does not exist on route.` });
      continue;
    }
    if (pIdx >= dIdx) {
      invalidShipments.push({ item, reason: `INVALID_DIRECTION: Pickup stop index (${pIdx}) is at or after delivery stop index (${dIdx}).` });
      continue;
    }

    // Numerical sanity checks (NaN, Infinity, negative, zero)
    if (!Number.isFinite(wt) || wt <= 0) {
      invalidShipments.push({ item, reason: 'INVALID_PACKAGE_WEIGHT' });
      continue;
    }
    if (!Number.isFinite(calculatedVol) || calculatedVol <= 0) {
      invalidShipments.push({ item, reason: 'INVALID_PACKAGE_VOLUME' });
      continue;
    }
    if (rawLength !== undefined && (!Number.isFinite(length) || length <= 0)) {
      invalidShipments.push({ item, reason: 'INVALID_PACKAGE_DIMENSIONS' });
      continue;
    }
    if (rawWidth !== undefined && (!Number.isFinite(width) || width <= 0)) {
      invalidShipments.push({ item, reason: 'INVALID_PACKAGE_DIMENSIONS' });
      continue;
    }
    if (rawHeight !== undefined && (!Number.isFinite(height) || height <= 0)) {
      invalidShipments.push({ item, reason: 'INVALID_PACKAGE_DIMENSIONS' });
      continue;
    }

    // Physical capacity overflow checks
    if (calculatedVol > normalizedTruck.capacityVolume + 1e-7) {
      invalidShipments.push({ item, reason: 'CARGO_EXCEEDS_VOLUME' });
      continue;
    }
    if (wt > normalizedTruck.capacityWeight + 1e-7) {
      invalidShipments.push({ item, reason: 'CARGO_EXCEEDS_WEIGHT' });
      continue;
    }

    // Physical 3D bounding box checks
    if (item.hasDimensions && normalizedTruck.dimensions.length > 0) {
      const sortedItemDims = [length, width, height].sort((a, b) => a - b);
      const sortedTruckDims = [normalizedTruck.dimensions.length, normalizedTruck.dimensions.width, normalizedTruck.dimensions.height].sort((a, b) => a - b);
      if (
        sortedItemDims[0] > sortedTruckDims[0] + 1e-7 ||
        sortedItemDims[1] > sortedTruckDims[1] + 1e-7 ||
        sortedItemDims[2] > sortedTruckDims[2] + 1e-7
      ) {
        invalidShipments.push({ item, reason: 'PACKAGE_DOES_NOT_FIT' });
        continue;
      }
    }

    normalizedShipments.push(item);
  }

  // Normalize existing load (if re-optimizing active truck)
  const normalizedCurrentLoad = [];
  for (const c of currentLoad) {
    const pIdx = getStopIndex(c.pickupStop || c.fromStop || stops[0]);
    const dIdx = getStopIndex(c.deliveryStop || c.toStop || stops[stops.length - 1]);
    if (pIdx !== -1 && dIdx !== -1 && pIdx < dIdx) {
      normalizedCurrentLoad.push({
        shipmentId: c.shipmentId || c.bookingId || 'EXISTING',
        bookingId: c.bookingId || c.shipmentId || 'EXISTING',
        pickupIndex: pIdx,
        deliveryIndex: dIdx,
        volume: parseFloat(c.volume) || 0,
        weight: parseFloat(c.weight) || 0,
        isLocked: true
      });
    }
  }

  return {
    truck: normalizedTruck,
    route: normalizedRoute,
    candidateShipments: normalizedShipments,
    invalidShipments,
    currentLoad: normalizedCurrentLoad,
    config
  };
};
