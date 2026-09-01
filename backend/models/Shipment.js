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
  shipperId: {
    type: String,
    required: true,
    trim: true,
    index: true
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
      'WAITING_FOR_PICKUP',
      'LOADED',
      'IN_TRANSIT',
      'DELIVERED',
      'CANCELLED'
    ],
    default: 'PENDING',
    index: true
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
  timestamps: true
});

shipmentSchema.index({ customer: 1, requestedDate: -1 });
shipmentSchema.index({ pickupStop: 1, deliveryStop: 1, status: 1 });

const Shipment = mongoose.model('Shipment', shipmentSchema);
export default Shipment;
