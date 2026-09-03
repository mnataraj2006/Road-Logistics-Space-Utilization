import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'Heavy Truck', 'Medium Truck', 'Light Van',
      'Mini Truck', 'Pickup Truck', '14 ft Truck', '17 ft Truck', '20 ft Truck', '32 ft Truck', 'Container Truck', 'Other'
    ]
  },
  capacityVolume: {
    type: Number, // in cubic meters (m³)
    required: true,
    min: 0.1
  },
  capacityWeight: {
    type: Number, // in kilograms (kg)
    required: true,
    min: 1
  },
  dimensions: {
    length: { type: Number, default: 0 },
    width: { type: Number, default: 0 },
    height: { type: Number, default: 0 }
  },
  status: {
    type: String,
    required: true,
    enum: [
      'AVAILABLE', 'ASSIGNED', 'IN_TRANSIT', 'MAINTENANCE', 'INACTIVE',
      'Active', 'In Maintenance', 'Out of Service'
    ],
    default: 'AVAILABLE',
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
  carrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  carrierId: {
    type: String,
    required: false,
    trim: true,
    index: true
  },
  routeLane: {
    type: String,
    trim: true,
    default: ''
  },
  baseLocation: {
    type: String,
    trim: true,
    default: ''
  },
  ratePerCbm: {
    type: Number,
    default: 150
  },
  ratePerKg: {
    type: Number,
    default: 5
  },
  assignedDriver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  assignedDriverId: {
    type: String,
    default: ''
  },
  // Operational transit tracking fields
  transitStatus: {
    type: String,
    required: true,
    enum: ['AVAILABLE', 'ASSIGNED', 'DISPATCHED', 'IN_TRANSIT', 'AT_STOP', 'COMPLETED', 'MAINTENANCE', 'INACTIVE', 'READY', 'Idle'],
    default: 'AVAILABLE'
  },
  currentStop: {
    type: String,
    trim: true,
    default: ''
  },
  currentRouteIndex: {
    type: Number,
    default: 0
  },
  activeTripId: {
    type: String,
    trim: true,
    default: null
  },
  currentTripId: {
    type: String,
    trim: true,
    default: null
  },
  tripStartedAt: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);
export default Vehicle;
