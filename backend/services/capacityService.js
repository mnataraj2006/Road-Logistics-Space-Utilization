import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import Booking from '../models/Booking.js';

/**
 * Calculates segment-by-segment volume and weight utilization for a vehicle along its assigned route.
 *
 * @param {Object} vehicle Vehicle Mongoose document or JS object
 * @param {Object} route Route Mongoose document or JS object
 * @param {Array} activeBookings Array of active Booking documents/objects assigned to this vehicle
 * @returns {Object} Canonical capacity summary with leg details
 */
export const calculateTruckSegmentCapacity = (vehicle, route, activeBookings = []) => {
  const capacityVol = vehicle.capacityVolume || 0;
  const capacityWt = vehicle.capacityWeight || 0;

  // Determine stops list from route
  let stops = [];
  if (route && route.stopsDetails && route.stopsDetails.length > 0) {
    stops = route.stopsDetails.map(s => s.locationName);
  } else if (route && route.stops && route.stops.length > 0) {
    stops = route.stops;
  } else if (route && route.source && route.destination) {
    stops = [route.source, route.destination];
  } else {
    stops = ['Origin', 'Destination'];
  }

  const numStops = stops.length;
  const numSegments = Math.max(1, numStops - 1);

  const segmentVolume = new Array(numSegments).fill(0);
  const segmentWeight = new Array(numSegments).fill(0);

  // Helper to match stop index
  const getStopIndex = (stopName, fallbackIdx) => {
    if (!stopName) return fallbackIdx;
    const idx = stops.findIndex(s => s.toLowerCase() === stopName.toLowerCase().trim());
    return idx !== -1 ? idx : fallbackIdx;
  };

  // Accumulate loads across occupied segments for each active booking
  activeBookings.forEach(bkg => {
    const vol = parseFloat(bkg.volume) || 0;
    const wt = parseFloat(bkg.weight) || 0;

    const fromIdx = getStopIndex(bkg.fromStop, 0);
    const toIdx = getStopIndex(bkg.toStop, numStops - 1);

    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);

    if (start < end) {
      for (let i = start; i < end && i < numSegments; i++) {
        segmentVolume[i] += vol;
        segmentWeight[i] += wt;
      }
    }
  });

  const segments = [];
  let maxUsedVolume = 0;
  let maxUsedWeight = 0;

  for (let i = 0; i < numSegments; i++) {
    const volUsed = segmentVolume[i];
    const wtUsed = segmentWeight[i];

    if (volUsed > maxUsedVolume) maxUsedVolume = volUsed;
    if (wtUsed > maxUsedWeight) maxUsedWeight = wtUsed;

    const volRem = Math.max(0, capacityVol - volUsed);
    const wtRem = Math.max(0, capacityWt - wtUsed);

    const volUtil = capacityVol > 0 ? (volUsed / capacityVol) * 100 : 0;
    const wtUtil = capacityWt > 0 ? (wtUsed / capacityWt) * 100 : 0;

    segments.push({
      segmentIndex: i,
      fromStop: stops[i],
      toStop: stops[i + 1],
      usedVolume: parseFloat(volUsed.toFixed(2)),
      usedWeight: Math.round(wtUsed),
      remainingVolume: parseFloat(volRem.toFixed(2)),
      remainingWeight: Math.round(wtRem),
      volumeUtilizationPercent: parseFloat(volUtil.toFixed(1)),
      weightUtilizationPercent: parseFloat(wtUtil.toFixed(1))
    });
  }

  const overallMinRemainingVol = Math.max(0, capacityVol - maxUsedVolume);
  const overallMinRemainingWt = Math.max(0, capacityWt - maxUsedWeight);

  const volumeUtilizationPercent = capacityVol > 0 ? (maxUsedVolume / capacityVol) * 100 : 0;
  const weightUtilizationPercent = capacityWt > 0 ? (maxUsedWeight / capacityWt) * 100 : 0;

  return {
    vehicleId: vehicle.vehicleId,
    capacityVolume: capacityVol,
    capacityWeight: capacityWt,
    usedVolume: parseFloat(maxUsedVolume.toFixed(2)),
    usedWeight: Math.round(maxUsedWeight),
    remainingVolume: parseFloat(overallMinRemainingVol.toFixed(2)),
    remainingWeight: Math.round(overallMinRemainingWt),
    volumeUtilizationPercent: parseFloat(volumeUtilizationPercent.toFixed(1)),
    weightUtilizationPercent: parseFloat(weightUtilizationPercent.toFixed(1)),
    stops,
    segments
  };
};

/**
 * Convenience helper to fetch vehicle, route, and active bookings from DB and calculate capacity.
 *
 * @param {String} vehicleId Truck ID
 * @param {Date} [targetDate] Optional date filter
 * @returns {Promise<Object>} Capacity calculation summary
 */
export const getRemainingCapacityForTruck = async (vehicleId, targetDate = null) => {
  const vehicle = await Vehicle.findOne({ vehicleId });
  if (!vehicle) throw new Error(`Vehicle ${vehicleId} not found`);

  let route = null;
  if (vehicle.routeLane && vehicle.routeLane !== 'Inactive Lane') {
    route = await Route.findOne({ routeId: vehicle.routeLane });
  }

  const query = {
    vehicleId,
    status: { $in: ['Pending', 'PENDING', 'ALLOCATED', 'WAITING_FOR_PICKUP', 'LOADED', 'In Transit', 'IN_TRANSIT'] }
  };

  if (targetDate) {
    const dayStart = new Date(targetDate);
    dayStart.setUTCHours(0, 0, 0, 0);
    const dayEnd = new Date(targetDate);
    dayEnd.setUTCHours(23, 59, 59, 999);
    query.date = { $gte: dayStart, $lte: dayEnd };
  }

  const activeBookings = await Booking.find(query);
  return calculateTruckSegmentCapacity(vehicle, route, activeBookings);
};
