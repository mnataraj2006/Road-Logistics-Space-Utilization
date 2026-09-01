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
    if (req.user && req.user.role === 'carrier') {
      filter.carrierId = req.user.username;
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
    if (req.user && req.user.role === 'carrier') {
      vehicleFilter.carrierId = req.user.username;
      routeFilter.carrierId = req.user.username;
    }
    const vehicles = await Vehicle.find(vehicleFilter);
    const routes = await Route.find(routeFilter);
    
    const vehicleMap = new Map(vehicles.map(v => [v.vehicleId, v]));
    const routeInfoMap = new Map(routes.map(r => [r.routeId, r]));

    let matchFilter = { status: { $in: ['Completed', 'COMPLETED', 'DELIVERED'] } };
    if (req.user && req.user.role === 'shipper') {
      matchFilter.shipperId = req.user.username;
    } else if (req.user && req.user.role === 'carrier') {
      matchFilter.carrierId = req.user.username;
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

    // Aggregate bookings by routeId
    const performance = await Booking.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: '$routeId',
          totalBookings: { $sum: 1 },
          totalVolume: { $sum: '$volume' },
          totalWeight: { $sum: '$weight' },
          totalRevenue: { $sum: '$revenue' }
        }
      },
      { $sort: { totalRevenue: -1 } }
    ]);

    const analytics = performance.map(perf => {
      const routeId = perf._id;
      const details = routeInfoMap.get(routeId);
      const totalCost = Math.round(routeCostMap.get(routeId) || 0);
      const totalProfit = perf.totalRevenue - totalCost;
      const profitMargin = perf.totalRevenue > 0 ? parseFloat(((totalProfit / perf.totalRevenue) * 100).toFixed(1)) : 0;

      return {
        routeId,
        source: details ? details.source : 'Unknown',
        destination: details ? details.destination : 'Unknown',
        distance: details ? details.distance : 0,
        baseRate: details ? details.baseRate : 0,
        stops: details ? details.stops : [],
        totalBookings: perf.totalBookings,
        totalVolume: parseFloat(perf.totalVolume.toFixed(1)),
        totalWeight: perf.totalWeight,
        totalRevenue: perf.totalRevenue,
        totalCost,
        totalProfit,
        profitMargin,
        avgRevenuePerBooking: perf.totalBookings > 0 ? parseFloat((perf.totalRevenue / perf.totalBookings).toFixed(2)) : 0,
        avgProfitPerBooking: perf.totalBookings > 0 ? parseFloat((totalProfit / perf.totalBookings).toFixed(2)) : 0,
        avgLoadVolume: perf.totalBookings > 0 ? parseFloat((perf.totalVolume / perf.totalBookings).toFixed(1)) : 0
      };
    });

    // Include routes with 0 bookings as well
    const activeRouteIds = new Set(performance.map(p => p._id));
    routes.forEach(route => {
      if (!activeRouteIds.has(route.routeId)) {
        analytics.push({
          routeId: route.routeId,
          source: route.source,
          destination: route.destination,
          distance: route.distance,
          baseRate: route.baseRate,
          stops: route.stops || [],
          totalBookings: 0,
          totalVolume: 0,
          totalWeight: 0,
          totalRevenue: 0,
          totalCost: 0,
          totalProfit: 0,
          profitMargin: 0,
          avgRevenuePerBooking: 0,
          avgProfitPerBooking: 0,
          avgLoadVolume: 0
        });
      }
    });

    res.json(analytics);
  } catch (error) {
    console.error('Route performance analysis error:', error);
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create a new route
// @route   POST /api/routes
// @access  Private
export const createRoute = async (req, res) => {
  const { routeId, source, destination, distance, baseRate, stops } = req.body;

  if (!req.user || req.user.role !== 'carrier') {
    return res.status(403).json({ message: 'Access denied: Only carriers can manage route lanes.' });
  }

  const carrierId = req.user.username;

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
// @access  Private
export const updateRoute = async (req, res) => {
  const { source, destination, distance, baseRate, stops } = req.body;

  if (!req.user || req.user.role !== 'carrier') {
    return res.status(403).json({ message: 'Access denied: Only carriers can manage route lanes.' });
  }

  try {
    const route = await Route.findOne({ routeId: req.params.id });
    if (!route) {
      return res.status(404).json({ message: 'Route not found' });
    }

    if (route.carrierId !== req.user.username) {
      return res.status(403).json({ message: 'Access denied: You do not own this route lane.' });
    }

    if (source !== undefined) route.source = source;
    if (destination !== undefined) route.destination = destination;
    if (distance !== undefined) route.distance = Number(distance);
    if (baseRate !== undefined) route.baseRate = Number(baseRate);
    if (stops !== undefined) route.stops = stops;

    const updatedRoute = await route.save();
    res.json(updatedRoute);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// @desc    Delete a route
// @route   DELETE /api/routes/:id
// @access  Private
export const deleteRoute = async (req, res) => {
  if (!req.user || req.user.role !== 'carrier') {
    return res.status(403).json({ message: 'Access denied: Only carriers can manage route lanes.' });
  }

  try {
    const route = await Route.findOne({ routeId: req.params.id });
    if (!route) {
      return res.status(404).json({ message: 'Route not found' });
    }

    if (route.carrierId !== req.user.username) {
      return res.status(403).json({ message: 'Access denied: You do not own this route lane.' });
    }

    await Route.deleteOne({ routeId: req.params.id });
    res.json({ message: 'Route removed successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


