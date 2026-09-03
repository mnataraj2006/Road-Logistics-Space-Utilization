import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Trip from '../models/Trip.js';
import Shipment from '../models/Shipment.js';
import Route from '../models/Route.js';
import Vehicle from '../models/Vehicle.js';
import { generateLoadPlan } from '../optimizer/index.js';
import { resolveAuthoritativeTruck } from '../controllers/tripController.js';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/road_logistics_db';

const debugRun = async () => {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to DB');

  const trip = await Trip.findOne({ tripId: 'TRIP-1788332046972-1303EB' }).populate('vehicle').populate('route');
  console.log('Trip Found:', trip ? trip.tripId : 'null', 'Route:', trip?.route?.routeId, 'Vehicle:', trip?.vehicleId);
  console.log('Trip Route Stops:', trip?.route?.stops);
  console.log('Trip Route StopsDetails:', trip?.route?.stopsDetails);

  const authTruck = resolveAuthoritativeTruck(trip, trip.vehicle);
  console.log('Authoritative Truck:', authTruck);

  const shipments = await Shipment.find({});
  console.log('All Shipments in DB:', shipments.map(s => ({
    id: s.shipmentId,
    pickup: s.pickupStop,
    delivery: s.deliveryStop,
    status: s.status,
    vol: s.volume,
    wt: s.weight,
    dims: { l: s.length, w: s.width, h: s.height }
  })));

  const route = trip.route;
  const stops = route.stopsDetails?.length > 1
    ? route.stopsDetails.map(st => st.locationName)
    : (route.stops?.length > 1 ? route.stops : [route.source, route.destination]);

  console.log('Resolved stops for trip:', stops);

  const candidates = shipments.map(s => ({
    shipmentId: s.shipmentId,
    bookingId: s.shipmentId,
    pickup: s.pickupStop,
    delivery: s.deliveryStop,
    volume: s.volume,
    weight: s.weight,
    dimensions: { length: s.length, width: s.width, height: s.height },
    fragile: s.fragile,
    stackable: s.stackable,
    priority: s.priority
  }));

  const plan = generateLoadPlan({
    truck: authTruck,
    route: trip.route,
    shipments: candidates,
    currentLoad: []
  });

  console.log('\n--- LOAD PLAN RESULT ---');
  console.log('Assigned Count:', plan.assignments.length);
  console.log('Assignments:', plan.assignments);
  console.log('Unassigned Count:', plan.unassignedShipments.length);
  console.log('Unassigned Reasons:', plan.unassignedShipments.map(u => ({ id: u.shipmentId || u.item?.shipmentId, reason: u.reason })));

  process.exit(0);
};

debugRun();
