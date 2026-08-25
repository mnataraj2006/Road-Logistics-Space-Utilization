import mongoose from 'mongoose';

const vehicleSchema = new mongoose.Schema({
  vehicleId: {
    type: String,
    required: true,
    unique: true,
    trim: true
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
    required: true
  },
  capacityWeight: {
    type: Number, // in kilograms (kg)
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['Active', 'In Maintenance', 'Out of Service'],
    default: 'Active'
  },
  carrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  carrierId: {
    type: String,
    required: true,
    trim: true
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
  transitStatus: {
    type: String,
    required: true,
    enum: ['READY', 'DISPATCHED', 'IN_TRANSIT', 'AT_STOP', 'COMPLETED', 'Idle'],
    default: 'READY'
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
    default: ''
  },
  assignedDriverId: {
    type: String,
    default: ''
  },
  tripStartedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Vehicle = mongoose.model('Vehicle', vehicleSchema);
export default Vehicle;
