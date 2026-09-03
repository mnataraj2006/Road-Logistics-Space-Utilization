import mongoose from 'mongoose';

const bookingSchema = new mongoose.Schema({
  bookingId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  shipment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Shipment',
    required: false
  },
  shipmentId: {
    type: String,
    trim: true,
    index: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  shipper: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  shipperId: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  carrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false,
    default: null
  },
  carrierId: {
    type: String,
    required: false,
    trim: true,
    default: 'UNASSIGNED',
    index: true
  },
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LogisticsCompany',
    required: false,
    index: true
  },
  logisticsCompanyName: {
    type: String,
    trim: true,
    default: ''
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: false,
    default: null
  },
  vehicleId: {
    type: String,
    required: false,
    trim: true,
    default: 'UNASSIGNED',
    index: true
  },
  route: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Route',
    required: false,
    default: null
  },
  routeId: {
    type: String,
    required: false,
    trim: true,
    default: 'UNASSIGNED',
    index: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  requestedRoute: {
    type: String,
    default: ''
  },
  requestedSegment: {
    fromStop: { type: String, default: '' },
    toStop: { type: String, default: '' }
  },
  requestedCapacity: {
    volume: { type: Number, default: 0 },
    weight: { type: Number, default: 0 }
  },
  fromStop: {
    type: String,
    trim: true,
    default: ''
  },
  toStop: {
    type: String,
    trim: true,
    default: ''
  },
  weight: {
    type: Number, // in kg
    required: true,
    min: 0.1
  },
  volume: {
    type: Number, // in m³
    required: true,
    min: 0.001
  },
  price: {
    type: Number,
    default: 0
  },
  revenue: {
    type: Number, // in INR
    required: true
  },
  pricingRuleVersion: {
    type: String,
    default: 'PRICING-RULE-v2.1.0-DETERMINISTIC'
  },
  pricingBreakdown: {
    type: Object,
    default: {}
  },
  paymentState: {
    type: String,
    enum: ['UNPAID', 'ESCROW', 'RELEASED', 'REFUNDED'],
    default: 'ESCROW'
  },
  delayHours: {
    type: Number,
    default: 0
  },
  cargoDescription: {
    type: String,
    trim: true,
    default: ''
  },
  invoiceNumber: {
    type: String,
    trim: true,
    default: ''
  },
  invoiceValue: {
    type: Number,
    default: 0
  },
  fragile: {
    type: Boolean,
    default: false
  },
  stackable: {
    type: Boolean,
    default: true
  },
  packageCount: {
    type: Number,
    default: 1,
    min: 1
  },
  length: {
    type: Number,
    default: 0
  },
  width: {
    type: Number,
    default: 0
  },
  height: {
    type: Number,
    default: 0
  },
  maxStackWeight: {
    type: Number,
    default: 1000
  },
  allowRotation: {
    type: Boolean,
    default: true
  },
  cargoCategory: {
    type: String,
    enum: ['GENERAL', 'ELECTRONICS', 'PERISHABLE', 'HAZMAT', 'PHARMACEUTICAL', 'FRAGILE_GLASS', 'AUTOMOTIVE', 'TEXTILE'],
    default: 'GENERAL'
  },
  priority: {
    type: String,
    enum: ['STANDARD', 'EXPRESS', 'URGENT'],
    default: 'STANDARD'
  },
  status: {
    type: String,
    required: true,
    enum: [
      'Pending', 'PENDING',
      'CONFIRMED',
      'ALLOCATED',
      'LOCKED',
      'WAITING_FOR_PICKUP',
      'LOADED',
      'In Transit', 'IN_TRANSIT',
      'DELIVERED', 'Completed',
      'Cancelled', 'CANCELLED'
    ],
    default: 'PENDING',
    index: true
  },
  allocationStatus: {
    type: String,
    enum: [
      'AVAILABLE_FOR_OPTIMIZATION',
      'SELECTED_FOR_OPTIMIZATION',
      'OPTIMIZED',
      'ALLOCATED',
      'LOCKED',
      'LOADED',
      'DELIVERED',
      'CANCELLED'
    ],
    default: 'AVAILABLE_FOR_OPTIMIZATION',
    index: true
  },
  isLocked: {
    type: Boolean,
    default: false,
    index: true
  },
  lockedAt: {
    type: Date,
    default: null
  },
  allocatedTripId: {
    type: String,
    trim: true,
    default: null,
    index: true
  },
  allocatedLoadPlanId: {
    type: String,
    trim: true,
    default: null,
    index: true
  },
  allocatedVehicleId: {
    type: String,
    trim: true,
    default: null,
    index: true
  },
  allocatedAt: {
    type: Date,
    default: null
  },
  loadedAt: {
    type: Date,
    default: null
  },
  deliveredAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// Sync compound indexes
bookingSchema.index({ vehicleId: 1, date: 1 });
bookingSchema.index({ routeId: 1, date: 1 });
bookingSchema.index({ shipperId: 1, status: 1 });
bookingSchema.index({ allocationStatus: 1, isLocked: 1, allocatedTripId: 1 });

/**
 * Validates allowed status transitions for package bookings
 * PENDING -> ALLOCATED -> WAITING_FOR_PICKUP -> IN_TRANSIT -> DELIVERED -> COMPLETED
 */
export const isValidBookingStatusTransition = (currentStatus, targetStatus) => {
  if (!currentStatus || !targetStatus) return false;
  const curr = currentStatus.toUpperCase();
  const tgt = targetStatus.toUpperCase();

  if (curr === tgt) return true; // Idempotent same-state check

  const validTransitions = {
    'PENDING': ['CONFIRMED', 'ALLOCATED', 'WAITING_FOR_PICKUP', 'IN_TRANSIT', 'CANCELLED'],
    'CONFIRMED': ['ALLOCATED', 'WAITING_FOR_PICKUP', 'IN_TRANSIT', 'CANCELLED'],
    'ALLOCATED': ['WAITING_FOR_PICKUP', 'LOADED', 'IN_TRANSIT', 'CANCELLED'],
    'WAITING_FOR_PICKUP': ['LOADED', 'IN_TRANSIT', 'CANCELLED'],
    'LOADED': ['IN_TRANSIT', 'DELIVERED', 'COMPLETED', 'CANCELLED'],
    'IN_TRANSIT': ['DELIVERED', 'COMPLETED', 'CANCELLED'],
    'DELIVERED': ['COMPLETED'],
    'COMPLETED': [],
    'CANCELLED': []
  };

  const allowed = validTransitions[curr] || [];
  return allowed.includes(tgt);
};

const Booking = mongoose.model('Booking', bookingSchema);
export default Booking;
