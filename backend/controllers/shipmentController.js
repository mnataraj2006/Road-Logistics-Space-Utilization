import mongoose from 'mongoose';
import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import Trip from '../models/Trip.js';
import StopVerification from '../models/StopVerification.js';
import AuditEvent from '../models/AuditEvent.js';
import { getTenantFilter } from '../middleware/auth.js';

/**
 * @desc    Track shipment or booking by identifier with security scoping
 * @route   GET /api/shipments/track/:id
 * @access  Private
 */
export const trackShipment = async (req, res) => {
  try {
    const rawId = (req.params.id || '').trim();
    if (!rawId) {
      return res.status(400).json({ success: false, message: 'Tracking identifier is required.' });
    }

    const isValidOid = mongoose.Types.ObjectId.isValid(rawId);
    const idQuery = {
      $or: [
        { shipmentId: rawId },
        { bookingId: rawId },
        ...(isValidOid ? [{ _id: rawId }] : [])
      ]
    };

    // 1. Look up Shipment and Booking
    let shipment = await Shipment.findOne(idQuery);
    let booking = null;

    if (shipment) {
      booking = await Booking.findOne({
        $or: [
          { shipment: shipment._id },
          { shipmentId: shipment.shipmentId },
          { bookingId: shipment.bookingId }
        ]
      });
    } else {
      booking = await Booking.findOne(idQuery);
      if (booking) {
        shipment = await Shipment.findOne({
          $or: [
            { _id: booking.shipment },
            { shipmentId: booking.shipmentId },
            { bookingId: booking.bookingId }
          ]
        });
      }
    }

    if (!shipment && !booking) {
      return res.status(404).json({
        success: false,
        message: `No shipment or booking found with tracking reference '${rawId}'.`
      });
    }

    // 2. Ownership / Tenant Security Authorization Check
    const user = req.user;
    if (user.role === 'customer' || user.role === 'shipper') {
      const isOwner =
        (shipment && (
          (shipment.customer && String(shipment.customer) === String(user._id)) ||
          shipment.shipperId === user.username ||
          shipment.customerId === user.username
        )) ||
        (booking && (
          (booking.customer && String(booking.customer) === String(user._id)) ||
          (booking.shipper && String(booking.shipper) === String(user._id)) ||
          booking.shipperId === user.username ||
          booking.customerId === user.username
        ));

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'FORBIDDEN',
          message: 'Access denied. You do not have authorization to track this consignment.'
        });
      }
    }

    // 3. Resolve Trip & Operational Progress
    const targetTripId = shipment?.allocatedTripId || booking?.allocatedTripId || null;
    let trip = null;
    let stops = [];
    let stopsList = [];
    let currentStop = shipment?.pickupStop || booking?.fromStop || 'Origin';
    let currentStopIndex = 0;
    let tripStatus = shipment?.status || booking?.status || 'BOOKED';
    let vehicleId = shipment?.allocatedVehicleId || booking?.vehicleId || 'UNASSIGNED';

    if (targetTripId) {
      trip = await Trip.findOne({ tripId: targetTripId }).populate('route').populate('vehicle');
      if (trip) {
        stops = trip.route?.stops || [trip.route?.source, trip.route?.destination].filter(Boolean);
        currentStop = trip.currentStop || stops[0] || currentStop;
        currentStopIndex = trip.currentStopIndex ?? 0;
        tripStatus = trip.status || tripStatus;
        vehicleId = trip.vehicleId || vehicleId;
        stopsList = trip.stopsDetails || trip.stops || [];
      }
    }

    if (stops.length === 0) {
      const p = shipment?.pickupStop || booking?.fromStop || 'Origin';
      const d = shipment?.deliveryStop || booking?.toStop || 'Destination';
      stops = [p, d];
    }

    // 4. Resolve Timeline & Verifications
    const timeline = [];
    const shpId = shipment?.shipmentId || booking?.shipmentId || rawId;

    const auditEvents = await AuditEvent.find({
      $or: [
        { entityId: shpId },
        { entityId: booking?.bookingId },
        ...(targetTripId ? [{ entityId: targetTripId }] : [])
      ]
    }).sort({ timestamp: 1 }).lean();

    auditEvents.forEach(evt => {
      timeline.push({
        title: evt.eventType.replace(/_/g, ' '),
        actor: evt.actor,
        status: evt.resultingState,
        timestamp: evt.timestamp,
        notes: evt.metadata?.notes || ''
      });
    });

    if (targetTripId) {
      const verifications = await StopVerification.find({ tripId: targetTripId }).sort({ timestamp: 1 }).lean();
      verifications.forEach(v => {
        timeline.push({
          title: `Stop ${v.stopIndex + 1} (${v.locationName}) Verified`,
          actor: v.verifiedByUsername || 'Driver/Operator',
          status: v.verificationType,
          timestamp: v.timestamp,
          notes: `Packages Loaded: ${v.boardedPackages?.length || 0}, Packages Delivered: ${v.deliveredPackages?.length || 0}`
        });
      });
    }

    const canonicalCargo = {
      _id: shipment?.shipmentId || booking?.bookingId || rawId,
      id: shipment?.shipmentId || booking?.bookingId || rawId,
      shipmentId: shipment?.shipmentId || booking?.shipmentId || rawId,
      bookingId: booking?.bookingId || shipment?.bookingId,
      status: shipment?.status || booking?.status || 'BOOKED',
      allocationStatus: shipment?.allocationStatus || booking?.allocationStatus || 'AVAILABLE_FOR_OPTIMIZATION',
      physicalStatus: shipment?.physicalStatus || 'WAITING_AT_ORIGIN',
      pickup: shipment?.pickupStop || booking?.fromStop,
      delivery: shipment?.deliveryStop || booking?.toStop,
      pickupStop: shipment?.pickupStop || booking?.fromStop,
      deliveryStop: shipment?.deliveryStop || booking?.toStop,
      volume: shipment?.volume || booking?.volume || 0,
      weight: shipment?.weight || booking?.weight || 0,
      dimensions: shipment?.dimensions || {
        length: shipment?.length || 0,
        width: shipment?.width || 0,
        height: shipment?.height || 0
      },
      length: shipment?.length || 0,
      width: shipment?.width || 0,
      height: shipment?.height || 0,
      fragile: Boolean(shipment?.fragile),
      stackable: shipment?.stackable !== false,
      priority: shipment?.priority || 'STANDARD',
      cargoDescription: shipment?.cargoDescription || booking?.cargoDescription || '',
      vehicleId,
      tripId: targetTripId,
      currentStop,
      currentStopIndex,
      stops,
      stopsList,
      tripStatus,
      timeline
    };

    res.json({
      success: true,
      shipment: canonicalCargo,
      booking: booking || canonicalCargo,
      trip: trip || null
    });
  } catch (error) {
    console.error('trackShipment error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * @desc    Get customer physical shipments (scoped to authenticated user)
 * @route   GET /api/shipments
 * @access  Private
 */
export const getShipments = async (req, res) => {
  try {
    let filter = {};
    if (req.user) {
      if (req.user.role === 'customer' || req.user.role === 'shipper') {
        filter = {
          $or: [
            { customer: req.user._id },
            { customerId: req.user.username },
            { shipperId: req.user.username }
          ]
        };
      } else {
        filter = getTenantFilter(req.user);
      }
    }

    const shipments = await Shipment.find(filter)
      .sort({ createdAt: -1 })
      .limit(100);

    res.json({
      success: true,
      count: shipments.length,
      shipments
    });
  } catch (error) {
    console.error('getShipments error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};
