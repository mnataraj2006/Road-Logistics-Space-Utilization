import Shipment from '../models/Shipment.js';
import Booking from '../models/Booking.js';
import User from '../models/User.js';
import crypto from 'crypto';

/**
 * Creates or synchronizes a physical Shipment record from a Booking or customer requirement.
 */
export const createShipmentWithBooking = async (data, session = null) => {
  const {
    shipperId,
    customer,
    cargoDescription,
    packageCount = 1,
    length = 0,
    width = 0,
    height = 0,
    volume,
    weight,
    fragile = false,
    stackable = true,
    priority = 'STANDARD',
    pickupStop,
    deliveryStop,
    date,
    revenue,
    routeId,
    vehicleId,
    invoiceNumber = '',
    invoiceValue = 0
  } = data;

  let customerId = customer;
  if (!customerId && shipperId) {
    const user = await User.findOne({ username: shipperId }).session(session);
    if (user) customerId = user._id;
  }

  const suffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  const shipmentId = `SHP-${Date.now()}-${suffix}`;
  const bookingId = data.bookingId || `BKG-${Date.now()}-${suffix}`;

  // 1. Create Shipment
  const shipment = new Shipment({
    shipmentId,
    customer: customerId,
    shipperId: shipperId || 'customer',
    cargoDescription: cargoDescription || '',
    packageCount: Math.max(1, parseInt(packageCount) || 1),
    length: parseFloat(length) || 0,
    width: parseFloat(width) || 0,
    height: parseFloat(height) || 0,
    volume: parseFloat(volume),
    weight: parseFloat(weight),
    fragile: Boolean(fragile),
    stackable: Boolean(stackable),
    priority,
    pickupStop: pickupStop || data.fromStop || '',
    deliveryStop: deliveryStop || data.toStop || '',
    requestedDate: date ? new Date(date) : new Date(),
    status: 'BOOKED',
    invoiceNumber,
    invoiceValue
  });
  await shipment.save({ session });

  // Compute deterministic pricing if not fully specified
  const { calculateDeterministicPrice } = await import('./pricingService.js');
  const pricingStatement = calculateDeterministicPrice({
    distanceKm: data.distanceKm || 200,
    volume: parseFloat(volume),
    weight: parseFloat(weight),
    cargoType: fragile ? 'FRAGILE' : 'STANDARD',
    serviceLevel: priority,
    truckType: data.truckType || 'Container Truck',
    segmentUtilization: data.segmentUtilization || 50
  });

  const finalBookingPrice = parseFloat(revenue) > 0 ? parseFloat(revenue) : pricingStatement.finalPrice;

  // 2. Create corresponding commercial Booking
  const booking = new Booking({
    bookingId,
    shipment: shipment._id,
    shipmentId: shipment.shipmentId,
    customer: customerId,
    shipper: customerId,
    shipperId: shipperId || 'customer',
    vehicleId: vehicleId || 'UNASSIGNED',
    routeId: routeId || 'UNASSIGNED',
    date: date ? new Date(date) : new Date(),
    fromStop: pickupStop || data.fromStop || '',
    toStop: deliveryStop || data.toStop || '',
    requestedSegment: {
      fromStop: pickupStop || data.fromStop || '',
      toStop: deliveryStop || data.toStop || ''
    },
    requestedCapacity: {
      volume: parseFloat(volume),
      weight: parseFloat(weight)
    },
    volume: parseFloat(volume),
    weight: parseFloat(weight),
    revenue: finalBookingPrice,
    price: finalBookingPrice,
    pricingRuleVersion: pricingStatement.pricingRuleVersion,
    pricingBreakdown: pricingStatement,
    paymentState: 'ESCROW',
    cargoDescription: cargoDescription || '',
    invoiceNumber,
    invoiceValue,
    status: 'PENDING'
  });
  await booking.save({ session });

  return { shipment, booking, pricing: pricingStatement };
};

/**
 * Migration helper: ensures any existing legacy Booking documents have backing Shipment documents.
 */
export const ensureShipmentsForLegacyBookings = async () => {
  const unlinkedBookings = await Booking.find({
    $or: [{ shipment: null }, { shipment: { $exists: false } }, { shipmentId: null }, { shipmentId: '' }]
  }).limit(500);

  let migratedCount = 0;
  for (const bkg of unlinkedBookings) {
    let user = await User.findOne({ username: bkg.shipperId });
    const shipmentId = `SHP-LEGACY-${bkg.bookingId}`;
    
    let shipment = await Shipment.findOne({ shipmentId });
    if (!shipment) {
      shipment = await Shipment.create({
        shipmentId,
        customer: user ? user._id : bkg.shipper || bkg._id,
        shipperId: bkg.shipperId || 'shipper',
        cargoDescription: bkg.cargoDescription || '',
        packageCount: 1,
        volume: bkg.volume || 1,
        weight: bkg.weight || 10,
        pickupStop: bkg.fromStop || 'Origin',
        deliveryStop: bkg.toStop || 'Destination',
        requestedDate: bkg.date || new Date(),
        status: bkg.status ? bkg.status.toUpperCase() : 'PENDING'
      });
    }

    bkg.shipment = shipment._id;
    bkg.shipmentId = shipment.shipmentId;
    bkg.customer = shipment.customer;
    await bkg.save();
    migratedCount++;
  }

  return migratedCount;
};
