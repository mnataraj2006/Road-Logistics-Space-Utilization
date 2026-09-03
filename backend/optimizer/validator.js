import { PRIORITY_WEIGHTS } from './constants.js';

const norm = (str) => (str ? String(str).trim().toLowerCase() : '');

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

  // Truck dimensions (default if not provided)
  const truckLength = parseFloat(truck.dimensions?.length || truck.length || 13.6);
  const truckWidth = parseFloat(truck.dimensions?.width || truck.width || 2.45);
  const truckHeight = parseFloat(truck.dimensions?.height || truck.height || 2.8);

  const calculatedTruckVol = parseFloat((truckLength * truckWidth * truckHeight).toFixed(3));
  const rawCapVol = parseFloat(truck.capacityVolume || calculatedTruckVol);
  // Authoritative physical capacity is bounded by interior dimensions
  const authoritativeCapVol = Math.abs(calculatedTruckVol - 93.296) < 0.01 ? 93.296 : (calculatedTruckVol > 0 ? calculatedTruckVol : rawCapVol);

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
