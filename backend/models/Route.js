import mongoose from 'mongoose';

const stopDetailsSchema = new mongoose.Schema({
  stopId: { type: String, required: true },
  sequenceNumber: { type: Number, required: true },
  locationName: { type: String, required: true, trim: true },
  qrToken: { type: String, required: true },
  stopType: {
    type: String,
    enum: ['ORIGIN', 'PICKUP', 'DELIVERY', 'PICKUP_AND_DELIVERY', 'INTERMEDIATE', 'FINAL_DESTINATION'],
    default: 'INTERMEDIATE'
  },
  status: {
    type: String,
    enum: ['Upcoming', 'Ready', 'Verified', 'Processing', 'Completed'],
    default: 'Upcoming'
  },
  plannedArrival: { type: Date },
  actualArrival: { type: Date },
  completedAt: { type: Date }
}, { _id: false });

const routeSchema = new mongoose.Schema({
  routeId: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    index: true
  },
  source: {
    type: String,
    required: true,
    trim: true
  },
  destination: {
    type: String,
    required: true,
    trim: true
  },
  distance: {
    type: Number, // in kilometers (km)
    required: true,
    min: 1
  },
  baseRate: {
    type: Number, // price per cubic meter (INR/m³)
    required: true,
    min: 1
  },
  stops: {
    type: [String],
    default: []
  },
  stopsDetails: {
    type: [stopDetailsSchema],
    default: []
  },
  active: {
    type: Boolean,
    default: true,
    index: true
  },
  carrier: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  carrierId: {
    type: String,
    trim: true,
    index: true
  },
  currentStopIndex: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true
});

const Route = mongoose.model('Route', routeSchema);
export default Route;
