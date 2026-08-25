import Booking from '../models/Booking.js';
import Vehicle from '../models/Vehicle.js';
import Route from '../models/Route.js';
import User from '../models/User.js';
import Payment from '../models/Payment.js';
import { calculateTruckSegmentCapacity } from '../services/capacityService.js';

// @desc    Get all bookings
// @route   GET /api/bookings
// @access  Private
export const getBookings = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    
    let filter = {};
    if (req.user && req.user.role === 'shipper') {
      filter.shipperId = req.user.username;
    } else if (req.user && req.user.role === 'carrier') {
      filter.$or = [
        { carrierId: req.user.username },
        { carrierId: 'UNASSIGNED' }
      ];
    }

    const bookings = await Booking.find(filter)
      .sort({ date: -1 })
      .limit(limit);
    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Create new booking
// @route   POST /api/bookings
// @access  Private
export const createBooking = async (req, res) => {
  const { date, vehicleId, routeId, volume, weight, status, fromStop, toStop, cargoDescription, invoiceNumber, invoiceValue } = req.body;

  try {
    let route = null;
    let finalRouteId = 'UNASSIGNED';
    if (routeId && routeId !== 'UNASSIGNED') {
      route = await Route.findOne({ routeId });
      if (!route) return res.status(404).json({ message: 'Route not found' });
      finalRouteId = route.routeId;
    }

    const newVolume = parseFloat(volume);
    const newWeight = parseFloat(weight);

    let vehicle = null;
    let finalVehicleId = 'UNASSIGNED';
    let carrier = null;
    let carrierId = 'UNASSIGNED';

    // If a vehicle is specified and is not UNASSIGNED, perform capacity checks
    if (vehicleId && vehicleId !== 'UNASSIGNED') {
      vehicle = await Vehicle.findOne({ vehicleId });
      if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

      finalVehicleId = vehicle.vehicleId;
      carrier = vehicle.carrier;
      carrierId = vehicle.carrierId;

      // Enforce capacity limits along specific route segments (only if route is present!)
      if (route) {
        const targetDateStart = new Date(date);
        targetDateStart.setUTCHours(0, 0, 0, 0);
        const targetDateEnd = new Date(date);
        targetDateEnd.setUTCHours(23, 59, 59, 999);

        const activeBookings = await Booking.find({
          vehicleId,
          date: { $gte: targetDateStart, $lte: targetDateEnd },
          status: { $in: ['Pending', 'In Transit'] }
        });

        // Determine the stops sequence for the route
        let routeStops = route.stops;
        if (!routeStops || routeStops.length < 2) {
          routeStops = [route.source, route.destination];
        }

        const numSegments = routeStops.length - 1;
        const segmentVolume = new Array(numSegments).fill(0);
        const segmentWeight = new Array(numSegments).fill(0);

        // Helper to get segment range indices
        const getSegmentIndices = (from, to) => {
          const fromIdx = routeStops.findIndex(s => s.toLowerCase() === from.toLowerCase());
          const toIdx = routeStops.findIndex(s => s.toLowerCase() === to.toLowerCase());
          if (fromIdx === -1 || toIdx === -1 || fromIdx >= toIdx) {
            return { start: 0, end: numSegments - 1 };
          }
          return { start: fromIdx, end: toIdx - 1 };
        };

        // Calculate load for existing bookings on each segment
        activeBookings.forEach(b => {
          const bFrom = b.fromStop || routeStops[0];
          const bTo = b.toStop || routeStops[routeStops.length - 1];
          const { start, end } = getSegmentIndices(bFrom, bTo);
          for (let i = start; i <= end; i++) {
            segmentVolume[i] += b.volume;
            segmentWeight[i] += b.weight;
          }
        });

        // Check if the new booking fits
        const newFrom = fromStop || routeStops[0];
        const newTo = toStop || routeStops[routeStops.length - 1];
        const { start: newStart, end: newEnd } = getSegmentIndices(newFrom, newTo);

        let maxVolumeUsed = 0;
        let maxWeightUsed = 0;
        let capacityViolated = false;

        for (let i = newStart; i <= newEnd; i++) {
          const projectedVol = segmentVolume[i] + newVolume;
          const projectedWt = segmentWeight[i] + newWeight;
          
          if (projectedVol > maxVolumeUsed) maxVolumeUsed = projectedVol;
          if (projectedWt > maxWeightUsed) maxWeightUsed = projectedWt;

          if (projectedVol > vehicle.capacityVolume || projectedWt > vehicle.capacityWeight) {
            capacityViolated = true;
          }
        }

        if (capacityViolated) {
          // Find alternative active vehicles on the same lane that can fit this booking
          const candidateVehicles = await Vehicle.find({
            routeLane: routeId,
            status: 'Active',
            vehicleId: { $ne: vehicleId }
          });

          const alternatives = [];
          for (const candidate of candidateVehicles) {
            const candBookings = await Booking.find({
              vehicleId: candidate.vehicleId,
              date: { $gte: targetDateStart, $lte: targetDateEnd },
              status: { $in: ['Pending', 'In Transit'] }
            });

            const candSegVol = new Array(numSegments).fill(0);
            const candSegWt = new Array(numSegments).fill(0);

            candBookings.forEach(b => {
              const bFrom = b.fromStop || routeStops[0];
              const bTo = b.toStop || routeStops[routeStops.length - 1];
              const { start, end } = getSegmentIndices(bFrom, bTo);
              for (let i = start; i <= end; i++) {
                candSegVol[i] += b.volume;
                candSegWt[i] += b.weight;
              }
            });

            let fits = true;
            let minRemainingVol = Infinity;
            let minRemainingWt = Infinity;

            for (let i = newStart; i <= newEnd; i++) {
              const projectedVol = candSegVol[i] + newVolume;
              const projectedWt = candSegWt[i] + newWeight;
              if (projectedVol > candidate.capacityVolume || projectedWt > candidate.capacityWeight) {
                fits = false;
                break;
              }
              const remVol = candidate.capacityVolume - candSegVol[i];
              const remWt = candidate.capacityWeight - candSegWt[i];
              if (remVol < minRemainingVol) minRemainingVol = remVol;
              if (remWt < minRemainingWt) minRemainingWt = remWt;
            }

            if (fits) {
              alternatives.push({
                vehicleId: candidate.vehicleId,
                type: candidate.type,
                carrierId: candidate.carrierId,
                routeId: candidate.routeLane,
                remainingVolume: parseFloat(minRemainingVol.toFixed(1)),
                remainingWeight: Math.round(minRemainingWt)
              });
            }
          }

          return res.status(400).json({
            message: 'Capacity exceeded. The selected vehicle does not have enough remaining volume or weight capacity on this date along your route segment.',
            details: {
              requestedVolume: newVolume,
              remainingVolume: parseFloat(Math.max(0, vehicle.capacityVolume - (maxVolumeUsed - newVolume)).toFixed(1)),
              requestedWeight: newWeight,
              remainingWeight: Math.max(0, vehicle.capacityWeight - (maxWeightUsed - newWeight))
            },
            alternatives
          });
        }
      }
    } else {
      // Fallback lookup carrier from Route if unassigned (only if route is present)
      if (route && route.carrierId) {
        carrierId = route.carrierId;
        const carUser = await User.findOne({ username: route.carrierId, role: 'carrier' });
        if (carUser) {
          carrier = carUser._id;
        }
      }
    }

    // Identify Shipper
    let shipper = req.user._id;
    let shipperId = req.user.username;
    if (req.body.shipperId && req.user.role !== 'shipper') {
      const shUser = await User.findOne({ username: req.body.shipperId, role: 'shipper' });
      if (shUser) {
        shipper = shUser._id;
        shipperId = shUser.username;
      }
    }

    // Generate Booking ID
    const count = await Booking.countDocuments({});
    const bookingId = `BKG-${String(count + 1).padStart(6, '0')}`;

    // Pricing calculation with dynamic discount
    let basePrice = newVolume * 150;
    if (route) {
      const pricingFactor = 1.0 + (route.distance / 1000);
      basePrice = (newVolume * (route.baseRate / 15)) * pricingFactor;

      // Apply 15% discount if vehicle occupancy is currently under 75% (only if vehicle is present)
      if (vehicle && vehicle.capacityVolume > 0) {
        const targetDateStart = new Date(date);
        targetDateStart.setUTCHours(0, 0, 0, 0);
        const targetDateEnd = new Date(date);
        targetDateEnd.setUTCHours(23, 59, 59, 999);
        const activeBookings = await Booking.find({
          vehicleId,
          date: { $gte: targetDateStart, $lte: targetDateEnd },
          status: { $in: ['Pending', 'In Transit'] }
        });
        const currentVolume = activeBookings.reduce((sum, b) => sum + b.volume, 0);
        const currentOccupancy = (currentVolume / vehicle.capacityVolume) * 100;
        if (currentOccupancy < 75) {
          basePrice = basePrice * 0.85; // 15% discount
        }
      }
    }

    const revenue = Math.round(basePrice * (Math.random() * 0.05 + 0.98));

    const newBooking = new Booking({
      bookingId,
      date: new Date(date),
      vehicle,
      vehicleId: finalVehicleId,
      shipper,
      shipperId,
      carrier,
      carrierId,
      route: route ? route._id : null,
      routeId: finalRouteId,
      weight: newWeight,
      volume: newVolume,
      revenue,
      status: status || 'Pending',
      fromStop: fromStop || '',
      toStop: toStop || '',
      cargoDescription: cargoDescription || '',
      invoiceNumber: invoiceNumber || '',
      invoiceValue: invoiceValue !== undefined ? Number(invoiceValue) : 0
    });

    const savedBooking = await newBooking.save();

    // Create payment transaction
    const payment = new Payment({
      booking: savedBooking._id,
      bookingId: savedBooking.bookingId,
      shipper,
      shipperId,
      carrier,
      carrierId,
      amount: revenue,
      platformFee: Math.round(revenue * 0.05),
      carrierPayout: Math.round(revenue * 0.95),
      status: savedBooking.status === 'Completed' ? 'PaidOut' : 'Escrow',
      transactionId: 'ch_' + Math.random().toString(36).substring(2, 12),
      createdAt: new Date(date)
    });
    await payment.save();

    res.status(201).json(savedBooking);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

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

// @desc    Get daily/weekly booking trends
// @route   GET /api/bookings/analytics/trends
// @access  Private
export const getBookingTrends = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    let matchFilter = { date: { $gte: cutoffDate } };
    if (req.user && req.user.role === 'shipper') {
      matchFilter.shipperId = req.user.username;
    } else if (req.user && req.user.role === 'carrier') {
      matchFilter.carrierId = req.user.username;
    }

    const trends = await Booking.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            status: '$status'
          },
          count: { $sum: 1 },
          volume: { $sum: '$volume' },
          revenue: { $sum: '$revenue' }
        }
      },
      { $sort: { '_id.date': 1 } }
    ]);

    // Fetch vehicles and routes to map details for operating costs
    const vehicles = await Vehicle.find({});
    const routes = await Route.find({});
    const vehicleMap = new Map(vehicles.map(v => [v.vehicleId, v]));
    const routeMap = new Map(routes.map(r => [r.routeId, r]));

    let tripMatchFilter = { date: { $gte: cutoffDate }, status: { $ne: 'Cancelled' } };
    if (req.user && req.user.role === 'shipper') {
      tripMatchFilter.shipperId = req.user.username;
    } else if (req.user && req.user.role === 'carrier') {
      tripMatchFilter.carrierId = req.user.username;
    }

    // Find all unique trips per day to aggregate operating costs
    const dailyTrips = await Booking.aggregate([
      { $match: tripMatchFilter },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } },
            vehicleId: '$vehicleId',
            routeId: '$routeId'
          }
        }
      }
    ]);

    const dailyCostMap = new Map();
    dailyTrips.forEach(trip => {
      const date = trip._id.date;
      const v = vehicleMap.get(trip._id.vehicleId);
      const r = routeMap.get(trip._id.routeId);
      if (v && r) {
        const cost = calculateTripCost(v.type, r.distance);
        dailyCostMap.set(date, (dailyCostMap.get(date) || 0) + cost);
      }
    });

    // Reshape trends for Chart.js
    const formattedMap = new Map();
    trends.forEach(item => {
      const date = item._id.date;
      const status = item._id.status;
      
      if (!formattedMap.has(date)) {
        formattedMap.set(date, { date, completed: 0, cancelled: 0, volume: 0, revenue: 0 });
      }
      
      const record = formattedMap.get(date);
      if (status === 'Completed') {
        record.completed = item.count;
        record.volume = parseFloat(item.volume.toFixed(1));
        record.revenue = item.revenue;
      } else if (status === 'Cancelled') {
        record.cancelled = item.count;
      } else if (status === 'Pending') {
        record.completed += item.count;
        record.volume += parseFloat(item.volume.toFixed(1));
        record.revenue += item.revenue;
      }
    });

    const sortedTrends = Array.from(formattedMap.values()).map(record => {
      const cost = Math.round(dailyCostMap.get(record.date) || 0);
      const profit = record.revenue - cost;
      const profitMargin = record.revenue > 0 ? parseFloat(((profit / record.revenue) * 100).toFixed(1)) : 0;
      return {
        ...record,
        cost,
        profit,
        profitMargin
      };
    }).sort((a, b) => a.date.localeCompare(b.date));

    res.json(sortedTrends);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get dashboard high level KPIs
