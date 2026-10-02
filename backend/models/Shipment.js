import mongoose from 'mongoose';

const shipmentSchema = new mongoose.Schema({
  shipmentId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  customerId: {
    type: String,
    trim: true
  },
  shipperId: {
    type: String,
    required: true,
    trim: true,
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
  cargoDescription: {
    type: String,
    trim: true,
    default: ''
  },
  packageCount: {
    type: Number,
    required: true,
    default: 1,
    min: 1
  },
  length: {
    type: Number, // in meters
    default: 0,
    min: 0
  },
  width: {
    type: Number, // in meters
    default: 0,
    min: 0
  },
  height: {
    type: Number, // in meters
    default: 0,
    min: 0
  },
  volume: {
    type: Number, // in m³
    required: true,
    min: 0.001
  },
  weight: {
    type: Number, // in kg
    required: true,
    min: 0.1
  },
  fragile: {
    type: Boolean,
    default: false
  },
  stackable: {
    type: Boolean,
    default: true
  },
  maxStackWeight: {
    type: Number, // in kg
    default: 1000,
    min: 0
  },
  allowRotation: {
    type: Boolean,
    default: true
  },
  priority: {
    type: String,
    enum: ['STANDARD', 'EXPRESS', 'URGENT'],
    default: 'STANDARD'
  },
  pickupStop: {
    type: String,
    required: true,
    trim: true
  },
  deliveryStop: {
    type: String,
    required: true,
    trim: true
  },
  requestedDate: {
    type: Date,
    required: true,
    index: true
  },
  status: {
    type: String,
    required: true,
    enum: [
      'DRAFT',
      'PENDING',
      'BOOKED',
      'ALLOCATED',
      'LOCKED',
      'WAITING_FOR_PICKUP',
      'WAITING_AT_ORIGIN',
      'READY_TO_LOAD',
      'LOADED',
      'ONBOARD',
      'IN_TRANSIT',
      'DELIVERED',
      'CANCELLED'
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
      'READY_TO_LOAD',
      'WAITING_AT_ORIGIN',
      'LOADED',
      'ONBOARD',
      'DELIVERED',
      'CANCELLED'
    ],
    default: 'AVAILABLE_FOR_OPTIMIZATION',
    index: true
  },
  physicalStatus: {
    type: String,
    enum: [
      'WAITING_AT_ORIGIN',
      'READY_TO_LOAD',
      'ONBOARD',
      'DELIVERED',
      'CANCELLED'
    ],
    default: 'WAITING_AT_ORIGIN',
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
  invoiceNumber: {
    type: String,
    trim: true,
    default: ''
  },
  invoiceValue: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Canonical dimensions mapping: enables both s.dimensions.length and s.length
shipmentSchema.virtual('dimensions').get(function() {
  return {
    length: this.length || 0,
    width: this.width || 0,
    height: this.height || 0
  };
}).set(function(v) {
  if (v) {
    if (v.length !== undefined) this.length = v.length;
    if (v.width !== undefined) this.width = v.width;
    if (v.height !== undefined) this.height = v.height;
    if (v.dx !== undefined) this.length = v.dx;
    if (v.dy !== undefined) this.width = v.dy;
    if (v.dz !== undefined) this.height = v.dz;
  }
});

// Canonical date mapping
shipmentSchema.virtual('date').get(function() {
  return this.requestedDate;
}).set(function(v) {
  this.requestedDate = v;
});

// Canonical stop mappings for interoperability with Booking
shipmentSchema.virtual('fromStop').get(function() {
  return this.pickupStop;
}).set(function(v) {
  this.pickupStop = v;
});

shipmentSchema.virtual('toStop').get(function() {
  return this.deliveryStop;
}).set(function(v) {
  this.deliveryStop = v;
});

shipmentSchema.index({ customer: 1, requestedDate: -1 });
shipmentSchema.index({ pickupStop: 1, deliveryStop: 1, status: 1 });
shipmentSchema.index({ allocationStatus: 1, isLocked: 1, allocatedTripId: 1 });

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
