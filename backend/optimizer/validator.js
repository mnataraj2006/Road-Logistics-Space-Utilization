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
  const truckDimensions = {
    length: parseFloat(truck.dimensions?.length || 0) || Math.cbrt(truck.capacityVolume * 2),
    width: parseFloat(truck.dimensions?.width || 0) || Math.cbrt(truck.capacityVolume * 0.8),
    height: parseFloat(truck.dimensions?.height || 0) || Math.cbrt(truck.capacityVolume * 0.625)
  };

  const normalizedTruck = {
    vehicleId: truck.vehicleId || truck._id || 'TRUCK-1',
    capacityVolume: parseFloat(truck.capacityVolume),
    capacityWeight: parseFloat(truck.capacityWeight),
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

    const vol = parseFloat(s.volume || 0);
    const wt = parseFloat(s.weight || 0);

    const length = parseFloat(s.dimensions?.length || s.length || 0);
    const width = parseFloat(s.dimensions?.width || s.width || 0);
    const height = parseFloat(s.dimensions?.height || s.height || 0);

    // Dimension consistency check
    let calculatedVol = vol;
    if (vol <= 0 && length > 0 && width > 0 && height > 0) {
      calculatedVol = parseFloat((length * width * height).toFixed(3));
    }

    const priorityKey = (s.priority || 'STANDARD').toUpperCase();
    const priorityWeight = PRIORITY_WEIGHTS[priorityKey] || PRIORITY_WEIGHTS.STANDARD;

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
      dimensions: { length, width, height },
      hasDimensions: length > 0 && width > 0 && height > 0,
      fragile: Boolean(s.fragile),
      stackable: s.stackable !== false && s.stackable !== 'false',
      priority: priorityKey,
      priorityWeight,
      density: calculatedVol > 0 ? wt / calculatedVol : 0
    };

    // Pre-validation filter
    if (pIdx === -1 || dIdx === -1) {
      invalidShipments.push({ item, reason: `Pickup (${pickup}) or Delivery (${delivery}) does not exist on route.` });
      continue;
    }
    if (pIdx >= dIdx) {
      invalidShipments.push({ item, reason: `Invalid direction: Pickup stop index (${pIdx}) is at or after delivery stop index (${dIdx}).` });
      continue;
    }
    if (calculatedVol <= 0) {
      invalidShipments.push({ item, reason: `Invalid volume (${calculatedVol} m³). Volume must be strictly positive.` });
      continue;
    }
    if (wt <= 0) {
      invalidShipments.push({ item, reason: `Invalid weight (${wt} kg). Weight must be strictly positive.` });
      continue;
    }
    if (calculatedVol > normalizedTruck.capacityVolume) {
      invalidShipments.push({ item, reason: `Shipment volume (${calculatedVol} m³) exceeds truck total volume capacity (${normalizedTruck.capacityVolume} m³).` });
      continue;
    }
    if (wt > normalizedTruck.capacityWeight) {
      invalidShipments.push({ item, reason: `Shipment weight (${wt} kg) exceeds truck total weight capacity (${normalizedTruck.capacityWeight} kg).` });
      continue;
    }
    if (item.hasDimensions && normalizedTruck.dimensions.length > 0) {
      // Check if item fits in any 3D orientation (bounding-box check)
      const sortedItemDims = [length, width, height].sort((a, b) => a - b);
      const sortedTruckDims = [normalizedTruck.dimensions.length, normalizedTruck.dimensions.width, normalizedTruck.dimensions.height].sort((a, b) => a - b);
      if (
        sortedItemDims[0] > sortedTruckDims[0] ||
        sortedItemDims[1] > sortedTruckDims[1] ||
        sortedItemDims[2] > sortedTruckDims[2]
      ) {
        invalidShipments.push({ item, reason: `Shipment dimensions (${length}x${width}x${height}m) exceed truck interior dimensions.` });
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
