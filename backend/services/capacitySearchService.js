import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Booking from '../models/Booking.js';
import Trip from '../models/Trip.js';
import crypto from 'crypto';
import { calculateDeterministicPrice } from './pricingService.js';
import { recordAuditEvent } from './auditService.js';

/**
 * Normalizes stop names for consistent case-insensitive comparison.
 */
const normStop = (name) => (name ? String(name).trim().toLowerCase() : '');

/**
 * Searches for available truck space across exact multi-stop route segments occupied by the shipment.
 *
 * @param {Object} query
 * @param {String} query.pickup - Pickup stop location name
 * @param {String} query.delivery - Delivery stop location name
 * @param {String|Date} query.date - Shipment date (YYYY-MM-DD or Date object)
 * @param {Number} query.volume - Required volume in m³
 * @param {Number} query.weight - Required weight in kg
 * @param {Number} [query.length] - Length in meters
 * @param {Number} [query.width] - Width in meters
 * @param {Number} [query.height] - Height in meters
 * @param {String} [query.priority] - STANDARD | EXPRESS | URGENT
 * @param {Boolean} [query.fragile] - Fragile cargo flag
 * @param {Boolean} [query.stackable] - Stackable cargo flag
 * @returns {Promise<Object>} Search results with eligible vehicles, segment breakdown, pricing, and ranking
 */