// @route   GET /api/bookings/analytics/kpis
// @access  Private
export const getDashboardKPIs = async (req, res) => {
  try {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    let matchFilter = { date: { $gte: thirtyDaysAgo }, status: { $ne: 'Cancelled' } };
    if (req.user && req.user.role === 'shipper') {
      matchFilter.shipperId = req.user.username;
    } else if (req.user && req.user.role === 'carrier') {
      matchFilter.carrierId = req.user.username;
    }

    const kpis = await Booking.aggregate([
      { $match: matchFilter },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$revenue' },
          totalVolume: { $sum: '$volume' },
          totalWeight: { $sum: '$weight' },
          bookingsCount: { $sum: 1 }
        }
      }
    ]);

    let vehicleFilter = { status: 'Active' };
    let routeFilter = {};
    if (req.user && req.user.role === 'carrier') {
      vehicleFilter.carrierId = req.user.username;
      routeFilter.carrierId = req.user.username;
    }
    const activeVehiclesCount = await Vehicle.countDocuments(vehicleFilter);
    const totalRoutesCount = await Route.countDocuments(routeFilter);

    // Fetch vehicles and routes to map details for operating costs
    const vehicles = await Vehicle.find({});
    const routes = await Route.find({});
    const vehicleMap = new Map(vehicles.map(v => [v.vehicleId, v]));
    const routeMap = new Map(routes.map(r => [r.routeId, r]));

    let tripMatchFilter = { date: { $gte: thirtyDaysAgo }, status: { $ne: 'Cancelled' } };
    if (req.user && req.user.role === 'shipper') {
      tripMatchFilter.shipperId = req.user.username;
    } else if (req.user && req.user.role === 'carrier') {
      tripMatchFilter.carrierId = req.user.username;
    }

    // Identify all unique trips in the last 30 days to calculate operating cost and occupancy
    const tripStats = await Booking.aggregate([
      { $match: tripMatchFilter },
      {
        $group: {
          _id: {
            vehicleId: '$vehicleId',
            routeId: '$routeId',
            date: { $dateToString: { format: '%Y-%m-%d', date: '$date' } }
          },
          totalVolume: { $sum: '$volume' }
        }
      }
    ]);

    let totalCost30Days = 0;
    let sumOccupancy = 0;
    let totalTrips = tripStats.length;

    tripStats.forEach(trip => {
      const v = vehicleMap.get(trip._id.vehicleId);
      const r = routeMap.get(trip._id.routeId);
      if (v && r) {
        const cost = calculateTripCost(v.type, r.distance);
        totalCost30Days += cost;
        sumOccupancy += (trip.totalVolume / v.capacityVolume) * 100;
      }
    });

    const averageOccupancy = totalTrips > 0 ? parseFloat((sumOccupancy / totalTrips).toFixed(1)) : 0;
    const currentKPI = kpis[0] || { totalRevenue: 0, totalVolume: 0, totalWeight: 0, bookingsCount: 0 };
    
    const revenue30Days = currentKPI.totalRevenue;
    const profit30Days = revenue30Days - totalCost30Days;
    const profitMargin30Days = revenue30Days > 0 ? parseFloat(((profit30Days / revenue30Days) * 100).toFixed(1)) : 0;

    res.json({
      revenue30Days,
      cost30Days: totalCost30Days,
      profit30Days,
      profitMargin30Days,
      volume30Days: parseFloat(currentKPI.totalVolume.toFixed(1)),
      weight30Days: currentKPI.totalWeight,
      bookingsCount30Days: currentKPI.bookingsCount,
      avgOccupancy30Days: averageOccupancy,
      activeVehicles: activeVehiclesCount,
      totalRoutes: totalRoutesCount
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Get transaction payment history
// @route   GET /api/bookings/payments
// @access  Private
export const getPayments = async (req, res) => {
  try {
    let filter = {};
    if (req.user && req.user.role === 'shipper') {
      filter.shipperId = req.user.username;
    } else if (req.user && req.user.role === 'carrier') {
      filter.carrierId = req.user.username;
    }
    const payments = await Payment.find(filter).sort({ createdAt: -1 });
    res.json(payments);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Release payment from escrow to carrier
// @route   PUT /api/bookings/payments/:id/release
// @access  Private/Admin
export const releasePayment = async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ message: 'Payment record not found' });
    }
    payment.status = 'PaidOut';
    await payment.save();

    // Also update associated booking status to Completed if needed
    const booking = await Booking.findOne({ bookingId: payment.bookingId });
    if (booking) {
      booking.status = 'Completed';
      await booking.save();
    }

    res.json({ message: 'Payment successfully released to carrier.', payment });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// @desc    Bulk update/commit optimizer booking vehicle allocations with server-side validation
// @route   POST /api/bookings/bulk-update
// @access  Private
export const bulkUpdateBookings = async (req, res) => {
  const { assignments } = req.body; // Array of { bookingId, vehicleId, status }

  if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
    return res.status(400).json({ message: 'Invalid or empty assignments format.' });
  }

  try {
    // Phase 1: Group proposed allocations by vehicleId for strict validation
    const vehicleAssignmentsMap = new Map();

    for (const assign of assignments) {
      if (!assign.bookingId || !assign.vehicleId) {
        return res.status(400).json({ message: 'Each assignment must specify bookingId and vehicleId.' });
      }
      if (!vehicleAssignmentsMap.has(assign.vehicleId)) {
        vehicleAssignmentsMap.set(assign.vehicleId, []);
      }
      vehicleAssignmentsMap.get(assign.vehicleId).push(assign);
    }

    const validatedBookingsToUpdate = [];

    // Phase 2: Validate allocations per vehicle against database business rules & segment capacity
    for (const [vehicleId, vehicleAssigns] of vehicleAssignmentsMap.entries()) {
      const vehicle = await Vehicle.findOne({ vehicleId });
      if (!vehicle) {
        return res.status(404).json({ message: `Validation failed: Vehicle '${vehicleId}' not found.` });
      }
      if (vehicle.status !== 'Active') {
        return res.status(400).json({ message: `Validation failed: Vehicle '${vehicleId}' is inactive.` });
      }

      const route = vehicle.routeLane ? await Route.findOne({ routeId: vehicle.routeLane }) : null;
      if (!route) {
        return res.status(400).json({ message: `Validation failed: Vehicle '${vehicleId}' has no valid assigned route.` });
      }

      // Fetch current active bookings on this vehicle
      const existingBookings = await Booking.find({
        vehicleId,
        status: { $in: ['Pending', 'PENDING', 'ALLOCATED', 'WAITING_FOR_PICKUP', 'LOADED', 'In Transit', 'IN_TRANSIT'] }
      });

      const simulatedBookingsList = [...existingBookings];

      for (const assign of vehicleAssigns) {
        const booking = await Booking.findOne({ bookingId: assign.bookingId });
        if (!booking) {
          return res.status(404).json({ message: `Validation failed: Booking '${assign.bookingId}' not found.` });
        }

        // Verify pickup and delivery stops exist on vehicle's route
        const stops = route.stopsDetails && route.stopsDetails.length > 0
          ? route.stopsDetails.map(s => s.locationName.toLowerCase())
          : (route.stops || []).map(s => s.toLowerCase());

        const fromIdx = stops.indexOf((booking.fromStop || '').toLowerCase());
        const toIdx = stops.indexOf((booking.toStop || '').toLowerCase());

        if (fromIdx === -1 || toIdx === -1) {
          return res.status(400).json({
            message: `Validation failed: Booking '${booking.bookingId}' stops (${booking.fromStop} ➔ ${booking.toStop}) are not served by route '${route.routeId}'.`
          });
        }

        if (fromIdx >= toIdx) {
          return res.status(400).json({
            message: `Validation failed: Booking '${booking.bookingId}' direction is invalid for route '${route.routeId}'.`
          });
        }

        simulatedBookingsList.push(booking);
        validatedBookingsToUpdate.push({
          booking,
          assign,
          vehicle,
          route
        });
      }

      // Check cumulative segment capacity after adding all proposed allocations
      const capacityCheck = calculateTruckSegmentCapacity(vehicle, route, simulatedBookingsList);

      for (const seg of capacityCheck.segments) {
        if (seg.usedVolume > vehicle.capacityVolume || seg.usedWeight > vehicle.capacityWeight) {
          return res.status(400).json({
            message: `Capacity validation failed for truck '${vehicleId}' on segment '${seg.fromStop} ➔ ${seg.toStop}'. Projected volume (${seg.usedVolume} m³) or weight (${seg.usedWeight} kg) exceeds capacity (${vehicle.capacityVolume} m³, ${vehicle.capacityWeight} kg).`
          });
        }
      }
    }

    // Phase 3: Atomic update execution after 100% validation pass
    const updatePromises = validatedBookingsToUpdate.map(async ({ booking, assign, vehicle, route }) => {
      booking.vehicle = vehicle._id;
      booking.vehicleId = vehicle.vehicleId;
      booking.carrier = vehicle.carrier;
      booking.carrierId = vehicle.carrierId;
      booking.route = route._id;
      booking.routeId = route.routeId;
      
      // Target status transition
      booking.status = assign.status || 'ALLOCATED';
      return booking.save();
    });

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: `Optimizer allocations committed successfully. Updated ${validatedBookingsToUpdate.length} bookings.`,
      updatedCount: validatedBookingsToUpdate.length
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
