import crypto from 'crypto';
import Trip from '../models/Trip.js';
import TripStop from '../models/TripStop.js';
import Route from '../models/Route.js';
import Vehicle from '../models/Vehicle.js';
import Booking from '../models/Booking.js';
import Shipment from '../models/Shipment.js';
import LoadOperation from '../models/LoadOperation.js';
import StopVerification from '../models/StopVerification.js';
import { calculateTruckSegmentCapacity } from './capacityService.js';

/**
 * Initializes or retrieves an active Trip record for a Vehicle and Route.
 */
export const getOrCreateActiveTrip = async (vehicleId, routeId, session = null) => {
  let trip = await Trip.findOne({
    vehicleId,
    status: { $in: ['PLANNED', 'READY', 'DISPATCHED', 'IN_TRANSIT', 'AT_STOP'] }
  }).session(session);

  if (!trip) {
    const route = await Route.findOne({ routeId }).session(session);
    if (!route) throw new Error(`Route ${routeId} not found`);

    const tripId = `TRIP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    trip = new Trip({
      tripId,
      vehicleId,
      routeId,
      carrierId: route.carrierId || '',
      status: 'READY',
      currentStopIndex: 0,
      currentStop: route.stops && route.stops.length > 0 ? route.stops[0] : route.source
    });
    await trip.save({ session });

    // Initialize TripStops
    if (route.stopsDetails && route.stopsDetails.length > 0) {
      for (const sd of route.stopsDetails) {
        const tripStop = new TripStop({
          trip: trip._id,
          tripId: trip.tripId,
          stopId: sd.stopId,
          sequence: sd.sequenceNumber,
          location: sd.locationName,
          plannedArrival: sd.plannedArrival || new Date(),
          verificationStatus: sd.sequenceNumber === 1 ? 'READY' : 'UPCOMING',
          qrToken: sd.qrToken || `STPTKN-${trip.tripId}-${sd.stopId}-${crypto.randomBytes(4).toString('hex')}`
        });
        await tripStop.save({ session });
      }
    }
  }

  return trip;
};

/**
 * Dispatches a trip, transitioning vehicle, trip, and booked packages.
 */
export const dispatchTrip = async ({ vehicleId, session }) => {
  const vehicle = await Vehicle.findOne({ vehicleId }).session(session);
  if (!vehicle) throw { status: 404, message: `Vehicle ${vehicleId} not found` };
  if (vehicle.status !== 'Active') throw { status: 400, message: `Vehicle ${vehicleId} is not active` };

  const routeId = vehicle.routeLane;
  if (!routeId || routeId === 'Inactive Lane') throw { status: 400, message: 'Vehicle has no route lane assigned' };

  const route = await Route.findOne({ routeId }).session(session);
  if (!route || !route.stopsDetails || route.stopsDetails.length < 2) {
    throw { status: 400, message: 'Assigned route has invalid stop details' };
  }

  const originStopName = route.stopsDetails[0].locationName;

  // Find active bookings assigned to this vehicle
  const activeBookings = await Booking.find({
    vehicleId,
    status: { $in: ['Pending', 'PENDING', 'CONFIRMED', 'ALLOCATED', 'WAITING_FOR_PICKUP'] }
  }).session(session);

  const originPackages = [];
  const downstreamPackages = [];

  for (const bkg of activeBookings) {
    const isOrigin = bkg.fromStop && bkg.fromStop.toLowerCase().trim() === originStopName.toLowerCase().trim();
    if (isOrigin) {
      originPackages.push(bkg);
    } else {
      downstreamPackages.push(bkg);
    }
  }

  // Check origin capacity
  const capacityCheck = calculateTruckSegmentCapacity(vehicle, route, originPackages);
  if (capacityCheck.segments.length > 0) {
    const firstLeg = capacityCheck.segments[0];
    if (firstLeg.usedVolume > vehicle.capacityVolume || firstLeg.usedWeight > vehicle.capacityWeight) {
      throw {
        status: 400,
        message: 'Dispatch failed. Origin load exceeds truck capacity.',
        details: { segment: `${firstLeg.fromStop} → ${firstLeg.toStop}`, usedVolume: firstLeg.usedVolume, capacityVolume: vehicle.capacityVolume }
      };
    }
  }

  const trip = await getOrCreateActiveTrip(vehicleId, routeId, session);
  const now = new Date();

  trip.status = 'IN_TRANSIT';
  trip.startedAt = now;
  trip.actualDeparture = now;
  trip.currentStopIndex = 0;
  trip.currentStop = originStopName;
  await trip.save({ session });

  // Update TripStop #1 as COMPLETED
  await TripStop.updateOne(
    { tripId: trip.tripId, sequence: 1 },
    { verificationStatus: 'COMPLETED', actualArrival: now, completionTimestamp: now },
    { session }
  );

  // Update TripStop #2 as READY
  await TripStop.updateOne(
    { tripId: trip.tripId, sequence: 2 },
    { verificationStatus: 'READY', plannedArrival: now },
    { session }
  );

  // Transition Origin Packages -> IN_TRANSIT & Record LoadOperation
  for (const bkg of originPackages) {
    const prevStatus = bkg.status;
    bkg.status = 'IN_TRANSIT';
    bkg.loadedAt = now;
    await bkg.save({ session });

    if (bkg.shipmentId) {
      await Shipment.updateOne({ shipmentId: bkg.shipmentId }, { status: 'IN_TRANSIT' }, { session });
    }

    const op = new LoadOperation({
      operationId: `LOP-${Date.now()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`,
      tripId: trip.tripId,
      stopId: route.stopsDetails[0].stopId,
      location: originStopName,
      shipmentId: bkg.shipmentId || bkg.bookingId,
      bookingId: bkg.bookingId,
      operationType: 'LOADED',
      performedBy: 'driver/dispatcher',
      previousState: prevStatus,
      resultingState: 'IN_TRANSIT',
      volume: bkg.volume,
      weight: bkg.weight
    });
    await op.save({ session });
  }

  // Transition Downstream Packages -> WAITING_FOR_PICKUP
  for (const bkg of downstreamPackages) {
    bkg.status = 'WAITING_FOR_PICKUP';
    await bkg.save({ session });
    if (bkg.shipmentId) {
      await Shipment.updateOne({ shipmentId: bkg.shipmentId }, { status: 'WAITING_FOR_PICKUP' }, { session });
    }
  }

  // Update Vehicle summary state
  vehicle.transitStatus = 'IN_TRANSIT';
  vehicle.activeTripId = trip.tripId;
  vehicle.currentRouteIndex = 0;
  vehicle.currentStop = '';
  vehicle.tripStartedAt = now;
  await vehicle.save({ session });

  return {
    trip,
    originStop: originStopName,
    loadedCount: originPackages.length,
    waitingCount: downstreamPackages.length
  };
};