export const searchAvailableTruckSpace = async ({
  pickup,
  delivery,
  date,
  volume,
  weight,
  length = 0,
  width = 0,
  height = 0,
  priority = 'STANDARD',
  fragile = false,
  stackable = true
}) => {
  const reqVol = parseFloat(volume);
  const reqWt = parseFloat(weight);
  const reqLen = parseFloat(length) || 0;
  const reqWid = parseFloat(width) || 0;
  const reqHgt = parseFloat(height) || 0;

  if (!pickup || !delivery) {
    throw new Error('Both pickup and delivery stops are required.');
  }
  if (normStop(pickup) === normStop(delivery)) {
    throw new Error('Pickup stop and delivery stop cannot be the same location.');
  }
  if (isNaN(reqVol) || reqVol <= 0) {
    throw new Error('Valid positive cargo volume (m³) is required.');
  }
  if (isNaN(reqWt) || reqWt <= 0) {
    throw new Error('Valid positive cargo weight (kg) is required.');
  }

  // Parse target date range (full day window)
  const targetDate = date ? new Date(date) : new Date();
  const dayStart = new Date(targetDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  // 1. Fetch all active vehicles
  const activeVehicles = await Vehicle.find({ status: 'Active' });
  if (!activeVehicles.length) {
    return {
      query: { pickup, delivery, date: dayStart.toISOString().split('T')[0], volume: reqVol, weight: reqWt },
      totalCandidatesEvaluated: 0,
      matchedTrucksCount: 0,
      results: []
    };
  }

  // 2. Fetch all active routes
  const routes = await Route.find({ active: { $ne: false } });
  const routeMap = new Map(routes.map(r => [r.routeId, r]));

  // 3. Fetch active bookings on that date for all candidate vehicles
  const activeVehicleIds = activeVehicles.map(v => v.vehicleId);
  const activeBookings = await Booking.find({
    vehicleId: { $in: activeVehicleIds },
    date: { $gte: dayStart, $lte: dayEnd },
    status: { $in: ['Pending', 'PENDING', 'CONFIRMED', 'ALLOCATED', 'WAITING_FOR_PICKUP', 'LOADED', 'In Transit', 'IN_TRANSIT'] }
  });

  // Group bookings by vehicleId
  const bookingsByVehicle = new Map();
  for (const b of activeBookings) {
    if (!bookingsByVehicle.has(b.vehicleId)) {
      bookingsByVehicle.set(b.vehicleId, []);
    }
    bookingsByVehicle.get(b.vehicleId).push(b);
  }

  const results = [];

  // Evaluate each vehicle
  for (const vehicle of activeVehicles) {
    if (!vehicle.routeLane || vehicle.routeLane === 'Inactive Lane') {
      continue; // Vehicle has no active route lane assigned
    }

    const route = routeMap.get(vehicle.routeLane);
    if (!route) continue;

    // Resolve stops sequence
    let stops = [];
    if (route.stopsDetails && route.stopsDetails.length > 1) {
      stops = route.stopsDetails.map(s => s.locationName);
    } else if (route.stops && route.stops.length > 1) {
      stops = route.stops;
    } else if (route.source && route.destination) {
      stops = [route.source, route.destination];
    } else {
      continue; // Insufficient stops
    }

    // Resolve stop indexes for shipment
    const pickupIdx = stops.findIndex(s => normStop(s) === normStop(pickup));
    const deliveryIdx = stops.findIndex(s => normStop(s) === normStop(delivery));

    // Must exist on route and have forward direction
    if (pickupIdx === -1 || deliveryIdx === -1 || pickupIdx >= deliveryIdx) {
      continue; // Route does not serve pickup -> delivery in valid direction
    }

    const numSegments = stops.length - 1;
    const segmentVolumeUsed = new Array(numSegments).fill(0);
    const segmentWeightUsed = new Array(numSegments).fill(0);

    // Calculate existing load on each route segment
    const vBookings = bookingsByVehicle.get(vehicle.vehicleId) || [];
    for (const bkg of vBookings) {
      const bFromIdx = stops.findIndex(s => normStop(s) === normStop(bkg.fromStop || stops[0]));
      const bToIdx = stops.findIndex(s => normStop(s) === normStop(bkg.toStop || stops[stops.length - 1]));

      const start = Math.max(0, bFromIdx !== -1 ? bFromIdx : 0);
      const end = Math.min(numSegments, bToIdx !== -1 ? bToIdx : numSegments);

      if (start < end) {
        for (let i = start; i < end; i++) {
          segmentVolumeUsed[i] += parseFloat(bkg.volume) || 0;
          segmentWeightUsed[i] += parseFloat(bkg.weight) || 0;
        }
      }
    }

    // Check capacity for the segments occupied by this requested shipment: [pickupIdx, ..., deliveryIdx - 1]
    let hasCapacity = true;
    let minRemainingVol = vehicle.capacityVolume;
    let minRemainingWt = vehicle.capacityWeight;
    let maxProjectedVolUtil = 0;
    let maxProjectedWtUtil = 0;
    let maxCurrentVolUtil = 0;
    let maxCurrentWtUtil = 0;

    const relevantSegments = [];
    const allSegments = [];

    for (let i = 0; i < numSegments; i++) {
      const isOccupiedByShipment = i >= pickupIdx && i < deliveryIdx;
      const curVol = segmentVolumeUsed[i];
      const curWt = segmentWeightUsed[i];
      const projVol = curVol + (isOccupiedByShipment ? reqVol : 0);
      const projWt = curWt + (isOccupiedByShipment ? reqWt : 0);

      const remVol = Math.max(0, vehicle.capacityVolume - curVol);
      const remWt = Math.max(0, vehicle.capacityWeight - curWt);

      const curVolUtil = vehicle.capacityVolume > 0 ? (curVol / vehicle.capacityVolume) * 100 : 0;
      const curWtUtil = vehicle.capacityWeight > 0 ? (curWt / vehicle.capacityWeight) * 100 : 0;
      const projVolUtil = vehicle.capacityVolume > 0 ? (projVol / vehicle.capacityVolume) * 100 : 0;
      const projWtUtil = vehicle.capacityWeight > 0 ? (projWt / vehicle.capacityWeight) * 100 : 0;

      const segData = {
        segmentIndex: i,
        fromStop: stops[i],
        toStop: stops[i + 1],
        isOccupiedByRequest: isOccupiedByShipment,
        capacityVolume: vehicle.capacityVolume,
        capacityWeight: vehicle.capacityWeight,
        usedVolumeBefore: parseFloat(curVol.toFixed(2)),
        usedWeightBefore: Math.round(curWt),
        remainingVolume: parseFloat(remVol.toFixed(2)),
        remainingWeight: Math.round(remWt),
        volumeUtilBefore: parseFloat(curVolUtil.toFixed(1)),
        weightUtilBefore: parseFloat(curWtUtil.toFixed(1)),
        volumeUtilAfter: parseFloat(projVolUtil.toFixed(1)),
        weightUtilAfter: parseFloat(projWtUtil.toFixed(1))
      };

      allSegments.push(segData);

      if (isOccupiedByShipment) {
        relevantSegments.push(segData);
        if (remVol < minRemainingVol) minRemainingVol = remVol;
        if (remWt < minRemainingWt) minRemainingWt = remWt;

        if (projVol > vehicle.capacityVolume || projWt > vehicle.capacityWeight) {
          hasCapacity = false;
        }

        if (projVolUtil > maxProjectedVolUtil) maxProjectedVolUtil = projVolUtil;
        if (projWtUtil > maxProjectedWtUtil) maxProjectedWtUtil = projWtUtil;
        if (curVolUtil > maxCurrentVolUtil) maxCurrentVolUtil = curVolUtil;
        if (curWtUtil > maxCurrentWtUtil) maxCurrentWtUtil = curWtUtil;
      }
    }

    // Physical dimensional check (if truck body dimensions are set)
    let dimensionFit = true;
    if (vehicle.dimensions && reqLen > 0 && reqWid > 0 && reqHgt > 0) {
      const vLen = vehicle.dimensions.length || 0;
      const vWid = vehicle.dimensions.width || 0;
      const vHgt = vehicle.dimensions.height || 0;
      if (vLen > 0 && reqLen > vLen) dimensionFit = false;
      if (vWid > 0 && reqWid > vWid) dimensionFit = false;
      if (vHgt > 0 && reqHgt > vHgt) dimensionFit = false;
    }

    if (!hasCapacity || !dimensionFit) {
      continue; // Filter out trucks that fail segment capacity or dimension bounds
    }

    // Pricing calculation for the occupied portion
    const numOccupiedHops = deliveryIdx - pickupIdx;
    const fractionOfRoute = numOccupiedHops / numSegments;
    const distanceOccupiedKm = Math.round(route.distance * fractionOfRoute);

    // Compute 100% deterministic, explainable price statement
    const pricingStatement = calculateDeterministicPrice({
      distanceKm: distanceOccupiedKm,
      volume: reqVol,
      weight: reqWt,
      cargoType: fragile ? 'FRAGILE' : 'STANDARD',
      serviceLevel: priority || 'STANDARD',
      truckType: vehicle.type,
      segmentUtilization: maxCurrentVolUtil
    });
    const estimatedPrice = pricingStatement.finalPrice;

    // Objective Fit Score: favors high fill-rate after booking without overflowing
    const avgProjectedUtil = (maxProjectedVolUtil + maxProjectedWtUtil) / 2;
    const fitScore = parseFloat((avgProjectedUtil * 1.5 + (100 - (minRemainingVol / vehicle.capacityVolume) * 50)).toFixed(2));

    results.push({
      vehicleId: vehicle.vehicleId,
      vehicleType: vehicle.type,
      capacityVolume: vehicle.capacityVolume,
      capacityWeight: vehicle.capacityWeight,
      dimensions: vehicle.dimensions || { length: 0, width: 0, height: 0 },
      organizationId: vehicle.organizationId,
      logisticsCompanyName: vehicle.logisticsCompanyName || 'Apex Logistics',
      carrierId: vehicle.carrierId,
      baseLocation: vehicle.baseLocation || '',
      transitStatus: vehicle.transitStatus,
      route: {
        routeId: route.routeId,
        source: route.source,
        destination: route.destination,
        totalDistanceKm: route.distance,
        occupiedDistanceKm: distanceOccupiedKm,
        stopsCount: stops.length,
        stops
      },
      segmentSpan: {
        pickup,
        delivery,
        pickupIndex: pickupIdx,
        deliveryIndex: deliveryIdx,
        hopsCount: numOccupiedHops
      },
      availableVolume: parseFloat(minRemainingVol.toFixed(2)),
      availableWeight: Math.round(minRemainingWt),
      utilizationBefore: {
        volumePercent: parseFloat(maxCurrentVolUtil.toFixed(1)),
        weightPercent: parseFloat(maxCurrentWtUtil.toFixed(1))
      },
      utilizationAfter: {
        volumePercent: parseFloat(maxProjectedVolUtil.toFixed(1)),
        weightPercent: parseFloat(maxProjectedWtUtil.toFixed(1))
      },
      estimatedPrice,
      pricing: pricingStatement,
      currency: 'INR',
      fitScore,
      relevantSegments,
      allSegments,
      departureDate: dayStart.toISOString().split('T')[0]
    });
  }

  // 4. Rank results by fitScore descending (best utilization and space optimization)
  results.sort((a, b) => b.fitScore - a.fitScore);

  return {
    query: {
      pickup,
      delivery,
      date: dayStart.toISOString().split('T')[0],
      volume: reqVol,
      weight: reqWt,
      length: reqLen,
      width: reqWid,
      height: reqHgt,
      priority
    },
    totalCandidatesEvaluated: activeVehicles.length,
    matchedTrucksCount: results.length,
    results
  };
};

/**
 * Concurrency-safe transactional booking creation against selected truck space.
 * Performs rigorous segment re-validation inside a MongoDB session to eliminate race conditions.
 */
export const bookTruckCapacity = async ({
  vehicleId,
  routeId,
  pickup,
  delivery,
  date,
  volume,
  weight,
  length = 0,
  width = 0,
  height = 0,
  cargoDescription = '',
  invoiceNumber = '',
  invoiceValue = 0,
  customerUser,
  session
}) => {
  const reqVol = parseFloat(volume);
  const reqWt = parseFloat(weight);

  // 1. Verify vehicle exists and is active
  const vehicle = await Vehicle.findOne({ vehicleId, status: 'Active' }).session(session);
  if (!vehicle) {
    throw { status: 404, message: `Truck '${vehicleId}' is not active or not found.` };
  }

  // 2. Verify route
  const targetRouteId = routeId || vehicle.routeLane;
  const route = await Route.findOne({ routeId: targetRouteId, active: { $ne: false } }).session(session);
  if (!route) {
    throw { status: 404, message: `Route '${targetRouteId}' is not available.` };
  }

  // 3. Resolve stops & segments
  let stops = [];
  if (route.stopsDetails && route.stopsDetails.length > 1) {
    stops = route.stopsDetails.map(s => s.locationName);
  } else if (route.stops && route.stops.length > 1) {
    stops = route.stops;
  } else {
    stops = [route.source, route.destination];
  }

  const pIdx = stops.findIndex(s => normStop(s) === normStop(pickup));
  const dIdx = stops.findIndex(s => normStop(s) === normStop(delivery));

  if (pIdx === -1 || dIdx === -1 || pIdx >= dIdx) {
    throw { status: 400, message: `Route ${route.routeId} does not serve ${pickup} -> ${delivery} in forward direction.` };
  }

  // 4. Concurrency check: Re-fetch ALL active bookings within this session with transactional read lock
  const targetDate = new Date(date);
  const dayStart = new Date(targetDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(targetDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const existingBookings = await Booking.find({
    vehicleId,
    date: { $gte: dayStart, $lte: dayEnd },
    status: { $in: ['Pending', 'PENDING', 'CONFIRMED', 'ALLOCATED', 'WAITING_FOR_PICKUP', 'LOADED', 'In Transit', 'IN_TRANSIT'] }
  }).session(session);

  const numSegments = stops.length - 1;
  const segVol = new Array(numSegments).fill(0);
  const segWt = new Array(numSegments).fill(0);

  for (const bkg of existingBookings) {
    const bFromIdx = stops.findIndex(s => normStop(s) === normStop(bkg.fromStop || stops[0]));
    const bToIdx = stops.findIndex(s => normStop(s) === normStop(bkg.toStop || stops[stops.length - 1]));
    const s = Math.max(0, bFromIdx !== -1 ? bFromIdx : 0);
    const e = Math.min(numSegments, bToIdx !== -1 ? bToIdx : numSegments);
    if (s < e) {
      for (let i = s; i < e; i++) {
        segVol[i] += bkg.volume;
        segWt[i] += bkg.weight;
      }
    }
  }

  // Strict check on occupied segments [pIdx, dIdx - 1]
  for (let i = pIdx; i < dIdx; i++) {
    if (segVol[i] + reqVol > vehicle.capacityVolume || segWt[i] + reqWt > vehicle.capacityWeight) {
      throw {
        status: 409,
        message: `Capacity conflict! Segment ${stops[i]} → ${stops[i + 1]} has insufficient space (Occupied: ${segVol[i]} m³ / ${vehicle.capacityVolume} m³, ${segWt[i]} kg / ${vehicle.capacityWeight} kg).`,
        details: { segment: `${stops[i]} → ${stops[i + 1]}`, remainingVolume: vehicle.capacityVolume - segVol[i], remainingWeight: vehicle.capacityWeight - segWt[i] }
      };
    }
  }

  // 5. Calculate price
  const numOccupiedHops = dIdx - pIdx;
  const fractionOfRoute = numOccupiedHops / numSegments;
  const distanceOccupiedKm = Math.round(route.distance * fractionOfRoute);
  const distFactor = 1.0 + (distanceOccupiedKm / 1000);
  const ratePerCbm = vehicle.ratePerCbm || (route.baseRate ? route.baseRate / 20 : 150);
  const ratePerKg = vehicle.ratePerKg || 5;
  const baseVolPrice = reqVol * ratePerCbm * distFactor;
  const baseWtPrice = reqWt * ratePerKg * (distanceOccupiedKm / 500);
  const revenue = Math.round(Math.max(baseVolPrice, baseWtPrice * 1.2));

  // 6. Generate IDs
  const count = await Booking.countDocuments({}).session(session);
  const bookingId = `BKG-${String(count + 1).padStart(6, '0')}`;
  const shipmentId = `SHP-${bookingId}`;

  // 7. Atomic DB Writes
  const { default: Shipment } = await import('../models/Shipment.js');
  const shipment = new Shipment({
    shipmentId,
    bookingId,
    customer: customerUser._id,
    shipperId: customerUser.username,
    cargoDescription,
    packageCount: 1,
    length: parseFloat(length) || 0,
    width: parseFloat(width) || 0,
    height: parseFloat(height) || 0,
    volume: reqVol,
    weight: reqWt,
    pickupStop: pickup,
    deliveryStop: delivery,
    requestedDate: targetDate,
    organizationId: vehicle.organizationId,
    logisticsCompanyName: vehicle.logisticsCompanyName || '',
    status: 'ALLOCATED',
    invoiceNumber,
    invoiceValue: Number(invoiceValue) || 0
  });
  await shipment.save({ session });

  const booking = new Booking({
    bookingId,
    shipment: shipment._id,
    shipmentId: shipment.shipmentId,
    customer: customerUser._id,
    customerId: customerUser.username || String(customerUser._id),
    shipper: customerUser._id,
    shipperId: customerUser.username,
    organizationId: vehicle.organizationId,
    logisticsCompanyName: vehicle.logisticsCompanyName || '',
    carrier: vehicle.carrier,
    carrierId: vehicle.carrierId,
    vehicle: vehicle._id,
    vehicleId: vehicle.vehicleId,
    route: route._id,
    routeId: route.routeId,
    date: targetDate,
    fromStop: pickup,
    toStop: delivery,
    requestedSegment: { fromStop: pickup, toStop: delivery },
    requestedCapacity: { volume: reqVol, weight: reqWt },
    volume: reqVol,
    weight: reqWt,
    revenue,
    price: revenue,
    paymentState: 'ESCROW',
    cargoDescription,
    invoiceNumber,
    invoiceValue: Number(invoiceValue) || 0,
    status: 'ALLOCATED'
  });
  await booking.save({ session });

  // Create payment record
  const { default: Payment } = await import('../models/Payment.js');
  const payment = new Payment({
    booking: booking._id,
    bookingId: booking.bookingId,
    shipper: customerUser._id,
    shipperId: customerUser.username,
    carrier: vehicle.carrier,
    carrierId: vehicle.carrierId,
    amount: revenue,
    platformFee: Math.round(revenue * 0.05),
    carrierPayout: Math.round(revenue * 0.95),
    status: 'Escrow',
    transactionId: `tx_ch_${booking.bookingId}_${crypto.randomBytes(4).toString('hex')}`
  });
  await payment.save({ session });

  // Record Audit Event
  await recordAuditEvent({
    eventType: 'BOOKING_CREATED',
    entityType: 'Booking',
    entityId: booking.bookingId,
    actor: customerUser.username || customerUser.name || 'customer',
    previousState: 'NONE',
    resultingState: 'ALLOCATED',
    metadata: {
      shipmentId: shipment.shipmentId,
      vehicleId,
      routeId: targetRouteId,
      pickup,
      delivery,
      volume: reqVol,
      weight: reqWt,
      price: revenue
    }
  }, { session });

  return { shipment, booking, payment, vehicle, route };
};
