import crypto from 'crypto';
import Route from '../models/Route.js';
import Booking from '../models/Booking.js';
import Vehicle from '../models/Vehicle.js';

// Trip operating cost helper based on vehicle type and route distance
const calculateTripCost = (vehicleType, distance) => {
  let baseCost = 800;
  let costPerKm = 5;
  
  if (vehicleType === 'Heavy Truck') {
    baseCost = 3000;
    costPerKm = 12;
  } else if (vehicleType === 'Medium Truck') {
    baseCost = 1800;
    costPerKm = 8;
  } else if (vehicleType === 'Light Van') {
    baseCost = 800;
    costPerKm = 5;
  }
  
  return baseCost + (distance * costPerKm);
};

// @desc    Get all routes
// @route   GET /api/routes
// @access  Private
export const getRoutes = async (req, res) => {
  try {
    let filter = {};
    if (req.user && req.user.role === 'logistics_manager' && req.user.carrierId) {
      filter.carrierId = req.user.carrierId;
    }
    const routes = await Route.find(filter);
    res.json(routes);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get route by ID
// @route   GET /api/routes/:id
// @access  Private
export const getRouteById = async (req, res) => {
  try {
    const route = await Route.findOne({ routeId: req.params.id });
    if (!route) {
      return res.status(404).json({ message: 'Route not found' });
    }
    res.json(route);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get performance analytics for all routes
// @route   GET /api/routes/analytics/performance
// @access  Private
export const getRoutePerformance = async (req, res) => {
  try {
    let vehicleFilter = {};
    let routeFilter = {};
    if (req.user && req.user.role === 'logistics_manager' && req.user.carrierId) {
      vehicleFilter.carrierId = req.user.carrierId;
      routeFilter.carrierId = req.user.carrierId;
    }
    const vehicles = await Vehicle.find(vehicleFilter);
    const routes = await Route.find(routeFilter);
    
    const vehicleMap = new Map(vehicles.map(v => [v.vehicleId, v]));
    const routeInfoMap = new Map(routes.map(r => [r.routeId, r]));

    let matchFilter = { status: { $in: ['Completed', 'COMPLETED', 'DELIVERED'] } };
    if (req.user && (req.user.role === 'customer' || req.user.role === 'shipper')) {
      matchFilter.shipperId = req.user.username;
    } else if (req.user && req.user.role === 'logistics_manager' && req.user.carrierId) {
      matchFilter.carrierId = req.user.carrierId;
    }

    // Identify unique trips on each route to calculate operating costs
    const routeTrips = await Booking.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            routeId: '$routeId',
            vehicleId: '$vehicleId',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }
          }
        }
      }
    ]);

    const routeCostMap = new Map();
    routeTrips.forEach(trip => {
      const routeId = trip._id.routeId;
      const v = vehicleMap.get(trip._id.vehicleId);
      const r = routeInfoMap.get(routeId);
      if (v && r) {
        const cost = calculateTripCost(v.type, r.distance);
        routeCostMap.set(routeId, (routeCostMap.get(routeId) || 0) + cost);
      }
    });

    // Aggregate completed bookings grouped by route
    const analytics = await Booking.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$routeId',
          totalRevenue: { $sum: { $ifNull: ['$revenue', '$price'] } },
          totalCompletedBookings: { $sum: 1 },
          totalVolumeUtilized: { $sum: '$volume' },
          totalWeightUtilized: { $sum: '$weight' },
        }
      }
    ]);

    // Enhance analytics with operating costs and margin
    const enhancedAnalytics = analytics.map(a => {
      const operatingCost = routeCostMap.get(a._id) || 0;
      const margin = a.totalRevenue - operatingCost;
      const marginPercent = a.totalRevenue > 0 ? ((margin / a.totalRevenue) * 100).toFixed(1) : 0;
      const routeObj = routeInfoMap.get(a._id);

      return {
        ...a,
        source: routeObj ? routeObj.source : 'Unknown',
        destination: routeObj ? routeObj.destination : 'Unknown',
        operatingCost,
        margin,
        marginPercent: Number(marginPercent)
      };
    });

    res.json(enhancedAnalytics);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new route lane
// @route   POST /api/routes
// @access  Private (Logistics Manager)
export const createRoute = async (req, res) => {
  const { routeId, source, destination, distance, baseRate, stops } = req.body;

  if (!req.user || !['logistics_manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: Only logistics managers can manage route lanes.' });
  }

  const carrierId = req.user.carrierId || req.user.username;

  try {
    const exists = await Route.findOne({ routeId });
    if (exists) {
      return res.status(400).json({ message: 'Route already exists' });
    }

    const allStops = [source, ...(stops || []), destination];
    const stopsDetails = allStops.map((stopName, idx) => {
      const isOrigin = idx === 0;
      const isDest = idx === allStops.length - 1;
      return {
        stopId: `STP-${routeId}-${idx + 1}`,
        sequenceNumber: idx + 1,
        locationName: stopName,
        qrToken: `STPTKN-${crypto.randomBytes(8).toString('hex')}`,
        stopType: isOrigin ? 'ORIGIN' : isDest ? 'FINAL_DESTINATION' : 'INTERMEDIATE',
        status: isOrigin ? 'Ready' : 'Upcoming'
      };
    });

    const route = new Route({
      routeId,
      source,
      destination,
      distance: Number(distance),
      baseRate: Number(baseRate),
      stops: stops || [],
      stopsDetails,
      currentStopIndex: 0,
      carrierId
    });

    const savedRoute = await route.save();
    res.status(201).json(savedRoute);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Update a route
// @route   PUT /api/routes/:id
// @access  Private (Logistics Manager)
export const updateRoute = async (req, res) => {
  const { routeId: newRouteId, source, destination, distance, baseRate, stops } = req.body;

  if (!req.user || !['logistics_manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: Only logistics managers can manage route lanes.' });
  }

  try {
    const route = await Route.findOne({ routeId: req.params.id });
    if (!route) {
      return res.status(404).json({ message: 'Route not found' });
    }

    const oldRouteId = route.routeId;

    if (newRouteId && newRouteId.trim().toUpperCase() !== oldRouteId) {
      const cleanNewId = newRouteId.trim().toUpperCase();
      const duplicate = await Route.findOne({ routeId: cleanNewId });
      if (duplicate) {
        return res.status(400).json({ message: `A route corridor with identifier '${cleanNewId}' already exists.` });
      }
      route.routeId = cleanNewId;

      // Update references in Vehicle and Trip models if needed
      await Vehicle.updateMany({ routeLane: oldRouteId }, { routeLane: cleanNewId });
    }

    if (source !== undefined) route.source = source.trim();
    if (destination !== undefined) route.destination = destination.trim();
    if (distance !== undefined) route.distance = Number(distance);
    if (baseRate !== undefined) route.baseRate = Number(baseRate);
    if (stops !== undefined) {
      const rawList = Array.isArray(stops) ? stops : stops.split(',').map(s => s.trim()).filter(Boolean);
      // Ensure origin and destination are not duplicated inside intermediate stops
      route.stops = rawList.filter(
        s => s.toLowerCase() !== route.source.toLowerCase() && s.toLowerCase() !== route.destination.toLowerCase()
      );
    }

    // Recompute sequential stopsDetails
    const allStops = [route.source, ...(route.stops || []), route.destination];
    route.stopsDetails = allStops.map((stopName, idx) => {
      const isOrigin = idx === 0;
      const isDest = idx === allStops.length - 1;
      return {
        stopId: `STP-${route.routeId}-${idx + 1}`,
        sequenceNumber: idx + 1,
        locationName: stopName,
        qrToken: `STPTKN-${crypto.randomBytes(8).toString('hex')}`,
        stopType: isOrigin ? 'ORIGIN' : isDest ? 'FINAL_DESTINATION' : 'INTERMEDIATE',
        status: isOrigin ? 'Ready' : 'Upcoming'
      };
    });

    const updatedRoute = await route.save();
    res.json(updatedRoute);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a route
// @route   DELETE /api/routes/:id
// @access  Private (Logistics Manager)
export const deleteRoute = async (req, res) => {
  if (!req.user || !['logistics_manager', 'admin'].includes(req.user.role)) {
    return res.status(403).json({ message: 'Access denied: Only logistics managers can manage route lanes.' });
  }

  try {
    const route = await Route.findOne({ routeId: req.params.id });
    if (!route) {
      return res.status(404).json({ message: 'Route not found' });
    }

    // Safety check 1: Cannot delete route if active trips exist on it
    const Trip = (await import('../models/Trip.js')).default;
    const activeTrip = await Trip.findOne({
      routeId: route.routeId,
      status: { $in: ['PLANNED', 'DRAFT', 'READY_FOR_DISPATCH', 'DISPATCHED', 'IN_TRANSIT', 'AT_STOP'] }
    });

    if (activeTrip) {
      return res.status(400).json({
        message: `Cannot delete route ${route.routeId}: Active Trip ${activeTrip.tripId} (${activeTrip.status}) is currently scheduled on this route.`
      });
    }

    // Safety check 2: Cannot delete route if active vehicles are assigned to this route lane
    const Vehicle = (await import('../models/Vehicle.js')).default;
    const activeVehicle = await Vehicle.findOne({
      routeLane: route.routeId,
      status: 'Active'
    });

    if (activeVehicle) {
      return res.status(400).json({
        message: `Cannot delete route ${route.routeId}: Active truck ${activeVehicle.vehicleId} is currently assigned to this route lane.`
      });
    }

    // Safety check 3: Cannot delete route if active bookings exist on it
    const Booking = (await import('../models/Booking.js')).default;
    const activeBooking = await Booking.findOne({
      routeId: route.routeId,
      status: { $in: ['BOOKED', 'ALLOCATED', 'LOCKED', 'IN_TRANSIT'] }
    });

    if (activeBooking) {
      return res.status(400).json({
        message: `Cannot delete route ${route.routeId}: Active consignment ${activeBooking.bookingId} (${activeBooking.status}) is booked on this route.`
      });
    }

    await Route.deleteOne({ routeId: req.params.id });
    res.json({ message: 'Route removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


